import readline from 'node:readline';
import { style } from './terminal';

/** Levée quand l'utilisateur quitte (Ctrl+C, fin de l'entrée standard) */
export class PromptAbortedError extends Error {
    constructor() {
        super('Saisie interrompue');
        this.name = 'PromptAbortedError';
    }
}

/** Renvoie null si la valeur est valide, sinon le message d'erreur à afficher */
export type Validator = (value: string) => string | null;

export interface Choice<T> {
    label: string;
    value: T;
    hint?: string;
}

const YES = new Set(['o', 'oui', 'y', 'yes']);
const NO = new Set(['n', 'non', 'no']);

/**
 * Questions posées dans le terminal
 *
 * @remarks
 * Les lignes reçues sont mises en file d'attente : une entrée redirigée
 * (`npm run create:embed < reponses.txt`) fonctionne comme une saisie au clavier.
 */
export class Prompter {
    private readonly rl: readline.Interface;
    private readonly pending: string[] = [];
    private waiting: ((line: string | null) => void) | null = null;
    private closed = false;

    constructor(
        input: NodeJS.ReadableStream = process.stdin,
        private readonly output: NodeJS.WritableStream = process.stdout
    ) {
        this.rl = readline.createInterface({ input, output, terminal: Boolean((input as { isTTY?: boolean }).isTTY) });
        this.rl.on('line', (line) => this.receive(line));
        this.rl.on('close', () => this.receive(null));
        this.rl.on('SIGINT', () => this.rl.close());
    }

    public close(): void {
        this.rl.close();
    }

    /** Affiche une ligne (sans attendre de réponse) */
    public say(text = ''): void {
        this.output.write(`${text}\n`);
    }

    /**
     * Texte sur une ligne
     *
     * @param options.default - Valeur si l'utilisateur valide sans rien saisir
     * @param options.allowEmpty - Accepte une réponse vide (renvoie '')
     */
    public async text(
        question: string,
        options: { default?: string; allowEmpty?: boolean; validate?: Validator } = {}
    ): Promise<string> {
        const suffix = options.default ? style.dim(` (${options.default})`) : '';
        for (;;) {
            const answer = (await this.ask(`${style.cyan('?')} ${question}${suffix} : `)).trim();
            const value = answer || options.default || '';
            if (!value && !options.allowEmpty) {
                this.say(style.red('  Une valeur est requise.'));
                continue;
            }
            const error = value && options.validate ? options.validate(value) : null;
            if (!error) return value;
            this.say(style.red(`  ${error}`));
        }
    }

    /** Question oui / non */
    public async confirm(question: string, defaultValue: boolean): Promise<boolean> {
        const hint = style.dim(defaultValue ? ' (O/n)' : ' (o/N)');
        for (;;) {
            const answer = (await this.ask(`${style.cyan('?')} ${question}${hint} : `)).trim().toLowerCase();
            if (!answer) return defaultValue;
            if (YES.has(answer)) return true;
            if (NO.has(answer)) return false;
            this.say(style.red('  Répondez par o (oui) ou n (non).'));
        }
    }

    /** Choix dans une liste numérotée */
    public async choose<T>(question: string, choices: Choice<T>[], defaultIndex = 0): Promise<T> {
        this.say(`${style.cyan('?')} ${question}`);
        choices.forEach((choice, index) => {
            const hint = choice.hint ? style.dim(`  ${choice.hint}`) : '';
            this.say(`  ${style.bold(String(index + 1).padStart(2))}. ${choice.label}${hint}`);
        });

        const answer = await this.text('Votre choix', {
            default: String(defaultIndex + 1),
            validate: (value) => {
                const number = Number(value);
                return Number.isInteger(number) && number >= 1 && number <= choices.length
                    ? null
                    : `Saisissez un numéro entre 1 et ${choices.length}.`;
            },
        });
        return choices[Number(answer) - 1].value;
    }

    /**
     * Texte sur plusieurs lignes, terminé par une ligne contenant uniquement "."
     *
     * @returns Les lignes saisies (lignes vides conservées), [] si rien n'a été saisi
     */
    public async multiline(question: string): Promise<string[]> {
        this.say(`${style.cyan('?')} ${question} ${style.dim('(plusieurs lignes possibles, terminez par une ligne "." seule)')}`);
        const lines: string[] = [];
        for (;;) {
            const line = await this.ask(style.dim('  | '));
            if (line.trim() === '.') break;
            lines.push(line.trimEnd());
        }
        while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
        return lines;
    }

    private ask(prompt: string): Promise<string> {
        if (this.pending.length > 0) {
            this.output.write(prompt);
            const line = this.pending.shift()!;
            if (!this.isInteractive()) this.output.write(`${line}\n`);
            return Promise.resolve(line);
        }
        if (this.closed) return Promise.reject(new PromptAbortedError());

        this.rl.setPrompt(prompt);
        this.rl.prompt();
        return new Promise((resolve, reject) => {
            this.waiting = (line) => (line === null ? reject(new PromptAbortedError()) : resolve(line));
        });
    }

    private receive(line: string | null): void {
        if (line === null) this.closed = true;
        const waiting = this.waiting;
        if (waiting) {
            this.waiting = null;
            if (line !== null && !this.isInteractive()) this.output.write(`${line}\n`);
            waiting(line);
        } else if (line !== null) {
            this.pending.push(line);
        }
    }

    private isInteractive(): boolean {
        return Boolean((this.rl as unknown as { terminal?: boolean }).terminal);
    }
}

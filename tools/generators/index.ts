import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../src/shared/i18n/locales';
import { Generator, GeneratorReport, GeneratorType } from './shared/generator';
import { SpecValidationError } from './shared/input';
import { Prompter, PromptAbortedError } from './shared/Prompter';
import { FileChange, FileChangeSet, PROJECT_ROOT, detectEol, paths } from './shared/project';
import { heading, style } from './shared/terminal';
import { GeneratorContext } from './shared/text';
import { featureGenerator } from './feature/generator';
import { embedGenerator } from './embed/generator';
import { componentGenerator } from './component/generator';
import { commandGenerator } from './command/generator';

/**
 * Générateurs de code EyeBOT : `npm run create[:<type>] [-- options]`
 *
 * Deux modes, mêmes fichiers produits :
 * - interactif (humain) : questions dans le terminal, aperçu, confirmation
 * - spec JSON (IA, scripts) : `--spec <fichier|->`, validation complète, aucune question.
 *   Un tableau de specs est traité comme un lot (une feature créée en [0] est visible de [1]).
 *
 * Outil de développement : absent du build (`tsc` ne compile que src/) et du serveur
 * de production (exclu par le sparse-checkout du workflow de release).
 */

const GENERATORS: Record<GeneratorType, Generator<unknown>> = {
    feature: featureGenerator,
    embed: embedGenerator,
    component: componentGenerator,
    command: commandGenerator,
};
const TYPES = Object.keys(GENERATORS) as GeneratorType[];

interface Options {
    type?: GeneratorType;
    spec?: string;
    dryRun: boolean;
    json: boolean;
    help: boolean;
    example: boolean;
    preview: boolean;
}

function parseArgs(argv: string[]): Options {
    const options: Options = { dryRun: false, json: false, help: false, example: false, preview: false };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if ((TYPES as string[]).includes(arg)) options.type = arg as GeneratorType;
        else if (arg === '--spec') options.spec = argv[++index] ?? '-';
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--json') options.json = true;
        else if (arg === '--example') options.example = true;
        else if (arg === '--preview') options.preview = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`Argument inconnu : ${arg} (--help pour l'aide)`);
    }
    return options;
}

function help(type?: GeneratorType): string {
    const selected = type ? [GENERATORS[type]] : Object.values(GENERATORS);
    return [
        'Usage : npm run create[:<type>] [-- options]     types : ' + TYPES.join(', '),
        '',
        '  (sans option)       mode interactif',
        '  --spec <f|->        mode non interactif : spec JSON (fichier, ou "-" = entrée standard)',
        '                      objet (type déduit du script, sinon champ "type") ou tableau = lot',
        '  --dry-run           valide et liste les fichiers sans rien écrire',
        '  --json              résultat en JSON (mode --spec)',
        '  --preview           affiche aussi l\'aperçu (mode --spec)',
        '  --example           affiche une spec d\'exemple',
        '',
        ...selected.flatMap((generator) => [`== ${generator.type} : ${generator.description}`, generator.specHelp, '']),
    ].join('\n');
}

function createContext(): GeneratorContext {
    const defaultEol = detectEol(fs.readFileSync(paths.embedColors(PROJECT_ROOT), 'utf8'));
    return { root: PROJECT_ROOT, locales: SUPPORTED_LOCALES, defaultLocale: DEFAULT_LOCALE, changes: new FileChangeSet(defaultEol) };
}

function relative(filePath: string): string {
    return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

const STATUS_MARK: Record<FileChange['status'], string> = { created: '+', modified: '~', deleted: '-' };

// ---------------------------------------------------------------------------
// Mode spec JSON
// ---------------------------------------------------------------------------

function readSpecSource(source: string): unknown {
    const text = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(source), 'utf8');
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new SpecValidationError([`JSON invalide : ${error instanceof Error ? error.message : String(error)}`]);
    }
}

/** Valide et planifie chaque spec du lot ; renvoie les erreurs de toutes les specs */
function planBatch(input: unknown, options: Options, context: GeneratorContext) {
    const items = Array.isArray(input) ? input : [input];
    const errors: string[] = [];
    const reports: (GeneratorReport & { type: GeneratorType; preview?: string })[] = [];

    items.forEach((item, index) => {
        const where = Array.isArray(input) ? `[${index}]` : '';
        const declared = item && typeof item === 'object' ? (item as { type?: unknown }).type : undefined;
        const type = (declared ?? options.type) as GeneratorType | undefined;
        if (!type || !TYPES.includes(type)) {
            errors.push(`${where || 'spec'}.type : ${TYPES.join(' | ')} attendu`);
            return;
        }
        if (declared && options.type && declared !== options.type) {
            errors.push(`${where || 'spec'}.type : "${String(declared)}" alors que le script est create:${options.type}`);
            return;
        }
        try {
            const generator = GENERATORS[type];
            const spec = generator.fromInput(item, where, context);
            const preview = options.preview && generator.preview ? generator.preview(spec, context) : undefined;
            reports.push({ type, preview, ...generator.plan(spec, context) });
        } catch (error) {
            if (error instanceof SpecValidationError) errors.push(...error.errors);
            else errors.push(`${where || 'spec'} : ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    return { errors, reports };
}

function runSpec(options: Options): void {
    const context = createContext();
    let result: ReturnType<typeof planBatch>;
    try {
        result = planBatch(readSpecSource(options.spec!), options, context);
    } catch (error) {
        result = { errors: error instanceof SpecValidationError ? error.errors : [String(error)], reports: [] };
    }

    if (result.errors.length > 0) {
        process.exitCode = 1;
        if (options.json) process.stdout.write(`${JSON.stringify({ ok: false, errors: result.errors })}\n`);
        else process.stdout.write(`ERREUR : rien n'a été écrit\n${result.errors.map((error) => `- ${error}`).join('\n')}\n`);
        return;
    }

    const changes = context.changes.changes();
    if (!options.dryRun) context.changes.commit();

    if (options.json) {
        process.stdout.write(`${JSON.stringify({
            ok: true,
            dryRun: options.dryRun,
            files: changes.map((change) => ({ path: relative(change.filePath), status: change.status })),
            reports: result.reports,
        })}\n`);
        return;
    }

    const lines = [options.dryRun ? 'DRY-RUN : rien n\'a été écrit' : 'OK'];
    lines.push(...changes.map((change) => `${STATUS_MARK[change.status]} ${relative(change.filePath)}`));
    for (const report of result.reports) {
        if (report.preview) lines.push(`[${report.type}] aperçu :`, report.preview);
        if (report.usage) lines.push(`[${report.type}] usage :`, report.usage);
        lines.push(...report.notes.map((note) => `[${report.type}] ${note}`));
    }
    process.stdout.write(`${lines.join('\n')}\n`);
}

// ---------------------------------------------------------------------------
// Mode interactif
// ---------------------------------------------------------------------------

async function runInteractive(options: Options): Promise<void> {
    const prompter = new Prompter();
    try {
        prompter.say(style.bold('Générateurs EyeBOT') + style.dim(options.dryRun ? '  (dry-run : aucun fichier ne sera écrit)' : ''));
        prompter.say(style.dim('Ctrl+C pour quitter à tout moment : rien n\'est écrit avant la confirmation finale.'));

        const type = options.type ?? await prompter.choose('Que voulez-vous créer ?', TYPES.map((value) => ({
            label: value,
            value,
            hint: GENERATORS[value].description,
        })));
        const generator = GENERATORS[type];
        const context = createContext();
        const spec = await generator.interactive(prompter, context);

        if (generator.preview) {
            prompter.say(heading('Aperçu'));
            prompter.say(generator.preview(spec, context));
        }

        const report = generator.plan(spec, context);
        prompter.say(heading('Fichiers'));
        for (const change of context.changes.changes()) {
            const marks = { created: style.green('+ créé    '), modified: style.yellow('~ modifié  '), deleted: style.dim('- supprimé') };
            prompter.say(`  ${marks[change.status]} ${relative(change.filePath)}`);
        }

        if (options.dryRun) {
            prompter.say(style.dim('\nDry-run : aucun fichier écrit.'));
            return;
        }
        if (!(await prompter.confirm('Générer ces fichiers ?', true))) {
            prompter.say('Annulé : aucun fichier écrit.');
            return;
        }

        context.changes.commit();
        prompter.say(style.green('\nFichiers générés.'));
        if (report.usage) {
            prompter.say(heading('Utilisation'));
            prompter.say(report.usage);
        }
        if (report.notes.length > 0) {
            prompter.say(heading('Étapes suivantes'));
            report.notes.forEach((note) => prompter.say(`  - ${note}`));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        prompter.say(error instanceof PromptAbortedError ? style.yellow('\nAbandon : aucun fichier écrit.') : style.red(`\nErreur : ${message}`));
        process.exitCode = 1;
    } finally {
        prompter.close();
    }
}

async function main(): Promise<void> {
    let options: Options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
        return;
    }

    if (options.help) {
        process.stdout.write(`${help(options.type)}\n`);
    } else if (options.example) {
        const examples = options.type ? GENERATORS[options.type].example : TYPES.map((type) => GENERATORS[type].example);
        process.stdout.write(`${JSON.stringify(examples, null, 2)}\n`);
    } else if (options.spec) {
        runSpec(options);
    } else {
        await runInteractive(options);
    }
}

void main();

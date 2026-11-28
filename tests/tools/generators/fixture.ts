import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { Prompter } from '../../../tools/generators/shared/Prompter';
import { FileChangeSet } from '../../../tools/generators/shared/project';
import { GeneratorContext } from '../../../tools/generators/shared/text';

/**
 * Projet minimal pour tester les générateurs sans toucher au dépôt
 *
 * - `settings` : translations.ts sans type Translator (comme la vraie feature settings)
 * - `tracer` : translations.ts complet, une commande /register et un menu existants
 * - la vraie palette EmbedColors
 */

const ROOT = path.join(__dirname, '..', '..', '..');
export const LOCALES = ['fr', 'en', 'es'];

function write(root: string, relative: string, content: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

export function createFixtureProject(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eyebot-generators-'));
    for (const locale of LOCALES) {
        write(root, `src/features/tracer/locales/${locale}.json`, '{\r\n  "labels": {\r\n    "none": "Aucune"\r\n  }\r\n}\r\n');
        write(root, `src/features/settings/locales/${locale}.json`, '{\n  "language": {\n    "error": "Erreur"\n  }\n}\n');
    }
    write(root, 'src/features/tracer/translations.ts', [
        "import fr from './locales/fr.json';",
        "import { CommonMessages, Translator } from '../../shared/i18n';",
        'export type TracerMessages = typeof fr;',
        'export type TracerTranslator = Translator<CommonMessages & TracerMessages>;',
        '',
    ].join('\n'));
    write(root, 'src/features/settings/translations.ts', [
        "import fr from './locales/fr.json';",
        "import { Locale, createFeatureTranslations } from '../../shared/i18n';",
        'export type SettingsMessages = typeof fr;',
        '',
    ].join('\n'));
    write(root, 'src/features/tracer/commands/RegisterCommand.ts', "export default class RegisterCommand {\n    public name = 'register';\n}\n");
    write(root, 'src/features/tracer/components/SelectMenus.ts', "export function buildPlayerSelectMenu() {\n    return 'select-player';\n}\n");
    write(root, 'src/features/tracer/events/.gitkeep', '');
    fs.mkdirSync(path.join(root, 'src/shared/embeds'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'src/shared/embeds/EmbedColors.ts'), path.join(root, 'src/shared/embeds/EmbedColors.ts'));
    return root;
}

export function createContext(root: string): GeneratorContext {
    return { root, locales: LOCALES, defaultLocale: 'fr', changes: new FileChangeSet('\n') };
}

/** Fichiers prévus, relatifs à la racine : "+ chemin" (créé), "~ chemin" (modifié), "- chemin" (supprimé) */
export function plannedFiles(context: GeneratorContext): string[] {
    const marks = { created: '+', modified: '~', deleted: '-' };
    return context.changes.changes().map((change) => `${marks[change.status]} ${path.relative(context.root, change.filePath).replace(/\\/g, '/')}`);
}

/** Contenu prévu d'un fichier (relatif à la racine) */
export function plannedContent(context: GeneratorContext, relative: string): string {
    return context.changes.read(path.join(context.root, relative)) ?? '';
}

/** Lance un assistant avec des réponses écrites à l'avance (une par ligne) */
export async function withAnswers<T>(answers: string[], run: (prompter: Prompter) => Promise<T>): Promise<T> {
    const input = new PassThrough();
    const output = new Writable({ write: (_chunk, _encoding, callback) => callback() });
    const prompter = new Prompter(input, output);
    input.end(`${answers.join('\n')}\n`);
    try {
        return await run(prompter);
    } finally {
        prompter.close();
    }
}

export function removeFixture(root: string): void {
    fs.rmSync(root, { recursive: true, force: true });
}

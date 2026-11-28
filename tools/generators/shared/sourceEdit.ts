/**
 * Modifications ciblées de fichiers TypeScript existants (imports, exports, palette...)
 *
 * Fonctions pures travaillant sur des textes en fins de ligne `\n` : la conversion
 * vers les fins de ligne du fichier est faite à l'écriture (cf. FileChangeSet).
 */

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ajoute un bloc à la fin d'un fichier, séparé par une ligne vide */
export function appendBlock(source: string, block: string): string {
    const trimmed = source.trimEnd();
    return trimmed ? `${trimmed}\n\n${block.trimEnd()}\n` : `${block.trimEnd()}\n`;
}

/**
 * Garantit que des noms sont importés depuis un module
 *
 * @remarks
 * Complète l'import existant (`import { A } from 'x'` → `import { A, B } from 'x'`),
 * sinon ajoute une ligne d'import après le dernier import du fichier.
 */
export function ensureNamedImports(source: string, moduleSpecifier: string, names: string[]): string {
    const importRegex = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${escapeRegex(moduleSpecifier)}';`);
    const existing = importRegex.exec(source);

    if (existing) {
        const current = existing[1].split(',').map((name) => name.trim()).filter(Boolean);
        const missing = names.filter((name) => !current.includes(name));
        if (missing.length === 0) return source;
        const statement = `import { ${[...current, ...missing].join(', ')} } from '${moduleSpecifier}';`;
        return source.replace(importRegex, statement);
    }

    const statement = `import { ${[...new Set(names)].join(', ')} } from '${moduleSpecifier}';`;
    const imports = Array.from(source.matchAll(/^import [^;]+;[^\S\n]*$/gm));
    if (imports.length === 0) return source.trim() ? `${statement}\n\n${source}` : `${statement}\n`;

    const last = imports[imports.length - 1];
    const insertAt = last.index + last[0].length;
    return `${source.slice(0, insertAt)}\n${statement}${source.slice(insertAt)}`;
}

/** Garantit une ligne `export * from './module';` (ajoutée après la dernière du même type) */
export function ensureExportStar(source: string, modulePath: string): string {
    const statement = `export * from '${modulePath}';`;
    if (source.includes(statement)) return source;

    const exports = Array.from(source.matchAll(/^export \* from '[^']+';[^\S\n]*$/gm));
    if (exports.length === 0) return appendBlock(source, statement);

    const last = exports[exports.length - 1];
    const insertAt = last.index + last[0].length;
    return `${source.slice(0, insertAt)}\n${statement}${source.slice(insertAt)}`;
}

/** Noms des fonctions exportées d'un fichier (`export function buildXEmbed(`) */
export function listExportedFunctions(source: string): string[] {
    return Array.from(source.matchAll(/^export (?:async )?function (\w+)/gm), (match) => match[1]);
}

export interface PaletteColor {
    name: string;
    hex: string;
    comment?: string;
}

/** Couleurs déclarées dans `shared/embeds/EmbedColors.ts` */
export function parsePalette(source: string): PaletteColor[] {
    const entries = source.matchAll(/(?:\/\*\*\s*(.*?)\s*\*\/\s*\n)?[^\S\n]*(\w+):\s*'(#[0-9A-Fa-f]{6})'/g);
    return Array.from(entries, (match) => ({ name: match[2], hex: match[3].toUpperCase(), comment: match[1] }));
}

/** Ajoute une couleur à la fin de l'objet `EmbedColors` (avant `} as const;`) */
export function addPaletteColor(source: string, color: PaletteColor): string {
    const end = /^\} as const;/m.exec(source);
    if (!end) {
        throw new Error('EmbedColors.ts : fin de l\'objet "} as const;" introuvable');
    }
    const comment = color.comment ? `    /** ${color.comment} */\n` : '';
    const entry = `${comment}    ${color.name}: '${color.hex.toUpperCase()}',\n`;
    return source.slice(0, end.index) + entry + source.slice(end.index);
}

/**
 * Garantit le type `<Feature>Translator` dans `translations.ts`
 *
 * @param featurePascal - Nom de la feature en PascalCase (ex: 'Settings')
 * @returns Le fichier modifié et le nom du type
 */
export function ensureTranslatorType(source: string, featurePascal: string): { source: string; typeName: string } {
    const typeName = `${featurePascal}Translator`;
    if (new RegExp(`export type ${typeName}\\b`).test(source)) {
        return { source, typeName };
    }

    const messages = /export type (\w+Messages) = typeof \w+;/.exec(source);
    if (!messages) {
        throw new Error(`translations.ts : type "export type ${featurePascal}Messages = typeof fr;" introuvable`);
    }

    const withImports = ensureNamedImports(source, '../../shared/i18n', ['CommonMessages', 'Translator']);
    const block = [
        `/** Fonction \`translate(key, params)\` de la feature, passée aux builders d'embeds et de menus */`,
        `export type ${typeName} = Translator<CommonMessages & ${messages[1]}>;`,
    ].join('\n');
    return { source: appendBlock(withImports, block), typeName };
}

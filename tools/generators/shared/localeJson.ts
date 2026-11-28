import { EMOJI_CHAR } from './naming';

/**
 * Lecture / écriture des fichiers `locales/<langue>.json`
 *
 * Le format produit est celui des fichiers existants : indentation de 2 espaces,
 * tableaux pour les textes multi-lignes, émojis écrits en séquence d'échappement
 * (`❌`, paire de substitution `🔍`), accents conservés tels quels.
 */

export type LocaleValue = string | string[] | LocaleTree;
export type LocaleTree = { [key: string]: LocaleValue };

const EMOJI_CHARS = new RegExp(EMOJI_CHAR.source, 'gu');

function isTree(value: LocaleValue | undefined): value is LocaleTree {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valeur à un chemin de clés (`['register', 'title']`), undefined si absente */
export function getAtPath(tree: LocaleTree, path: string[]): LocaleValue | undefined {
    let node: LocaleValue | undefined = tree;
    for (const part of path) {
        if (!isTree(node)) return undefined;
        node = node[part];
    }
    return node;
}

/**
 * Vérifie qu'une nouvelle clé peut être créée sans écraser de texte existant
 *
 * @returns null si c'est possible, sinon la raison du refus
 */
export function findPathConflict(tree: LocaleTree, path: string[]): string | null {
    let node: LocaleValue | undefined = tree;
    for (let index = 0; index < path.length; index++) {
        if (!isTree(node)) {
            return `"${path.slice(0, index).join('.')}" est déjà un texte`;
        }
        node = node[path[index]];
        if (node === undefined) return null;
    }
    return `"${path.join('.')}" existe déjà`;
}

/** Écrit une valeur à un chemin (crée les objets intermédiaires). Modifie l'arbre reçu. */
export function setAtPath(tree: LocaleTree, path: string[], value: string | string[]): void {
    let node: LocaleTree = tree;
    for (const part of path.slice(0, -1)) {
        const child = node[part];
        if (child === undefined) {
            node[part] = {};
        } else if (!isTree(child)) {
            throw new Error(`Impossible d'écrire "${path.join('.')}" : "${part}" est déjà un texte`);
        }
        node = node[part] as LocaleTree;
    }
    node[path[path.length - 1]] = value;
}

/** Remplace chaque émoji d'un JSON sérialisé par ses séquences `\uXXXX` (unités UTF-16) */
export function escapeEmojis(json: string): string {
    return json.replace(EMOJI_CHARS, (char) =>
        Array.from({ length: char.length }, (_, index) =>
            `\\u${char.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0')}`
        ).join('')
    );
}

/** Sérialise un catalogue au format du projet (fins de ligne `\n`, converties à l'écriture) */
export function serializeLocale(tree: LocaleTree): string {
    return `${escapeEmojis(JSON.stringify(tree, null, 2))}\n`;
}

/**
 * Donne à une traduction la forme du texte de référence (chaîne ou tableau de lignes)
 *
 * @remarks
 * Le type du catalogue est déduit du fichier de la langue de référence (`typeof fr`) :
 * si `fr` a un tableau et `en` une chaîne pour la même clé, la compilation échoue.
 */
export function matchShape(reference: string | string[], translation: string | string[]): string | string[] {
    if (Array.isArray(reference)) return Array.isArray(translation) ? translation : [translation];
    return Array.isArray(translation) ? translation.join('\n') : translation;
}

/** Placeholders `{nom}` d'un texte, dans l'ordre d'apparition, sans doublon */
export function extractPlaceholders(text: string | string[]): string[] {
    const joined = Array.isArray(text) ? text.join('\n') : text;
    return [...new Set(Array.from(joined.matchAll(/\{(\w+)\}/g), (match) => match[1]))];
}

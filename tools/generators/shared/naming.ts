/**
 * Conventions de nommage du projet (identifiants TypeScript, clés de traduction)
 */

/** Identifiant camelCase ASCII (feature, clé de traduction, champ de données) */
export const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

/** Identifiant PascalCase ASCII (nom de fichier, nom d'embed) */
export const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;

/** Découpe une saisie libre ("profile card", "profile-card", "profileCard") en mots */
function splitWords(input: string): string[] {
    return input.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean);
}

/**
 * Convertit une saisie libre en PascalCase
 *
 * @example
 * toPascalCase('profile card'); // 'ProfileCard'
 * toPascalCase('profileCard');  // 'ProfileCard'
 */
export function toPascalCase(input: string): string {
    return splitWords(input).map((word) => word[0].toUpperCase() + word.slice(1)).join('');
}

/**
 * Convertit une saisie libre en camelCase
 *
 * @example
 * toCamelCase('Profile card'); // 'profileCard'
 */
export function toCamelCase(input: string): string {
    const pascal = toPascalCase(input);
    return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : '';
}

/** Écrit une chaîne littérale TypeScript entre apostrophes (caractères non ASCII échappés) */
export function tsString(value: string): string {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/[^\x20-\x7E]/gu, (char) => `\\u{${char.codePointAt(0)!.toString(16).toUpperCase()}}`);
    return `'${escaped}'`;
}

/** Caractères émoji interdits bruts dans src/ (cf. tests/architecture.test.ts) */
export const EMOJI_CHAR = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/u;

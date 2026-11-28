import path from 'node:path';
import { FileChangeSet, ProjectView, paths } from './project';
import { LocaleTree, extractPlaceholders, findPathConflict, matchShape, serializeLocale, setAtPath } from './localeJson';
import { CAMEL_CASE, tsString } from './naming';

/**
 * Textes traduits communs à tous les générateurs (embeds, components, commandes)
 */

/** Contexte commun des générateurs */
export interface GeneratorContext {
    root: string;
    locales: readonly string[];
    defaultLocale: string;
    changes: FileChangeSet;
}

/** Texte traduit : une valeur par langue (tableau = une ligne par élément) */
export interface TextElement {
    /** Clé relative au préfixe (ex: 'title' → `profile.card.title`) */
    key: string;
    values: Record<string, string | string[]>;
    /** Langues dont le texte a été recopié depuis la langue de référence (à traduire) */
    untranslated: string[];
}

export function textLength(value: string | string[]): number {
    return Array.isArray(value) ? value.join('\n').length : value.length;
}

/** Un texte sans lettre hors placeholders (ex: "{price}", "42") est identique dans toutes les langues */
export function needsTranslation(value: string | string[]): boolean {
    const text = Array.isArray(value) ? value.join('\n') : value;
    return /\p{L}/u.test(text.replace(/\{\w+\}/g, ''));
}

/** Placeholders d'un texte, toutes langues confondues */
export function elementPlaceholders(element: TextElement): string[] {
    return [...new Set(Object.values(element.values).flatMap((value) => extractPlaceholders(value)))];
}

/**
 * Valide la valeur d'un texte : longueur maximale et noms de placeholders
 *
 * @returns null si valide, sinon le message d'erreur
 */
export function checkTextValue(value: string | string[], maxLength: number): string | null {
    if (textLength(value) === 0) return 'texte vide';
    if (textLength(value) > maxLength) return `texte trop long : ${textLength(value)} caractères (limite Discord : ${maxLength})`;
    const invalid = extractPlaceholders(value).find((name) => !CAMEL_CASE.test(name));
    return invalid ? `placeholder {${invalid}} : nom camelCase attendu` : null;
}

/**
 * Construit un texte traduit à partir d'une entrée JSON
 *
 * Formes acceptées :
 * - `"texte"` ou `["ligne 1", "ligne 2"]` : langue de référence, recopiée dans les autres (à traduire)
 * - `{ "fr": "texte", "en": "text" }` : une valeur par langue (la langue de référence est obligatoire)
 *
 * @param errors - Reçoit les erreurs, préfixées par `where`
 */
export function textFromInput(
    raw: unknown,
    key: string,
    where: string,
    context: Pick<GeneratorContext, 'locales' | 'defaultLocale'>,
    maxLength: number,
    errors: string[]
): TextElement | undefined {
    const isValue = (value: unknown): value is string | string[] =>
        typeof value === 'string' || (Array.isArray(value) && value.every((line) => typeof line === 'string'));

    let given: Record<string, string | string[]>;
    if (isValue(raw)) {
        given = { [context.defaultLocale]: raw };
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        given = {};
        for (const [locale, value] of Object.entries(raw)) {
            if (!context.locales.includes(locale)) errors.push(`${where}.${locale} : langue inconnue (${context.locales.join(', ')})`);
            else if (isValue(value)) given[locale] = value;
            else errors.push(`${where}.${locale} : chaîne ou tableau de lignes attendu`);
        }
    } else {
        errors.push(`${where} : texte attendu ("…", ["ligne", …] ou { "${context.defaultLocale}": "…" })`);
        return undefined;
    }

    const reference = given[context.defaultLocale];
    if (reference === undefined) {
        errors.push(`${where} : texte "${context.defaultLocale}" (langue de référence) obligatoire`);
        return undefined;
    }

    const element: TextElement = { key, values: {}, untranslated: [] };
    for (const locale of context.locales) {
        const value = given[locale];
        if (value === undefined) {
            element.values[locale] = reference;
            if (needsTranslation(reference)) element.untranslated.push(locale);
            continue;
        }
        element.values[locale] = matchShape(reference, value);
        const error = checkTextValue(element.values[locale], maxLength);
        const perLocale = typeof raw === 'object' && !Array.isArray(raw);
        if (error) errors.push(`${where}${perLocale ? `.${locale}` : ''} : ${error}`);
    }
    return element;
}

/** Fichier de langue d'une feature */
export function localeFile(root: string, feature: string, locale: string): string {
    return path.join(paths.feature(root, feature), 'locales', `${locale}.json`);
}

/** Catalogue de la langue de référence d'une feature ({} s'il n'existe pas encore) */
export function readReferenceLocale(view: ProjectView, context: Pick<GeneratorContext, 'root' | 'defaultLocale'>, feature: string): LocaleTree {
    const content = view.read(localeFile(context.root, feature, context.defaultLocale));
    return content ? JSON.parse(content) : {};
}

/**
 * Valide un préfixe de clés : segments camelCase, racine `common` réservée, aucune clé existante
 */
export function checkKeyPrefix(prefix: string, reference: LocaleTree): string | null {
    const parts = prefix.split('.');
    if (!parts.every((part) => CAMEL_CASE.test(part))) return 'segments camelCase séparés par des points attendus (ex: profile.card)';
    if (parts[0] === 'common') return 'la racine "common" est réservée aux textes communs';
    return findPathConflict(reference, parts);
}

/** Écrit les textes dans chaque `locales/<langue>.json` de la feature */
export function planTexts(context: GeneratorContext, feature: string, keyPrefix: string, elements: TextElement[]): void {
    for (const locale of context.locales) {
        const file = localeFile(context.root, feature, locale);
        const current = context.changes.read(file);
        const tree: LocaleTree = current ? JSON.parse(current) : {};
        for (const element of elements) {
            const value = element.values[locale] ?? element.values[context.defaultLocale];
            setAtPath(tree, `${keyPrefix}.${element.key}`.split('.'), value);
        }
        context.changes.write(file, serializeLocale(tree));
    }
}

/**
 * Appel `translate('prefix.key', { param: data.param })`
 *
 * @param translator - Nom de la fonction de traduction ('translate')
 * @param source - Objet contenant les valeurs des placeholders ('data')
 */
export function translateCall(keyPrefix: string, element: TextElement, translator = 'translate', source = 'data'): string {
    const key = tsString(`${keyPrefix}.${element.key}`);
    const placeholders = elementPlaceholders(element);
    if (placeholders.length === 0) return `${translator}(${key})`;
    return `${translator}(${key}, { ${placeholders.map((name) => `${name}: ${source}.${name}`).join(', ')} })`;
}

/** Lignes "langue : clé" des textes à traduire */
export function untranslatedKeys(keyPrefix: string, elements: TextElement[]): string[] {
    return elements.flatMap((element) => element.untranslated.map((locale) => `${locale}: ${keyPrefix}.${element.key}`));
}

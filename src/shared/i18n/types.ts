/**
 * Valeur d'un catalogue de traduction :
 * - une chaîne
 * - un tableau de lignes (joint avec '\n', pratique pour les descriptions d'embed)
 * - un sous-objet (regroupement des clés)
 */
export type TranslationValue = string | readonly string[] | TranslationTree;

/** Structure d'un fichier `locales/<code>.json` */
export type TranslationTree = { readonly [key: string]: TranslationValue };

/**
 * Toutes les clés "à points" d'un catalogue, calculées à la compilation
 *
 * @example
 * ```typescript
 * type Keys = TranslationKey<{ register: { title: string; lines: string[] } }>;
 * // 'register.title' | 'register.lines'
 * ```
 *
 * Une faute de frappe dans une clé (`t('register.titel')`) est donc une erreur TypeScript.
 */
export type TranslationKey<T> = {
    [K in keyof T & string]: T[K] extends string | readonly string[]
        ? K
        : `${K}.${TranslationKey<T[K]>}`;
}[keyof T & string];

/** Valeurs injectées dans les placeholders `{nom}` d'une traduction */
export type TranslationParams = Record<string, string | number>;

/** Fonction de traduction liée à une langue */
export type Translator<T> = (key: TranslationKey<T>, params?: TranslationParams) => string;

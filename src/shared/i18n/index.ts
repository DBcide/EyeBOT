import fr from './locales/fr.json';
import en from './locales/en.json';
import { TranslationCatalog } from './TranslationCatalog';
import { Locale, SUPPORTED_LOCALES } from './locales';
import { TranslationTree, Translator } from './types';

export * from './locales';
export * from './types';
export { TranslationCatalog } from './TranslationCatalog';

/** Textes communs à toutes les features (clés `common.*`) */
export type CommonMessages = typeof fr;

/**
 * Catalogues communs. Le typage `Record<Locale, CommonMessages>` fait échouer la
 * compilation si une langue manque ou si une clé est absente d'un fichier.
 */
const commonCatalogs: Record<Locale, CommonMessages> = { fr, en };

/** Traductions communes, utilisées hors feature (ex: message d'erreur générique de Bot.ts) */
export const commonTranslations = new TranslationCatalog<CommonMessages>(commonCatalogs);

/** Fonction de traduction des textes communs */
export type CommonTranslator = Translator<CommonMessages>;

/**
 * Crée le catalogue d'une feature, enrichi des clés communes (`common.*`)
 *
 * @param catalogs - Un catalogue par langue, typé sur le fichier de la langue par défaut
 * @returns Une instance TranslationCatalog donnant accès aux clés de la feature ET aux clés communes
 *
 * @remarks
 * Un fichier de feature ne doit pas définir de clé racine `common` (elle serait écrasée).
 *
 * @example
 * ```typescript
 * import fr from './locales/fr.json';
 * import en from './locales/en.json';
 *
 * export type TracerMessages = typeof fr;
 * const catalogs: Record<Locale, TracerMessages> = { fr, en };
 * export const tracerTranslations = createFeatureTranslations(catalogs);
 * ```
 */
export function createFeatureTranslations<T extends TranslationTree>(
    catalogs: Record<Locale, T>
): TranslationCatalog<CommonMessages & T> {
    const merged = {} as Record<Locale, CommonMessages & T>;
    for (const locale of SUPPORTED_LOCALES) {
        merged[locale] = { ...catalogs[locale], ...commonCatalogs[locale] };
    }
    return new TranslationCatalog(merged);
}

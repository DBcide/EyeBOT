import fr from './locales/fr.json';
import en from './locales/en.json';
import { CommonMessages, Locale, Translator, createFeatureI18n } from '../../shared/i18n';

/** Forme du catalogue tracer, déduite du fichier de la langue de référence (fr) */
export type TracerMessages = typeof fr;

/**
 * Un catalogue par langue : si `en.json` (ou une future langue) oublie une clé
 * présente dans `fr.json`, la compilation échoue ici.
 */
const catalogs: Record<Locale, TracerMessages> = { fr, en };

/** Traductions de la feature tracer (+ clés `common.*`) */
export const tracerI18n = createFeatureI18n(catalogs);

/** Fonction `t(key, params)` du tracer, passée aux builders d'embeds */
export type TracerTranslator = Translator<CommonMessages & TracerMessages>;

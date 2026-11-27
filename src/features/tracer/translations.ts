import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import { CommonMessages, Locale, Translator, createFeatureTranslations } from '../../shared/i18n';

/** Forme du catalogue tracer, déduite du fichier de la langue de référence (fr) */
export type TracerMessages = typeof fr;

/**
 * Un catalogue par langue : si `en.json` (ou une future langue) oublie une clé
 * présente dans `fr.json`, la compilation échoue ici.
 */
const catalogs: Record<Locale, TracerMessages> = { fr, en, es };

/** Traductions de la feature tracer (+ clés `common.*`) */
export const tracerTranslations = createFeatureTranslations(catalogs);

/** Fonction `translate(key, params)` du tracer, passée aux builders d'embeds et de menus */
export type TracerTranslator = Translator<CommonMessages & TracerMessages>;

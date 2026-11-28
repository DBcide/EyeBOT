import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import { Locale, createFeatureTranslations } from '../../shared/i18n';

/** Forme du catalogue settings, déduite du fichier de la langue de référence (fr) */
export type SettingsMessages = typeof fr;

const catalogs: Record<Locale, SettingsMessages> = { fr, en, es };

/** Traductions de la feature settings (+ clés `common.*`) */
export const settingsTranslations = createFeatureTranslations(catalogs);

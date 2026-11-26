import { Locale as DiscordLocale } from 'discord.js';

/**
 * Langues supportées par le bot
 *
 * @remarks
 * Point d'entrée unique pour ajouter une langue :
 * 1. Ajouter une entrée ici (code court + libellé + locales Discord correspondantes)
 * 2. Ajouter le fichier `locales/<code>.json` dans `shared/i18n/` et dans chaque feature
 *
 * TypeScript signale alors toutes les features dont le fichier de traduction manque
 * ou est incomplet (les catalogues sont typés `Record<Locale, ...>`).
 */
export const LOCALES = {
    fr: { label: 'Français', discordLocales: [DiscordLocale.French] },
    en: { label: 'English', discordLocales: [DiscordLocale.EnglishUS, DiscordLocale.EnglishGB] },
} as const satisfies Record<string, { label: string; discordLocales: readonly DiscordLocale[] }>;

/** Code d'une langue supportée ('fr', 'en', ...) */
export type Locale = keyof typeof LOCALES;

export const SUPPORTED_LOCALES = Object.keys(LOCALES) as Locale[];

/** Langue de référence : utilisée en dernier recours et comme source des types de clés */
export const DEFAULT_LOCALE: Locale = 'fr';

/**
 * Vérifie qu'une valeur (ex: lue en base) est un code de langue supporté
 *
 * @param value - La valeur à tester
 * @returns true si la valeur est une clé de LOCALES
 */
export function isSupportedLocale(value: unknown): value is Locale {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LOCALES, value);
}

/**
 * Convertit la locale du client Discord (ex: 'en-US', 'fr') en langue supportée
 *
 * @param discordLocale - `interaction.locale` ou équivalent
 * @returns La langue correspondante, ou null si elle n'est pas supportée
 *
 * @example
 * ```typescript
 * fromDiscordLocale('en-GB'); // 'en'
 * fromDiscordLocale('fr');    // 'fr'
 * fromDiscordLocale('ja');    // null
 * ```
 */
export function fromDiscordLocale(discordLocale: string | null | undefined): Locale | null {
    if (!discordLocale) return null;

    for (const locale of SUPPORTED_LOCALES) {
        if ((LOCALES[locale].discordLocales as readonly string[]).includes(discordLocale)) {
            return locale;
        }
    }

    const base = discordLocale.split('-')[0];
    return isSupportedLocale(base) ? base : null;
}

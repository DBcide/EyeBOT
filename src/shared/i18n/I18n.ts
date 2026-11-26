import { Locale as DiscordLocale } from 'discord.js';
import { DEFAULT_LOCALE, LOCALES, Locale, SUPPORTED_LOCALES } from './locales';
import { TranslationKey, TranslationParams, TranslationTree, TranslationValue, Translator } from './types';
import { ServiceContainer } from '../services/ServiceContainer';

/**
 * Catalogue de traductions d'une feature, avec accès typé aux clés
 *
 * @typeParam T - Forme du catalogue (déduite du fichier JSON de la langue par défaut)
 *
 * @remarks
 * - `for(locale)` renvoie une fonction `t(key, params)` liée à une langue
 * - Si une clé manque dans une langue, la langue par défaut est utilisée, puis la clé brute
 * - Les placeholders `{nom}` sont remplacés par `params.nom`
 * - Une valeur tableau est jointe avec '\n' (une ligne d'embed par élément)
 *
 * @example
 * ```typescript
 * const t = tracerI18n.for('en');
 * t('register.playerNotFound', { pseudo: 'DBcide' });
 * ```
 */
export class I18n<T extends TranslationTree> {
    /**
     * @param catalogs - Un catalogue par langue supportée (vérifié à la compilation)
     */
    constructor(private readonly catalogs: Record<Locale, T>) {}

    /**
     * Renvoie la fonction de traduction pour une langue
     *
     * @param locale - La langue cible
     * @returns Une fonction `t(key, params)`
     */
    public for(locale: Locale): Translator<T> {
        return (key, params) => this.translate(locale, key, params);
    }

    /**
     * Traduit une clé dans la langue par défaut
     *
     * @remarks
     * Utilisé pour les textes enregistrés chez Discord (descriptions des commandes),
     * qui servent de valeur par défaut quand la langue du client n'est pas traduite.
     */
    public default(key: TranslationKey<T>, params?: TranslationParams): string {
        return this.translate(DEFAULT_LOCALE, key, params);
    }

    /**
     * Construit la table de localisations Discord d'une clé (toutes les langues sauf la défaut)
     *
     * @param key - La clé à traduire
     * @returns Un objet `{ 'en-US': '...', 'en-GB': '...' }` pour setDescriptionLocalizations()
     *
     * @remarks
     * Discord affiche ainsi la description des commandes dans la langue du client,
     * sans dépendre de la préférence enregistrée en base.
     */
    public localizations(key: TranslationKey<T>, params?: TranslationParams): Partial<Record<DiscordLocale, string>> {
        const result: Partial<Record<DiscordLocale, string>> = {};

        for (const locale of SUPPORTED_LOCALES) {
            if (locale === DEFAULT_LOCALE) continue;
            const text = this.translate(locale, key, params);
            for (const discordLocale of LOCALES[locale].discordLocales) {
                result[discordLocale] = text;
            }
        }

        return result;
    }

    private translate(locale: Locale, key: string, params?: TranslationParams): string {
        const value = lookup(this.catalogs[locale], key) ?? lookup(this.catalogs[DEFAULT_LOCALE], key);

        if (value === undefined) {
            ServiceContainer.getInstance().logger.warn(`Clé de traduction introuvable: ${key} (${locale})`, 'i18n');
            return key;
        }

        const text = typeof value === 'string' ? value : value.join('\n');
        return interpolate(text, params);
    }
}

/**
 * Lit une clé "à points" dans un catalogue
 *
 * @returns La chaîne ou le tableau de lignes, undefined si la clé n'existe pas
 */
function lookup(tree: TranslationTree, key: string): string | readonly string[] | undefined {
    let node: TranslationValue | undefined = tree;

    for (const part of key.split('.')) {
        if (node === undefined || typeof node === 'string' || Array.isArray(node)) {
            return undefined;
        }
        node = (node as TranslationTree)[part];
    }

    if (typeof node === 'string' || Array.isArray(node)) {
        return node as string | readonly string[];
    }
    return undefined;
}

/**
 * Remplace les placeholders `{nom}` par les paramètres fournis
 *
 * @remarks
 * Remplacement en une seule passe : une valeur contenant elle-même `{x}`
 * (ex: un pseudo saisi par un joueur) n'est jamais réinterprétée.
 * Un placeholder sans paramètre est laissé tel quel (visible, donc facile à repérer).
 */
function interpolate(text: string, params?: TranslationParams): string {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
}

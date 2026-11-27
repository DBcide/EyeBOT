import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';
import { DEFAULT_LOCALE, Locale, fromDiscordLocale, isSupportedLocale } from '../i18n/locales';

/**
 * Service de gestion de la langue des utilisateurs
 *
 * @remarks
 * **Ordre de résolution de la langue** (resolveForInteraction):
 * 1. Préférence enregistrée via /language (table user_preferences)
 * 2. Langue du client Discord de l'utilisateur (`interaction.locale`), si supportée
 * 3. Langue par défaut (DEFAULT_LOCALE)
 *
 * Les préférences sont mises en cache mémoire : une seule requête SQL par utilisateur
 * tant que le bot tourne. Une erreur de base n'empêche jamais une commande de répondre
 * (on retombe simplement sur la langue Discord / par défaut).
 */
export class LocaleService {
    /** discord_id → langue choisie (null = aucune préférence enregistrée) */
    private readonly cache = new Map<string, Locale | null>();

    constructor(
        private readonly database: DatabaseService,
        private readonly logger: LoggerService
    ) {}

    /**
     * Récupère la langue explicitement choisie par un utilisateur
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @returns La langue enregistrée, ou null si aucune (ou en cas d'erreur DB)
     */
    public async getUserLocale(discordId: string): Promise<Locale | null> {
        if (this.cache.has(discordId)) {
            return this.cache.get(discordId) ?? null;
        }

        try {
            const row = await this.database.selectOne<{ locale: string }>(
                'SELECT locale FROM user_preferences WHERE discord_id = ?',
                [discordId]
            );
            const locale = row && isSupportedLocale(row.locale) ? row.locale : null;
            this.cache.set(discordId, locale);
            return locale;
        } catch (error) {
            // Pas de mise en cache : on retentera au prochain appel
            this.logger.warn(`Impossible de lire la langue de ${discordId}`, 'i18n', {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Enregistre (ou supprime) la langue choisie par un utilisateur
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @param locale - La langue choisie, ou null pour revenir au mode automatique
     * @throws {Error} Si l'écriture en base échoue
     */
    public async setUserLocale(discordId: string, locale: Locale | null): Promise<void> {
        if (locale === null) {
            await this.database.execute('DELETE FROM user_preferences WHERE discord_id = ?', [discordId]);
        } else {
            // VALUES() plutôt que l'alias "AS new" : compatible MySQL 5.7+ et MariaDB
            await this.database.execute(
                `INSERT INTO user_preferences (discord_id, locale) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE locale = VALUES(locale)`,
                [discordId, locale]
            );
        }

        this.cache.set(discordId, locale);
    }

    /**
     * Détermine la langue à utiliser pour répondre à une interaction
     *
     * @param interaction - Toute interaction Discord (commande, menu, bouton…)
     * @returns Préférence enregistrée → langue du client Discord → langue par défaut
     */
    public async resolveForInteraction(interaction: { user: { id: string }; locale: string }): Promise<Locale> {
        return (await this.getUserLocale(interaction.user.id))
            ?? fromDiscordLocale(interaction.locale)
            ?? DEFAULT_LOCALE;
    }

    /**
     * Détermine la langue d'un utilisateur hors interaction (ex: MP envoyé à un autre membre)
     *
     * @param discordId - L'ID Discord du destinataire
     * @returns Préférence enregistrée → langue par défaut (la langue de son client est inconnue ici)
     */
    public async resolveForUser(discordId: string): Promise<Locale> {
        return (await this.getUserLocale(discordId)) ?? DEFAULT_LOCALE;
    }
}

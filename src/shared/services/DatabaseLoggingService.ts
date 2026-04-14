import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';

/**
 * Interface pour les données de logs de commandes Discord
 *
 * @remarks
 * Utilisé pour logger toutes les exécutions de commandes slash Discord.
 * Permet de tracer qui a utilisé quelle commande, avec quels paramètres, et le résultat.
 */
export interface CommandLogData {
    /** ID Discord de l'utilisateur qui a exécuté la commande */
    userId: string;
    /** ID Discord du serveur (null si commande en MP) */
    guildId: string | null;
    /** Nom de la commande exécutée (ex: "register", "update") */
    commandName: string;
    /** Options de la commande (ex: {pseudo: "DBcide"}) - Sérialisé en JSON dans la DB */
    commandOptions?: Record<string, any>;
    /** ID Albion du personnage principal de l'utilisateur (null si non enregistré) */
    albionCharacterId?: string | null;
    /** Résultat de l'exécution: success, error, ou warning */
    status: 'success' | 'error' | 'warning';
    /** Message d'erreur si status = 'error' */
    errorMessage?: string;
}

/**
 * Interface pour les données de logs système du bot
 *
 * @remarks
 * Utilisé pour logger tous les événements système du bot (démarrage, arrêt, monitoring, etc.).
 * Remplace le système de logging fichier par un logging en base de données.
 */
export interface SystemLogData {
    /** Niveau de log: debug, info, warn, error, success */
    level: 'debug' | 'info' | 'warn' | 'error' | 'success';
    /** Catégorie du log (ex: "startup", "database", "monitoring") */
    category: string;
    /** Message descriptif du log */
    message: string;
    /** Contexte additionnel (objets, erreurs) - Sérialisé en JSON dans la DB */
    context?: Record<string, any>;
}

/**
 * Interface pour les données de logs d'événements Discord
 *
 * @remarks
 * Utilisé pour logger les événements Discord importants (bot ajouté à un serveur, membre rejoint, etc.).
 * Complète les logs de commandes en capturant les événements non liés à des commandes.
 */
export interface EventLogData {
    /** Type d'événement Discord (ex: "guildCreate", "guildMemberAdd") */
    eventType: string;
    /** ID Discord de l'utilisateur concerné (optionnel) */
    userId?: string;
    /** ID Discord du serveur concerné (optionnel) */
    guildId?: string;
    /** Détails additionnels de l'événement - Sérialisé en JSON dans la DB */
    details?: Record<string, any>;
}

/**
 * Service de logging persistant en base de données MySQL
 *
 * @remarks
 * Remplace le logging fichier par un système centralisé en base de données.
 *
 * **Tables utilisées**:
 * - command_logs: Logs de toutes les commandes Discord exécutées
 * - system_logs: Logs système du bot (startup, shutdown, monitoring, etc.)
 * - event_logs: Logs d'événements Discord (guildCreate, guildMemberAdd, etc.)
 *
 * **Fonctionnalités**:
 * - Logging asynchrone sans bloquer l'exécution
 * - Sérialisation JSON automatique des objets complexes
 * - Gestion d'erreur silencieuse (ne bloque jamais le bot)
 * - Requêtes de récupération (getRecent*, getCommandStats)
 * - Nettoyage automatique des vieux logs (cleanOldLogs)
 *
 * **Cas d'usage**:
 * - Audit des commandes exécutées par les utilisateurs
 * - Debugging et analyse des erreurs en production
 * - Statistiques d'utilisation du bot
 * - Monitoring de la santé du bot
 *
 * @see MIGRATIONS.md - Migrations 4, 5, 6 pour les schémas de tables
 */
export class DatabaseLoggingService {
    private database: DatabaseService;
    private logger: LoggerService;

    /**
     * Crée une instance du service de logging en base de données
     *
     * @param database - Instance de DatabaseService (généralement depuis ServiceContainer)
     *
     * @remarks
     * Le service crée sa propre instance de LoggerService pour logger les erreurs
     * du système de logging lui-même (méta-logging).
     */
    constructor(database: DatabaseService) {
        this.database = database;
        this.logger = new LoggerService();
    }

    /**
     * Enregistre l'exécution d'une commande Discord en base de données
     *
     * @param data - Données de la commande exécutée
     * @returns Promise qui se résout quand le log est enregistré (ou en cas d'erreur silencieuse)
     *
     * @remarks
     * Insère un enregistrement dans la table `command_logs`.
     *
     * **Colonnes enregistrées**:
     * - user_id: ID Discord de l'utilisateur
     * - guild_id: ID du serveur (null si MP)
     * - command_name: Nom de la commande
     * - command_options: Options JSON (ex: {"pseudo": "DBcide"})
     * - albion_character_id: ID Albion du personnage principal (null si non enregistré)
     * - status: success | error | warning
     * - error_message: Message d'erreur si status = error
     * - executed_at: Timestamp automatique (CURRENT_TIMESTAMP)
     *
     * **Gestion d'erreur**:
     * - Les erreurs sont capturées et loggées dans la console (LoggerService)
     * - AUCUNE erreur n'est propagée pour ne jamais bloquer l'exécution des commandes
     * - Principe: Mieux vaut perdre un log que crasher le bot
     *
     * Appelé automatiquement par Bot.ts après chaque exécution de commande.
     *
     * @example
     * ```typescript
     * await dbLogger.logCommand({
     *     userId: interaction.user.id,
     *     guildId: interaction.guildId,
     *     commandName: 'register',
     *     commandOptions: { pseudo: 'DBcide' },
     *     albionCharacterId: 'abc123',
     *     status: 'success'
     * });
     * ```
     */
    public async logCommand(data: CommandLogData): Promise<void> {
        try {
            const sql = `
                INSERT INTO command_logs (
                    user_id,
                    guild_id,
                    command_name,
                    command_options,
                    albion_character_id,
                    status,
                    error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                data.userId,
                data.guildId,
                data.commandName,
                data.commandOptions ? JSON.stringify(data.commandOptions) : null,
                data.albionCharacterId || null,
                data.status,
                data.errorMessage || null,
            ];

            await this.database.execute(sql, values);
        } catch (error) {
            this.logger.error('Erreur lors du log de commande en DB', 'database', error);
        }
    }

    /**
     * Enregistre un log système du bot en base de données
     *
     * @param data - Données du log système
     * @returns Promise qui se résout quand le log est enregistré (ou en cas d'erreur silencieuse)
     *
     * @remarks
     * Insère un enregistrement dans la table `system_logs`.
     *
     * **Colonnes enregistrées**:
     * - level: debug | info | warn | error | success
     * - category: Catégorie du log (ex: "startup", "database", "monitoring")
     * - message: Message descriptif
     * - context: Contexte additionnel en JSON (ex: erreurs, objets)
     * - created_at: Timestamp automatique (CURRENT_TIMESTAMP)
     *
     * **Niveaux de log recommandés**:
     * - debug: Informations de debug détaillées (métriques, étapes)
     * - info: Informations générales (démarrage, arrêt)
     * - warn: Avertissements (mémoire élevée, timeout)
     * - error: Erreurs (échec connexion DB, erreur API)
     * - success: Opérations réussies importantes (connexion DB établie)
     *
     * **Gestion d'erreur**:
     * - Les erreurs sont capturées et loggées dans la console
     * - Aucune erreur n'est propagée (principe fail-safe)
     *
     * Appelé automatiquement par LoggerService pour chaque log émis.
     *
     * @example
     * ```typescript
     * await dbLogger.logSystem({
     *     level: 'info',
     *     category: 'startup',
     *     message: 'Bot démarré avec succès'
     * });
     * ```
     */
    public async logSystem(data: SystemLogData): Promise<void> {
        try {
            const sql = `
                INSERT INTO system_logs (
                    level,
                    category,
                    message,
                    context
                ) VALUES (?, ?, ?, ?)
            `;

            const values = [
                data.level,
                data.category,
                data.message,
                data.context ? JSON.stringify(data.context) : null,
            ];

            await this.database.execute(sql, values);
        } catch (error) {
            this.logger.error('Erreur lors du log système en DB', 'database', error);
        }
    }

    /**
     * Enregistre un événement Discord en base de données
     *
     * @param data - Données de l'événement Discord
     * @returns Promise qui se résout quand le log est enregistré (ou en cas d'erreur silencieuse)
     *
     * @remarks
     * Insère un enregistrement dans la table `event_logs`.
     *
     * **Colonnes enregistrées**:
     * - event_type: Type d'événement Discord (ex: "guildCreate", "guildMemberAdd")
     * - user_id: ID Discord de l'utilisateur concerné (optionnel)
     * - guild_id: ID Discord du serveur concerné (optionnel)
     * - details: Détails additionnels en JSON
     * - created_at: Timestamp automatique (CURRENT_TIMESTAMP)
     *
     * **Événements Discord courants**:
     * - guildCreate: Bot ajouté à un nouveau serveur
     * - guildDelete: Bot retiré d'un serveur
     * - guildMemberAdd: Nouveau membre rejoint un serveur
     * - guildMemberRemove: Membre quitte un serveur
     *
     * **Gestion d'erreur**:
     * - Les erreurs sont capturées et loggées dans la console
     * - Aucune erreur n'est propagée (principe fail-safe)
     *
     * Appelé par les event handlers dans `src/features/FEATURE/events/`.
     *
     * @example
     * ```typescript
     * await dbLogger.logEvent({
     *     eventType: 'guildCreate',
     *     guildId: guild.id,
     *     details: {
     *         guildName: guild.name,
     *         memberCount: guild.memberCount
     *     }
     * });
     * ```
     */
    public async logEvent(data: EventLogData): Promise<void> {
        try {
            const sql = `
                INSERT INTO event_logs (
                    event_type,
                    user_id,
                    guild_id,
                    details
                ) VALUES (?, ?, ?, ?)
            `;

            const values = [
                data.eventType,
                data.userId || null,
                data.guildId || null,
                data.details ? JSON.stringify(data.details) : null,
            ];

            await this.database.execute(sql, values);
        } catch (error) {
            this.logger.error('Erreur lors du log d\'événement en DB', 'database', error);
        }
    }

    /**
     * Récupère les logs de commandes les plus récents
     *
     * @param limit - Nombre maximum de logs à récupérer (défaut: 100)
     * @returns Promise contenant le tableau de logs triés par date décroissante
     *
     * @remarks
     * Retourne les logs de la table `command_logs` triés du plus récent au plus ancien.
     *
     * **Cas d'usage**:
     * - Afficher l'historique des commandes dans un dashboard admin
     * - Debugging: Voir les dernières commandes exécutées
     * - Audit: Tracer les actions des utilisateurs
     *
     * @example
     * ```typescript
     * const logs = await dbLogger.getRecentCommandLogs(50);
     * logs.forEach(log => {
     *     console.log(`${log.command_name} par ${log.user_id}: ${log.status}`);
     * });
     * ```
     */
    public async getRecentCommandLogs(limit: number = 100): Promise<any[]> {
        const sql = `
            SELECT * FROM command_logs
            ORDER BY executed_at DESC
            LIMIT ?
        `;
        return this.database.select<any>(sql, [limit]);
    }

    /**
     * Récupère les logs système les plus récents
     *
     * @param limit - Nombre maximum de logs à récupérer (défaut: 100)
     * @returns Promise contenant le tableau de logs triés par date décroissante
     *
     * @remarks
     * Retourne les logs de la table `system_logs` triés du plus récent au plus ancien.
     *
     * **Cas d'usage**:
     * - Monitoring: Vérifier les derniers events système
     * - Debugging: Analyser les erreurs récentes
     * - Dashboard: Afficher l'état du bot
     *
     * @example
     * ```typescript
     * const logs = await dbLogger.getRecentSystemLogs(25);
     * const errors = logs.filter(l => l.level === 'error');
     * console.log(`${errors.length} erreurs récentes`);
     * ```
     */
    public async getRecentSystemLogs(limit: number = 100): Promise<any[]> {
        const sql = `
            SELECT * FROM system_logs
            ORDER BY created_at DESC
            LIMIT ?
        `;
        return this.database.select<any>(sql, [limit]);
    }

    /**
     * Récupère les événements Discord les plus récents
     *
     * @param limit - Nombre maximum d'événements à récupérer (défaut: 100)
     * @returns Promise contenant le tableau d'événements triés par date décroissante
     *
     * @remarks
     * Retourne les logs de la table `event_logs` triés du plus récent au plus ancien.
     *
     * **Cas d'usage**:
     * - Tracker l'activité Discord (nouveaux serveurs, membres)
     * - Statistiques de croissance du bot
     * - Audit des événements Discord importants
     *
     * @example
     * ```typescript
     * const events = await dbLogger.getRecentEventLogs(10);
     * const guildJoins = events.filter(e => e.event_type === 'guildCreate');
     * console.log(`${guildJoins.length} nouveaux serveurs récemment`);
     * ```
     */
    public async getRecentEventLogs(limit: number = 100): Promise<any[]> {
        const sql = `
            SELECT * FROM event_logs
            ORDER BY created_at DESC
            LIMIT ?
        `;
        return this.database.select<any>(sql, [limit]);
    }

    /**
     * Récupère les statistiques d'utilisation des commandes sur une période
     *
     * @param days - Nombre de jours à analyser (défaut: 7)
     * @returns Promise contenant les statistiques groupées par commande
     *
     * @remarks
     * Agrège les logs de commandes pour générer des statistiques d'utilisation.
     *
     * **Métriques retournées par commande**:
     * - command_name: Nom de la commande
     * - total_executions: Nombre total d'exécutions
     * - success_count: Nombre de succès
     * - error_count: Nombre d'erreurs
     * - warning_count: Nombre d'avertissements
     *
     * Les résultats sont triés par total_executions DESC (commandes les plus utilisées en premier).
     *
     * **Cas d'usage**:
     * - Dashboard admin: Afficher les commandes populaires
     * - Optimisation: Identifier les commandes à améliorer (taux d'erreur élevé)
     * - Statistiques: Comprendre l'utilisation du bot
     *
     * @example
     * ```typescript
     * const stats = await dbLogger.getCommandStats(30); // 30 derniers jours
     * stats.forEach(stat => {
     *     const successRate = (stat.success_count / stat.total_executions * 100).toFixed(2);
     *     console.log(`/${stat.command_name}: ${stat.total_executions} exec, ${successRate}% succès`);
     * });
     * ```
     */
    public async getCommandStats(days: number = 7): Promise<any[]> {
        const sql = `
            SELECT
                command_name,
                COUNT(*) as total_executions,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
                SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning_count
            FROM command_logs
            WHERE executed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY command_name
            ORDER BY total_executions DESC
        `;
        return this.database.select<any>(sql, [days]);
    }

    /**
     * Nettoie les logs anciens pour éviter la croissance infinie de la base de données
     *
     * @param daysToKeep - Nombre de jours de logs à conserver (défaut: 90)
     * @returns Promise qui se résout après nettoyage complet
     *
     * @remarks
     * Supprime les logs plus anciens que `daysToKeep` jours dans les 3 tables:
     * - command_logs (colonne: executed_at)
     * - system_logs (colonne: created_at)
     * - event_logs (colonne: created_at)
     *
     * **Recommandations**:
     * - Appeler périodiquement via cron (ex: tous les jours à 3h du matin)
     * - Ou via tâche planifiée dans le bot (ex: toutes les 24h)
     * - Valeur recommandée: 90 jours (3 mois de rétention)
     *
     * **Sécurité**:
     * - Les erreurs sont capturées et loggées sans interrompre le processus
     * - Le nombre de lignes supprimées est loggé pour chaque table
     *
     * **Attention**:
     * - Cette opération est irréversible
     * - Faire un backup de la DB avant si besoin de conserver les anciens logs
     *
     * @example
     * ```typescript
     * // Nettoyage quotidien avec 60 jours de rétention
     * setInterval(async () => {
     *     await dbLogger.cleanOldLogs(60);
     * }, 24 * 60 * 60 * 1000); // Toutes les 24 heures
     * ```
     */
    public async cleanOldLogs(daysToKeep: number = 90): Promise<void> {
        try {
            const tables = ['command_logs', 'system_logs', 'event_logs'];
            const dateColumns = ['executed_at', 'created_at', 'created_at'];

            for (let i = 0; i < tables.length; i++) {
                const sql = `
                    DELETE FROM ${tables[i]}
                    WHERE ${dateColumns[i]} < DATE_SUB(NOW(), INTERVAL ? DAY)
                `;
                const affectedRows = await this.database.execute(sql, [daysToKeep]);
                this.logger.info(`${affectedRows} anciens logs supprimés de ${tables[i]}`, 'database');
            }
        } catch (error) {
            this.logger.error('Erreur lors du nettoyage des vieux logs', 'database', error);
        }
    }
}

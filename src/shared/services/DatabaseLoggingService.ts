import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';

/**
 * Types pour les logs de commandes
 */
export interface CommandLogData {
    userId: string;
    guildId: string | null;
    commandName: string;
    commandOptions?: Record<string, any>;
    albionCharacterId?: string | null;
    status: 'success' | 'error' | 'warning';
    errorMessage?: string;
}

/**
 * Types pour les logs système
 */
export interface SystemLogData {
    level: 'debug' | 'info' | 'warn' | 'error' | 'success';
    category: string;
    message: string;
    context?: Record<string, any>;
}

/**
 * Types pour les logs d'événements Discord
 */
export interface EventLogData {
    eventType: string;
    userId?: string;
    guildId?: string;
    details?: Record<string, any>;
}

/**
 * Service de logging en base de données
 * Permet de persister les logs de commandes, système et événements
 */
export class DatabaseLoggingService {
    private database: DatabaseService;
    private logger: LoggerService;

    constructor(database: DatabaseService) {
        this.database = database;
        this.logger = new LoggerService();
    }

    /**
     * Log une commande exécutée par un utilisateur
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
            // Ne pas propager l'erreur pour ne pas bloquer l'exécution
            // Juste logger dans la console
            this.logger.error('Erreur lors du log de commande en DB', error);
        }
    }

    /**
     * Log un événement système (heartbeat, monitoring, etc.)
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
            this.logger.error('Erreur lors du log système en DB', error);
        }
    }

    /**
     * Log un événement Discord (bot ajouté à un serveur, membre rejoint, etc.)
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
            this.logger.error('Erreur lors du log d\'événement en DB', error);
        }
    }

    /**
     * Récupère les derniers logs de commandes
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
     * Récupère les derniers logs système
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
     * Récupère les derniers événements Discord
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
     * Récupère les statistiques d'utilisation des commandes
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
     * Nettoie les vieux logs (pour éviter une croissance infinie)
     * À appeler périodiquement (via cron ou tâche planifiée)
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
                this.logger.info(`${affectedRows} anciens logs supprimés de ${tables[i]}`);
            }
        } catch (error) {
            this.logger.error('Erreur lors du nettoyage des vieux logs', error);
        }
    }
}

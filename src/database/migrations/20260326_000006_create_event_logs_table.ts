import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table event_logs pour tracker les événements Discord (bot ajouté, membre rejoint, etc.)
 */
export const CreateEventLogsTable: Migration = {
    name: '20260326_000006_create_event_logs_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS event_logs (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                event_type VARCHAR(50) NOT NULL COMMENT 'Event type (e.g., "guild_create", "guild_delete", "member_add")',
                user_id VARCHAR(20) NULL COMMENT 'Discord user ID (if applicable)',
                guild_id VARCHAR(20) NULL COMMENT 'Discord guild ID (if applicable)',
                details JSON NULL COMMENT 'Event details as JSON',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the event occurred',

                INDEX idx_event_type (event_type),
                INDEX idx_user_id (user_id),
                INDEX idx_guild_id (guild_id),
                INDEX idx_created_at (created_at),
                INDEX idx_event_type_created_at (event_type, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Logs des événements Discord (bot ajouté à un serveur, membre rejoint, etc.)';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS event_logs');
    }
};

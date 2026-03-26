import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table system_logs pour les logs système non liés à des actions utilisateurs
 */
export const CreateSystemLogsTable: Migration = {
    name: '20260326_000005_create_system_logs_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS system_logs (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                level ENUM('debug', 'info', 'warn', 'error', 'success') NOT NULL DEFAULT 'info' COMMENT 'Log level',
                category VARCHAR(50) NOT NULL COMMENT 'Log category (e.g., "heartbeat", "database", "discord")',
                message TEXT NOT NULL COMMENT 'Log message',
                context JSON NULL COMMENT 'Additional context data',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the log was created',

                INDEX idx_level (level),
                INDEX idx_category (category),
                INDEX idx_created_at (created_at),
                INDEX idx_level_created_at (level, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Logs système (heartbeat, monitoring, errors, etc.)';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS system_logs');
    }
};

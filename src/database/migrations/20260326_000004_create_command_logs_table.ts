import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table command_logs pour tracker les commandes exécutées par les utilisateurs
 */
export const CreateCommandLogsTable: Migration = {
    name: '20260326_000004_create_command_logs_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS command_logs (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL COMMENT 'Discord user ID',
                guild_id VARCHAR(20) NULL COMMENT 'Discord guild ID (null if DM)',
                command_name VARCHAR(100) NOT NULL COMMENT 'Command name (e.g., "register", "update")',
                command_options JSON NULL COMMENT 'Command options as JSON',
                albion_character_id VARCHAR(100) NULL COMMENT 'Related Albion character ID (null if no account)',
                status ENUM('success', 'error', 'warning') NOT NULL DEFAULT 'success' COMMENT 'Execution status',
                error_message TEXT NULL COMMENT 'Error message if status is error',
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the command was executed',

                INDEX idx_user_id (user_id),
                INDEX idx_guild_id (guild_id),
                INDEX idx_command_name (command_name),
                INDEX idx_status (status),
                INDEX idx_executed_at (executed_at),
                INDEX idx_albion_character_id (albion_character_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Logs des commandes Discord exécutées par les utilisateurs';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS command_logs');
    }
};

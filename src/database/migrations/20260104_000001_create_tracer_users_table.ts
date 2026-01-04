import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration initiale : création de la table tracer_users
 */
export const CreateTracerUsersTable: Migration = {
    name: '20260104_000001_create_tracer_users_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS tracer_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                discord_id VARCHAR(20) NOT NULL,
                albion_id VARCHAR(50) NOT NULL UNIQUE,
                albion_name VARCHAR(100) NOT NULL,
                kill_fame BIGINT DEFAULT 0,
                death_fame BIGINT DEFAULT 0,
                guild_name VARCHAR(100),
                alliance_name VARCHAR(100),
                is_main BOOLEAN DEFAULT 0,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_discord_id (discord_id),
                INDEX idx_albion_id (albion_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS tracer_users');
    }
};
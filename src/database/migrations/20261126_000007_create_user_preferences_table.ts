import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table user_preferences (langue choisie par chaque utilisateur Discord)
 *
 * Seule la préférence est stockée en base : les textes traduits vivent dans les fichiers
 * `locales/<langue>.json` de chaque feature.
 */
export const CreateUserPreferencesTable: Migration = {
    name: '20261126_000007_create_user_preferences_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS user_preferences (
                discord_id VARCHAR(20) NOT NULL PRIMARY KEY COMMENT 'Discord user ID',
                locale VARCHAR(10) NOT NULL COMMENT 'Language code (e.g., "fr", "en")',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Préférences des utilisateurs Discord (langue)';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS user_preferences');
    }
};

import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table vouch_guild_settings
 *
 * @remarks
 * Stocke les paramètres de la feature vouch pour chaque serveur Discord.
 * Un serveur peut activer/désactiver la fonctionnalité de vouch indépendamment.
 * Configuré par les administrateurs du serveur via une commande d'administration (à venir).
 */
export const CreateVouchGuildSettingsTable: Migration = {
    name: '20260413_000007_create_vouch_guild_settings_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS vouch_guild_settings (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL COMMENT 'Discord guild ID',
                is_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = vouch activé, 0 = désactivé',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de configuration',

                UNIQUE KEY uq_guild_id (guild_id),
                INDEX idx_is_enabled (is_enabled)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Paramètres de la feature vouch par serveur Discord';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS vouch_guild_settings');
    }
};

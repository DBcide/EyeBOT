import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table vouches
 *
 * @remarks
 * Enregistre les liens de garantie entre joueurs sur les serveurs Discord.
 * Chaque ligne représente un vouch unique : un garant, un garanti, un serveur.
 *
 * **Contrainte d'unicité**:
 * Un utilisateur ne peut voucher la même personne qu'une seule fois par serveur.
 *
 * **Prévention des vouches circulaires**:
 * La logique applicative (VouchService) s'assure qu'un utilisateur ne peut pas
 * voucher quelqu'un qui l'a déjà vouch (dans n'importe quel serveur).
 */
export const CreateVouchesTable: Migration = {
    name: '20260413_000009_create_vouches_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS vouches (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                voucher_discord_id VARCHAR(20) NOT NULL COMMENT 'Discord ID du garant',
                vouchee_discord_id VARCHAR(20) NOT NULL COMMENT 'Discord ID du garanti',
                guild_id VARCHAR(20) NOT NULL COMMENT 'Discord guild ID concerné par ce vouch',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création du vouch',

                UNIQUE KEY uq_vouch (voucher_discord_id, vouchee_discord_id, guild_id),
                INDEX idx_voucher (voucher_discord_id),
                INDEX idx_vouchee (vouchee_discord_id),
                INDEX idx_guild_id (guild_id),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Liens de garantie entre joueurs par serveur Discord';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS vouches');
    }
};

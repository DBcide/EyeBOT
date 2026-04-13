import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : création de la table vouch_requirements
 *
 * @remarks
 * Définit les prérequis de rôles Discord qu'un utilisateur doit remplir
 * pour pouvoir effectuer un vouch sur un serveur donné.
 *
 * **Logique de groupes (condition_group)**:
 * - Les prérequis dans un même `condition_group` sont évalués avec un opérateur AND
 * - Les groupes entre eux sont évalués avec un opérateur OR
 *
 * **Exemple de configuration**:
 * - Groupe 1, must_have rôle A + Groupe 1, must_not_have rôle B
 *   → Doit avoir le rôle A ET ne pas avoir le rôle B
 * - Groupe 2, must_have rôle C
 *   → OU doit avoir le rôle C
 * - Résultat final: (A ET NON-B) OU (C)
 *
 * Géré par les administrateurs via une commande d'administration (à venir).
 */
export const CreateVouchRequirementsTable: Migration = {
    name: '20260413_000008_create_vouch_requirements_table',

    async up(connection: mysql.PoolConnection): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS vouch_requirements (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL COMMENT 'Discord guild ID',
                role_id VARCHAR(20) NOT NULL COMMENT 'Discord role ID requis ou interdit',
                requirement_type ENUM('must_have', 'must_not_have') NOT NULL COMMENT 'must_have = doit posséder ce rôle, must_not_have = ne doit pas posséder ce rôle',
                condition_group INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Numéro de groupe (AND au sein du groupe, OR entre les groupes)',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création du prérequis',

                INDEX idx_guild_id (guild_id),
                INDEX idx_guild_group (guild_id, condition_group),
                CONSTRAINT fk_vouch_req_guild
                    FOREIGN KEY (guild_id)
                    REFERENCES vouch_guild_settings (guild_id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Prérequis de rôles Discord pour pouvoir effectuer un vouch par serveur';
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        await connection.execute('DROP TABLE IF EXISTS vouch_requirements');
    }
};

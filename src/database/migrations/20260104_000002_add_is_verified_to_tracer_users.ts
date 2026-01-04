import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : ajout de la colonne is_verified à la table tracer_users
 *
 * Cette colonne permet de vérifier qu'un joueur est bien le propriétaire légitime
 * d'un compte Albion Online. Un compte non vérifié peut être lié à plusieurs
 * comptes Discord, mais une fois vérifié, il ne peut être lié qu'à un seul compte.
 */
export const AddIsVerifiedToTracerUsers: Migration = {
    name: '20260104_000002_add_is_verified_to_tracer_users',

    async up(connection: mysql.PoolConnection): Promise<void> {
        // Ajouter la colonne is_verified avec valeur par défaut 0 (false)
        const sql = `
            ALTER TABLE tracer_users
            ADD COLUMN is_verified BOOLEAN DEFAULT 0 NOT NULL
            AFTER is_main;
        `;

        await connection.execute(sql);
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        // Supprimer la colonne is_verified
        await connection.execute('ALTER TABLE tracer_users DROP COLUMN is_verified');
    }
};
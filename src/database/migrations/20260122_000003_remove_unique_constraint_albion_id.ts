import { Migration } from '../Migration';
import mysql from 'mysql2/promise';

/**
 * Migration : suppression de la contrainte UNIQUE sur albion_id
 *
 * Cette migration permet à plusieurs utilisateurs Discord d'enregistrer
 * le même personnage Albion tant qu'il n'est pas vérifié.
 * La vérification (is_verified = 1) garantira l'unicité logique.
 */
export const RemoveUniqueConstraintAlbionId: Migration = {
    name: '20260122_000003_remove_unique_constraint_albion_id',

    async up(connection: mysql.PoolConnection): Promise<void> {
        // Supprimer la contrainte UNIQUE sur albion_id
        // Note: MySQL nomme automatiquement la contrainte 'albion_id' comme nom de l'index unique
        await connection.execute('ALTER TABLE tracer_users DROP INDEX albion_id');
    },

    async down(connection: mysql.PoolConnection): Promise<void> {
        // Restaurer la contrainte UNIQUE sur albion_id
        // Attention: cette opération échouera s'il existe des doublons
        await connection.execute('ALTER TABLE tracer_users ADD UNIQUE INDEX albion_id (albion_id)');
    }
};

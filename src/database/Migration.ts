import mysql from 'mysql2/promise';

/**
 * Interface pour définir une migration de base de données
 */
export interface Migration {
    /**
     * Nom de la migration (généralement timestamp_description)
     */
    name: string;

    /**
     * Applique la migration (création de tables, ajout de colonnes, etc.)
     */
    up(connection: mysql.PoolConnection): Promise<void>;

    /**
     * Annule la migration (rollback)
     */
    down(connection: mysql.PoolConnection): Promise<void>;
}
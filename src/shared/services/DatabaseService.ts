import mysql from 'mysql2/promise';
import { LoggerService } from './LoggerService';

/**
 * Service de gestion de la base de données MySQL
 * Fournit un pool de connexions et des méthodes pour exécuter des requêtes
 */
export class DatabaseService {
    private readonly pool: mysql.Pool;
    private readonly logger: LoggerService;
    private isConnected: boolean = false;
    private connectionPromise?: Promise<void>;

    constructor() {
        this.logger = new LoggerService();

        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: Number(process.env.DB_PORT) || 3306,
            database: process.env.DB_NAME || 'eyebot',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });
    }

    /**
     * Teste la connexion à la base de données (à appeler explicitement)
     */
    public async testConnection(): Promise<void> {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = (async () => {
            try {
                const connection = await this.pool.getConnection();
                await connection.ping();
                connection.release();
                this.isConnected = true;
                this.logger.success('Connexion à la base de données établie');
            } catch (error) {
                this.isConnected = false;
                this.logger.error('Échec de la connexion à la base de données', error);
                throw error;
            }
        })();

        return this.connectionPromise;
    }

    /**
     * Exécute une requête SQL avec des paramètres
     * @param sql Requête SQL (avec ? pour les paramètres)
     * @param params Paramètres à insérer dans la requête
     * @returns Résultats de la requête
     */
    public async query<T = any>(sql: string, params?: any[]): Promise<T> {
        try {
            const [rows] = await this.pool.execute(sql, params);
            return rows as T;
        } catch (error) {
            this.logger.error(`Erreur lors de l'exécution de la requête SQL: ${sql}`, error);
            throw error;
        }
    }

    /**
     * Exécute une requête SELECT et retourne toutes les lignes
     */
    public async select<T = any>(sql: string, params?: any[]): Promise<T[]> {
        return this.query<T[]>(sql, params);
    }

    /**
     * Exécute une requête SELECT et retourne la première ligne
     */
    public async selectOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
        const results = await this.query<T[]>(sql, params);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Exécute une requête INSERT
     * @returns L'ID de la ligne insérée
     */
    public async insert(sql: string, params?: any[]): Promise<number> {
        const result: any = await this.query(sql, params);
        return result.insertId;
    }

    /**
     * Exécute une requête UPDATE ou DELETE
     * @returns Le nombre de lignes affectées
     */
    public async execute(sql: string, params?: any[]): Promise<number> {
        const result: any = await this.query(sql, params);
        return result.affectedRows;
    }

    /**
     * Commence une transaction
     */
    public async beginTransaction(): Promise<mysql.PoolConnection> {
        const connection = await this.pool.getConnection();
        await connection.beginTransaction();
        return connection;
    }

    /**
     * Commit une transaction
     */
    public async commit(connection: mysql.PoolConnection): Promise<void> {
        await connection.commit();
        connection.release();
    }

    /**
     * Rollback une transaction
     */
    public async rollback(connection: mysql.PoolConnection): Promise<void> {
        await connection.rollback();
        connection.release();
    }

    /**
     * Vérifie si la connexion à la base de données est active
     */
    public isConnectionActive(): boolean {
        return this.isConnected;
    }

    /**
     * Ferme le pool de connexions
     * À appeler lors de l'arrêt du bot
     */
    public async close(): Promise<void> {
        try {
            await this.pool.end();
            this.logger.info('Pool de connexions à la base de données fermé');
        } catch (error) {
            this.logger.error('Erreur lors de la fermeture du pool de connexions', error);
        }
    }
}

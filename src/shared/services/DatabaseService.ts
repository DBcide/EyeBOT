import mysql from 'mysql2/promise';
import { LoggerService } from './LoggerService';

/**
 * Service de gestion de la base de données MySQL avec pool de connexions
 *
 * @remarks
 * Fournit une couche d'abstraction au-dessus de mysql2/promise avec:
 * - Pool de connexions (max 10 connexions simultanées)
 * - Auto-reconnexion avec keep-alive
 * - Méthodes typées pour les opérations CRUD
 * - Support des transactions avec commit/rollback
 * - Logging automatique des erreurs
 *
 * Configuration via variables d'environnement:
 * - DB_HOST (défaut: localhost)
 * - DB_USER (défaut: root)
 * - DB_PASSWORD (défaut: '')
 * - DB_PORT (défaut: 3306)
 * - DB_NAME (défaut: eyebot)
 */
export class DatabaseService {
    private pool: mysql.Pool;
    private logger: LoggerService;
    private isConnected: boolean = false;
    private connectionPromise?: Promise<void>;

    /**
     * Crée une instance du service de base de données
     *
     * @remarks
     * Initialise un pool de connexions MySQL avec:
     * - 10 connexions maximum en parallèle
     * - File d'attente illimitée (queueLimit: 0)
     * - Keep-alive activé pour maintenir les connexions
     * - Configuration depuis variables d'environnement
     *
     * La connexion effective à la base de données doit être testée
     * explicitement via testConnection()
     */
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
     * Teste la connexion à la base de données
     *
     * @returns Promise qui se résout quand la connexion est établie
     * @throws {Error} Si la connexion échoue (credentials invalides, serveur inaccessible, etc.)
     *
     * @remarks
     * Cette méthode doit être appelée explicitement au démarrage du bot.
     * Utilise un pattern de memoization pour éviter les tests multiples simultanés.
     * Si appelée plusieurs fois avant résolution, retourne la même Promise.
     *
     * @example
     * ```typescript
     * const db = new DatabaseService();
     * await db.testConnection(); // Lève une erreur si échec
     * ```
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
                this.logger.success('Connexion à la base de données établie', 'database');
            } catch (error) {
                this.isConnected = false;
                this.logger.error('Échec de la connexion à la base de données', 'database', error);
                throw error;
            }
        })();

        return this.connectionPromise;
    }

    /**
     * Exécute une requête SQL paramétrée et retourne les résultats typés
     *
     * @template T - Type des résultats attendus
     * @param sql - Requête SQL avec placeholders ? pour les paramètres
     * @param params - Tableau de valeurs à insérer dans les placeholders
     * @returns Promise contenant les résultats typés de la requête
     * @throws {Error} Si la requête SQL échoue (syntaxe, contraintes, etc.)
     *
     * @remarks
     * Méthode générique pour exécuter n'importe quelle requête SQL.
     * Préférer les méthodes spécialisées (select, insert, execute) quand possible.
     * Les paramètres sont automatiquement échappés pour prévenir les injections SQL.
     *
     * @example
     * ```typescript
     * // SELECT avec paramètres
     * const users = await db.query<User[]>('SELECT * FROM users WHERE age > ?', [18]);
     *
     * // INSERT
     * const result = await db.query('INSERT INTO users (name) VALUES (?)', ['Alice']);
     * ```
     */
    public async query<T = any>(sql: string, params?: any[]): Promise<T> {
        try {
            const [rows] = await this.pool.execute(sql, params);
            return rows as T;
        } catch (error) {
            this.logger.error(`Erreur lors de l'exécution de la requête SQL: ${sql}`, 'database', error);
            throw error;
        }
    }

    /**
     * Exécute une requête SELECT et retourne toutes les lignes
     *
     * @template T - Type des objets retournés (une ligne)
     * @param sql - Requête SELECT avec placeholders ?
     * @param params - Paramètres à injecter dans la requête
     * @returns Promise contenant un tableau de lignes typées
     * @throws {Error} Si la requête échoue
     *
     * @example
     * ```typescript
     * const users = await db.select<User>('SELECT * FROM users WHERE age > ?', [18]);
     * // users est de type User[]
     * ```
     */
    public async select<T = any>(sql: string, params?: any[]): Promise<T[]> {
        return this.query<T[]>(sql, params);
    }

    /**
     * Exécute une requête SELECT et retourne uniquement la première ligne
     *
     * @template T - Type de l'objet retourné
     * @param sql - Requête SELECT avec placeholders ?
     * @param params - Paramètres à injecter dans la requête
     * @returns Promise contenant la première ligne ou null si aucun résultat
     * @throws {Error} Si la requête échoue
     *
     * @remarks
     * Utile pour les requêtes WHERE uniques (par ID, par clé unique, etc.)
     * Retourne null au lieu de [] si aucun résultat trouvé
     *
     * @example
     * ```typescript
     * const user = await db.selectOne<User>('SELECT * FROM users WHERE id = ?', [123]);
     * if (user) {
     *     console.log(user.name);
     * }
     * ```
     */
    public async selectOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
        const results = await this.query<T[]>(sql, params);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Exécute une requête INSERT et retourne l'ID auto-incrémenté
     *
     * @param sql - Requête INSERT avec placeholders ?
     * @param params - Valeurs à insérer
     * @returns Promise contenant l'ID de la ligne insérée (AUTO_INCREMENT)
     * @throws {Error} Si l'insertion échoue (contraintes, clés dupliquées, etc.)
     *
     * @example
     * ```typescript
     * const userId = await db.insert(
     *     'INSERT INTO users (name, email) VALUES (?, ?)',
     *     ['Alice', 'alice@example.com']
     * );
     * console.log(`Utilisateur créé avec ID: ${userId}`);
     * ```
     */
    public async insert(sql: string, params?: any[]): Promise<number> {
        const result: any = await this.query(sql, params);
        return result.insertId;
    }

    /**
     * Exécute une requête UPDATE ou DELETE et retourne le nombre de lignes affectées
     *
     * @param sql - Requête UPDATE/DELETE avec placeholders ?
     * @param params - Paramètres de la requête
     * @returns Promise contenant le nombre de lignes modifiées/supprimées
     * @throws {Error} Si la requête échoue
     *
     * @example
     * ```typescript
     * // UPDATE
     * const updated = await db.execute(
     *     'UPDATE users SET name = ? WHERE id = ?',
     *     ['Bob', 123]
     * );
     * console.log(`${updated} ligne(s) mise(s) à jour`);
     *
     * // DELETE
     * const deleted = await db.execute('DELETE FROM users WHERE age < ?', [18]);
     * console.log(`${deleted} ligne(s) supprimée(s)`);
     * ```
     */
    public async execute(sql: string, params?: any[]): Promise<number> {
        const result: any = await this.query(sql, params);
        return result.affectedRows;
    }

    /**
     * Démarre une transaction et retourne la connexion dédiée
     *
     * @returns Promise contenant la connexion MySQL pour la transaction
     * @throws {Error} Si impossible d'obtenir une connexion du pool
     *
     * @remarks
     * IMPORTANT: Toujours appeler commit() ou rollback() pour libérer la connexion.
     * Ne pas libérer la connexion bloquera le pool (max 10 connexions).
     *
     * Utilisez ce pattern pour les transactions:
     * 1. beginTransaction() - Démarre et retourne la connexion
     * 2. Exécuter plusieurs requêtes sur cette connexion
     * 3. commit() en cas de succès OU rollback() en cas d'erreur
     *
     * @example
     * ```typescript
     * const connection = await db.beginTransaction();
     * try {
     *     await connection.execute('INSERT INTO users (name) VALUES (?)', ['Alice']);
     *     await connection.execute('INSERT INTO logs (action) VALUES (?)', ['user_created']);
     *     await db.commit(connection); // Valide les deux insertions
     * } catch (error) {
     *     await db.rollback(connection); // Annule tout en cas d'erreur
     *     throw error;
     * }
     * ```
     */
    public async beginTransaction(): Promise<mysql.PoolConnection> {
        const connection = await this.pool.getConnection();
        await connection.beginTransaction();
        return connection;
    }

    /**
     * Valide une transaction et libère la connexion
     *
     * @param connection - La connexion retournée par beginTransaction()
     * @returns Promise qui se résout quand le commit est terminé
     * @throws {Error} Si le commit échoue
     *
     * @remarks
     * Appelle automatiquement connection.release() après le commit.
     * Toujours utiliser dans un bloc try/catch pour gérer les erreurs.
     */
    public async commit(connection: mysql.PoolConnection): Promise<void> {
        await connection.commit();
        connection.release();
    }

    /**
     * Annule une transaction et libère la connexion
     *
     * @param connection - La connexion retournée par beginTransaction()
     * @returns Promise qui se résout quand le rollback est terminé
     * @throws {Error} Si le rollback échoue
     *
     * @remarks
     * Appelle automatiquement connection.release() après le rollback.
     * Toutes les modifications depuis beginTransaction() sont annulées.
     */
    public async rollback(connection: mysql.PoolConnection): Promise<void> {
        await connection.rollback();
        connection.release();
    }

    /**
     * Vérifie si la connexion initiale à la base de données a réussi
     *
     * @returns true si testConnection() a réussi, false sinon
     *
     * @remarks
     * Retourne l'état de la connexion initiale, pas l'état actuel du pool.
     * Le pool peut avoir des connexions actives même si isConnected = false
     * (car testConnection() n'a jamais été appelé).
     */
    public isConnectionActive(): boolean {
        return this.isConnected;
    }

    /**
     * Ferme le pool de connexions MySQL
     *
     * @returns Promise qui se résout quand le pool est fermé
     *
     * @remarks
     * À appeler lors de l'arrêt du bot (shutdown graceful).
     * Attend que toutes les connexions actives soient terminées avant de fermer.
     * Les erreurs sont loggées mais ne bloquent pas l'arrêt.
     *
     * @example
     * ```typescript
     * process.on('SIGTERM', async () => {
     *     await bot.shutdown('SIGTERM');
     *     await db.close();
     *     process.exit(0);
     * });
     * ```
     */
    public async close(): Promise<void> {
        try {
            await this.pool.end();
            this.logger.info('Pool de connexions à la base de données fermé', 'database');
        } catch (error) {
            this.logger.error('Erreur lors de la fermeture du pool de connexions', 'database', error);
        }
    }
}

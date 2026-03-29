import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';
import { DatabaseLoggingService } from './DatabaseLoggingService';

/**
 * Conteneur de services singleton pour la gestion centralisée des dépendances
 *
 * @remarks
 * Implémente le pattern Singleton pour garantir qu'une seule instance de chaque service existe.
 *
 * **Services gérés**:
 * - **database**: DatabaseService pour toutes les requêtes MySQL
 * - **logger**: LoggerService partagé pour tous les logs console + DB
 * - **dbLogger**: DatabaseLoggingService pour le logging persistant
 *
 * **Ordre d'initialisation (critique)**:
 * 1. DatabaseService (créé en premier)
 * 2. LoggerService (créé ensuite)
 * 3. Connection LoggerService → DatabaseService (setDatabaseService)
 * 4. DatabaseLoggingService (créé avec référence au DatabaseService)
 *
 * Cet ordre permet au LoggerService d'écrire dans system_logs tout en évitant les dépendances circulaires.
 *
 * **Avantages du pattern Singleton**:
 * - Partage d'instances entre tous les modules (pas de duplication)
 * - Connection pool MySQL unique (évite d'épuiser les connexions)
 * - Logger cohérent dans toute l'application
 * - Gestion centralisée du lifecycle (démarrage, arrêt)
 *
 * **Utilisation**:
 * - Accessible via ServiceContainer.getInstance() depuis n'importe où
 * - Initialisé automatiquement au premier appel de getInstance()
 * - Réutilise toujours la même instance (lazy singleton)
 *
 * @example
 * ```typescript
 * // Dans n'importe quel fichier
 * const services = ServiceContainer.getInstance();
 * await services.database.selectOne('SELECT * FROM users WHERE id = ?', [123]);
 * services.logger.info('Opération réussie', 'myCategory');
 * await services.dbLogger.logCommand({ ... });
 * ```
 */
export class ServiceContainer {
    private static instance: ServiceContainer;

    public readonly database: DatabaseService;
    public readonly logger: LoggerService;
    public readonly dbLogger: DatabaseLoggingService;

    /**
     * Constructeur privé pour empêcher l'instanciation directe
     *
     * @remarks
     * Le constructeur est privé pour forcer l'utilisation de getInstance().
     * Cela garantit qu'une seule instance existe (pattern Singleton).
     *
     * Séquence d'initialisation:
     * 1. Crée DatabaseService avec pool de connexions MySQL
     * 2. Crée LoggerService (console seulement à ce stade)
     * 3. Connecte LoggerService à DatabaseService via setDatabaseService()
     * 4. Crée DatabaseLoggingService avec référence à DatabaseService
     *
     * Après cette initialisation:
     * - LoggerService écrit en console ET en DB (system_logs)
     * - DatabaseLoggingService gère les logs de commandes et événements
     * - Tous les services partagent la même connexion pool MySQL
     */
    private constructor() {
        this.database = new DatabaseService();
        this.logger = new LoggerService();

        this.logger.setDatabaseService(this.database);

        this.dbLogger = new DatabaseLoggingService(this.database);
    }

    /**
     * Récupère l'instance unique du conteneur de services (lazy singleton)
     *
     * @returns L'instance unique de ServiceContainer avec tous les services initialisés
     *
     * @remarks
     * Implémentation du pattern Singleton:
     * - Crée l'instance seulement au premier appel (lazy initialization)
     * - Retourne toujours la même instance pour les appels suivants
     * - Thread-safe en JavaScript (pas de concurrence dans Node.js single-thread)
     *
     * Cette méthode est appelée partout dans l'application:
     * - Bot.ts (core)
     * - Tous les BaseCommand enfants
     * - Tous les services qui ont besoin de dépendances partagées
     *
     * @example
     * ```typescript
     * // Premier appel: crée l'instance
     * const services1 = ServiceContainer.getInstance();
     *
     * // Appels suivants: retourne la même instance
     * const services2 = ServiceContainer.getInstance();
     * console.log(services1 === services2); // true
     * ```
     */
    public static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }
}

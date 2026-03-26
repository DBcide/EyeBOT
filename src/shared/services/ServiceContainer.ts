import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';
import { DatabaseLoggingService } from './DatabaseLoggingService';

/**
 * Conteneur de services singleton
 * Tous les services sont créés une seule fois et partagés
 */
export class ServiceContainer {
    private static instance: ServiceContainer;

    public readonly database: DatabaseService;
    public readonly logger: LoggerService;
    public readonly dbLogger: DatabaseLoggingService;

    private constructor() {
        this.database = new DatabaseService();
        this.logger = new LoggerService();
        this.dbLogger = new DatabaseLoggingService(this.database);
    }

    /**
     * Récupère l'instance unique du conteneur
     */
    public static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }
}

import { Events } from 'discord.js';
import { BaseEvent } from '../../../core/BaseEvent';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Événement déclenché quand une erreur Discord se produit
 */
export default class ErrorEvent extends BaseEvent {
    public name = Events.Error;
    public once = false;

    private logger: LoggerService;
    private services: ServiceContainer;

    constructor() {
        super();
        this.services = ServiceContainer.getInstance();
        this.logger = this.services.logger;
    }

    public async execute(error: Error): Promise<void> {
        this.logger.error('❌ Erreur Discord détectée', error);

        // Log dans la base de données
        await this.services.dbLogger.logSystem({
            level: 'error',
            category: 'discord',
            message: `Erreur Discord: ${error.message}`,
            context: {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
            },
        });
    }
}

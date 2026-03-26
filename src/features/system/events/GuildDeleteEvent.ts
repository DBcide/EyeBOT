import { Events, Guild } from 'discord.js';
import { BaseEvent } from '../../../core/BaseEvent';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Événement déclenché quand le bot quitte un serveur (kick/ban ou suppression du serveur)
 */
export default class GuildDeleteEvent extends BaseEvent {
    public name = Events.GuildDelete;
    public once = false;

    private logger: LoggerService;
    private services: ServiceContainer;

    constructor() {
        super();
        this.services = ServiceContainer.getInstance();
        this.logger = this.services.logger;
    }

    public async execute(guild: Guild): Promise<void> {
        this.logger.warn(`👋 Bot retiré du serveur: ${guild.name} (ID: ${guild.id})`);

        // Log dans la base de données
        await this.services.dbLogger.logEvent({
            eventType: 'guild_delete',
            guildId: guild.id,
            details: {
                guildName: guild.name,
                memberCount: guild.memberCount,
            },
        });

        // Log système également
        await this.services.dbLogger.logSystem({
            level: 'warn',
            category: 'discord',
            message: `Bot retiré du serveur ${guild.name}`,
            context: {
                guildId: guild.id,
                guildName: guild.name,
            },
        });
    }
}

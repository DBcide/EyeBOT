import { Events, Guild } from 'discord.js';
import { BaseEvent } from '../../../core/BaseEvent';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Événement déclenché quand le bot rejoint un serveur
 */
export default class GuildCreateEvent extends BaseEvent {
    public name = Events.GuildCreate;
    public once = false;

    private logger: LoggerService;
    private services: ServiceContainer;

    constructor() {
        super();
        this.services = ServiceContainer.getInstance();
        this.logger = this.services.logger;
    }

    public async execute(guild: Guild): Promise<void> {
        this.logger.success(`🎉 Bot ajouté au serveur: ${guild.name} (ID: ${guild.id})`);

        // Log dans la base de données
        await this.services.dbLogger.logEvent({
            eventType: 'guild_create',
            guildId: guild.id,
            details: {
                guildName: guild.name,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                createdAt: guild.createdAt.toISOString(),
            },
        });

        // Log système également
        await this.services.dbLogger.logSystem({
            level: 'info',
            category: 'discord',
            message: `Bot ajouté au serveur ${guild.name} (${guild.memberCount} membres)`,
            context: {
                guildId: guild.id,
                guildName: guild.name,
                memberCount: guild.memberCount,
            },
        });
    }
}

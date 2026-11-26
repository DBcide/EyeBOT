import { Events, Guild } from 'discord.js';
import { BaseEvent } from '../../../core/BaseEvent';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Événement déclenché automatiquement quand le bot rejoint un nouveau serveur Discord
 *
 * @remarks
 * **Déclenchement**: Chaque fois que le bot est ajouté à un serveur (invitation acceptée)
 *
 * **Actions effectuées**:
 * 1. Log console avec emoji 🎉 (success)
 * 2. Enregistrement dans event_logs (table event_logs)
 * 3. Enregistrement dans system_logs pour traçabilité
 *
 * **Données loggées**:
 * - Nom du serveur
 * - ID du serveur
 * - Nombre de membres
 * - ID du propriétaire
 * - Date de création du serveur
 *
 * **Utilisation**:
 * - Monitoring des serveurs rejoints
 * - Audit de croissance du bot
 * - Détection d'ajouts suspects (bots farms, etc.)
 *
 * **Note**: Cet événement ne se déclenche PAS au démarrage du bot pour les serveurs existants,
 * uniquement pour les nouveaux ajouts après le démarrage.
 */
export default class GuildCreateEvent extends BaseEvent {
    public name = Events.GuildCreate;
    public once = false;

    private logger: LoggerService;
    private services: ServiceContainer;

    /**
     * Crée une instance de l'événement GuildCreate
     *
     * @remarks
     * Initialise les services nécessaires:
     * - ServiceContainer: Pour accéder à logger et dbLogger
     * - LoggerService: Pour les logs console
     */
    constructor() {
        super();
        this.services = ServiceContainer.getInstance();
        this.logger = this.services.logger;
    }

    /**
     * Exécute la logique de l'événement lors de l'ajout du bot à un serveur
     *
     * @param guild - Le serveur Discord rejoint
     * @returns Promise qui se résout après logging complet
     *
     * @remarks
     * **Séquence d'exécution**:
     * 1. logger.success() : console + system_logs (level 'success', category 'discord',
     *    context { guildId, guildName, memberCount })
     * 2. Enregistrement dans event_logs via dbLogger.logEvent():
     *    - eventType: 'guild_create'
     *    - guildId: ID du serveur
     *    - details: { guildName, memberCount, ownerId, createdAt }
     *
     * **Gestion des erreurs**:
     * - LoggerService et dbLogger sont fail-safe (pas de throw)
     * - En cas d'erreur DB, l'événement continue sans crasher le bot
     */
    public async execute(guild: Guild): Promise<void> {
        // logger.success écrit déjà dans system_logs : le contexte y est joint directement
        // (un appel séparé à dbLogger.logSystem() créait une ligne en double)
        this.logger.success(`🎉 Bot ajouté au serveur: ${guild.name} (ID: ${guild.id})`, 'discord', {
            guildId: guild.id,
            guildName: guild.name,
            memberCount: guild.memberCount,
        });

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
    }
}

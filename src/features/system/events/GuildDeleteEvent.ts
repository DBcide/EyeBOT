import { Events, Guild } from 'discord.js';
import { BaseEvent } from '../../../core/BaseEvent';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Événement déclenché automatiquement quand le bot quitte un serveur Discord
 *
 * @remarks
 * **Déclenchement**: Quand le bot quitte un serveur pour les raisons suivantes:
 * - Bot kick/ban par un administrateur
 * - Serveur Discord supprimé par le propriétaire
 * - Bot retiré via les paramètres du serveur
 *
 * **Actions effectuées**:
 * 1. Log console avec emoji 👋 (warn)
 * 2. Enregistrement dans event_logs (table event_logs)
 * 3. Enregistrement dans system_logs pour traçabilité
 *
 * **Données loggées**:
 * - Nom du serveur
 * - ID du serveur
 * - Nombre de membres (au moment du départ)
 *
 * **Utilisation**:
 * - Monitoring des serveurs quittés
 * - Audit de churn (taux de désabonnement)
 * - Détection de problèmes (bans massifs, etc.)
 *
 * **Note**: Cet événement peut aussi se déclencher lors d'une panne temporaire du serveur Discord,
 * suivi d'un GuildCreate lors du retour en ligne.
 */
export default class GuildDeleteEvent extends BaseEvent {
    public name = Events.GuildDelete;
    public once = false;

    private logger: LoggerService;
    private services: ServiceContainer;

    /**
     * Crée une instance de l'événement GuildDelete
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
     * Exécute la logique de l'événement lors du départ du bot d'un serveur
     *
     * @param guild - Le serveur Discord quitté
     * @returns Promise qui se résout après logging complet
     *
     * @remarks
     * **Séquence d'exécution**:
     * 1. Log console warn avec nom et ID du serveur
     * 2. Enregistrement dans event_logs via dbLogger.logEvent():
     *    - eventType: 'guild_delete'
     *    - guildId: ID du serveur
     *    - details: { guildName, memberCount }
     * 3. Enregistrement dans system_logs via dbLogger.logSystem():
     *    - level: 'warn'
     *    - category: 'discord'
     *    - message: "Bot retiré du serveur X"
     *    - context: { guildId, guildName }
     *
     * **Gestion des erreurs**:
     * - Les méthodes dbLogger sont fail-safe (pas de throw)
     * - En cas d'erreur DB, l'événement continue sans crasher le bot
     *
     * **Double logging**:
     * - event_logs: Pour tracking spécifique des événements Discord
     * - system_logs: Pour logs système généraux
     *
     * **Niveau warn vs error**:
     * - warn: Car le départ peut être volontaire ou temporaire (pas forcément un problème)
     * - error serait utilisé uniquement si le départ causait un crash
     */
    public async execute(guild: Guild): Promise<void> {
        this.logger.warn(`👋 Bot retiré du serveur: ${guild.name} (ID: ${guild.id})`, 'discord');

        await this.services.dbLogger.logEvent({
            eventType: 'guild_delete',
            guildId: guild.id,
            details: {
                guildName: guild.name,
                memberCount: guild.memberCount,
            },
        });

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

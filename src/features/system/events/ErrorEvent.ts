import { Events } from 'discord.js';
import { BaseEvent } from '../../../core/BaseEvent';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Événement déclenché automatiquement par Discord.js lors d'erreurs critiques
 *
 * @remarks
 * **Déclenchement**: Erreurs critiques au niveau du client Discord.js:
 * - Erreurs de websocket
 * - Erreurs de connexion à l'API Discord
 * - Erreurs de sérialisation/désérialisation
 * - Erreurs internes de Discord.js
 *
 * **Actions effectuées**:
 * 1. Log console error avec emoji ❌ et stack trace complète
 * 2. Enregistrement dans system_logs pour traçabilité
 *
 * **Données loggées**:
 * - Message d'erreur
 * - Nom de l'erreur (type)
 * - Stack trace complète
 *
 * **Utilisation**:
 * - Monitoring des erreurs Discord
 * - Détection de problèmes de connexion
 * - Audit de stabilité du bot
 *
 * **Différence avec les autres erreurs**:
 * - ErrorEvent: Erreurs du client Discord.js (infrastructure)
 * - Erreurs de commandes: Gérées dans Bot.registerInteractionHandler()
 * - Erreurs métier: Gérées localement dans chaque service/commande
 *
 * **Note importante**: Cet événement ne capture PAS les erreurs dans votre code,
 * seulement les erreurs émises par le client Discord.js lui-même.
 */
export default class ErrorEvent extends BaseEvent {
    public name = Events.Error;
    public once = false;

    private logger: LoggerService;
    private services: ServiceContainer;

    /**
     * Crée une instance de l'événement Error
     *
     * @remarks
     * Initialise les services nécessaires:
     * - ServiceContainer: Pour accéder à logger et dbLogger
     * - LoggerService: Pour les logs console avec stack trace
     */
    constructor() {
        super();
        this.services = ServiceContainer.getInstance();
        this.logger = this.services.logger;
    }

    /**
     * Exécute la logique de l'événement lors d'une erreur Discord.js
     *
     * @param error - L'objet Error émis par Discord.js
     * @returns Promise qui se résout après logging complet
     *
     * @remarks
     * **Séquence d'exécution**:
     * 1. Log console error avec stack trace complète via LoggerService
     * 2. Enregistrement dans system_logs via dbLogger.logSystem():
     *    - level: 'error'
     *    - category: 'discord'
     *    - message: "Erreur Discord: {error.message}"
     *    - context: { errorName, errorMessage, errorStack }
     *
     * **Gestion des erreurs**:
     * - dbLogger.logSystem() est fail-safe (pas de throw)
     * - En cas d'erreur DB, l'événement continue sans crasher
     * - L'erreur reste visible en console même si le log DB échoue
     *
     * **Pas de throw**:
     * - Cet événement ne doit JAMAIS throw d'erreur
     * - Sinon, une boucle infinie d'erreurs pourrait se produire
     * - Le bot doit rester stable même lors d'erreurs Discord
     *
     * **Types d'erreurs courantes**:
     * - WebSocket errors: Perte de connexion Discord
     * - API errors: Rate limit, erreurs 5xx de l'API Discord
     * - Timeout errors: Timeout de requêtes API
     *
     * @example
     * ```typescript
     * // Erreur typique capturée
     * Error: Connection to Discord lost
     *   at WebSocketManager.reconnect (...)
     *   at ...
     * ```
     */
    public async execute(error: Error): Promise<void> {
        this.logger.error('❌ Erreur Discord détectée', 'discord', error);

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

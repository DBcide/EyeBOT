import {
    ChatInputCommandInteraction,
    Client,
    Collection,
    GatewayIntentBits,
    Events,
    Interaction,
    MessageFlags,
} from 'discord.js';
import { BaseCommand } from './BaseCommand';
import { BaseEvent } from './BaseEvent';
import { LoggerService } from '../shared/services/LoggerService';
import { ServiceContainer } from '../shared/services/ServiceContainer';
import { HealthMonitorService } from '../shared/services/HealthMonitorService';
<<<<<<< HEAD
import { commonI18n } from '../shared/i18n';
import fs from 'fs';
import path from 'path';
=======
import fs from 'node:fs';
import path from 'node:path';
>>>>>>> fc702880329b712be25dc0220687c57c247aaf1a

/**
 * Classe principale du bot qui gère l'initialisation et l'orchestration
 *
 * @remarks
 * Utilise le pattern de découverte automatique pour charger les commandes et événements
 * depuis le dossier features/. Toutes les dépendances sont gérées via le ServiceContainer.
 */
export class Bot {
    public client: Client;
    public commands: Collection<string, BaseCommand>;
    private readonly logger: LoggerService;
    private readonly services: ServiceContainer;
    private readonly healthMonitor: HealthMonitorService;

    /**
     * Crée une nouvelle instance du bot
     *
     * @remarks
     * Initialise les services dans l'ordre suivant:
     * 1. ServiceContainer (singleton)
     * 2. Logger (avec connexion DB)
     * 3. HealthMonitor (avec logger partagé)
     * 4. Discord Client (avec intents configurés)
     */
    constructor() {
        this.services = ServiceContainer.getInstance();
        this.logger = this.services.logger;
        this.healthMonitor = new HealthMonitorService(this.services.logger);

        // Seuls les intents réellement utilisés : Guilds (serveurs, salons, interactions)
        // et GuildMembers (fetch des membres + renommage). Les intents privilégiés
        // GuildPresences / MessageContent n'étaient utilisés nulle part et coûtaient
        // de la mémoire (cache des présences) et du trafic gateway.
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
            ]
        });

        this.commands = new Collection();
    }

    /**
     * Démarre le bot et initialise tous les composants
     *
     * @throws {Error} Si la connexion à la base de données échoue
     * @throws {Error} Si le token Discord est invalide
     *
     * @remarks
     * Séquence de démarrage:
     * 1. Connexion à la base de données (pour permettre le logging)
     * 2. Chargement des commandes (auto-discovery)
     * 3. Chargement des événements (auto-discovery)
     * 4. Enregistrement du gestionnaire d'interactions
     * 5. Connexion à Discord
     * 6. Démarrage du health monitor (après connexion Discord)
     *
     * @example
     * ```typescript
     * const bot = new Bot();
     * await bot.start();
     * ```
     */
    public async start(): Promise<void> {
        await this.services.database.testConnection();

        this.logger.info('Démarrage du bot...', 'startup');

        await this.loadCommands();
        await this.loadEvents();
        this.registerInteractionHandler();

        // Le listener doit être posé AVANT login() : sinon l'événement ready peut
        // être émis avant l'enregistrement et le health monitor ne démarre jamais.
        this.client.once(Events.ClientReady, () => {
            this.healthMonitor.start(this.client);
            this.logger.success('Bot démarré et connecté à Discord', 'startup');
        });

        await this.client.login(process.env.DISCORD_TOKEN);
    }

    /**
     * Charge automatiquement toutes les commandes depuis le dossier features/
     *
     * @remarks
     * Structure de dossier attendue: `features/<feature>/commands/<CommandName>Command.ts`
     *
     * Chaque fichier de commande doit:
     * - Exporter une classe default qui étend BaseCommand
     * - Implémenter les propriétés name, description
     * - Implémenter les méthodes buildCommand() et execute()
     *
     * Les erreurs de chargement sont loggées mais ne bloquent pas le démarrage
     */
    private async loadCommands(): Promise<void> {
        const featuresPath = path.join(__dirname, '../features');

        if (!fs.existsSync(featuresPath)) {
            this.logger.warn('Aucun dossier features trouvé', 'startup');
            return;
        }

        const features = fs.readdirSync(featuresPath);

        for (const feature of features) {
            const commandsPath = path.join(featuresPath, feature, 'commands');

            if (!fs.existsSync(commandsPath)) continue;

            const commandFiles = fs
                .readdirSync(commandsPath)
                .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    const { default: CommandClass } = await import(filePath);

                    const command: BaseCommand = new CommandClass();
                    this.commands.set(command.name, command);

                    this.logger.success(`Commande chargée: /${command.name} (feature: ${feature})`, 'startup');
                } catch (error) {
                    this.logger.error(`Erreur lors du chargement de ${file}`, 'startup', error);
                }
            }
        }

        this.logger.info(`Total: ${this.commands.size} commande(s) chargée(s)`, 'startup');
    }

    /**
     * Charge automatiquement tous les événements depuis le dossier features/
     *
     * @remarks
     * Structure de dossier attendue: `features/<feature>/events/<EventName>Event.ts`
     *
     * Chaque fichier d'événement doit:
     * - Exporter une classe default qui étend BaseEvent
     * - Implémenter les propriétés name et once
     * - Implémenter la méthode execute()
     *
     * Les événements sont enregistrés automatiquement sur le client Discord
     * Les erreurs de chargement sont loggées mais ne bloquent pas le démarrage
     */
    private async loadEvents(): Promise<void> {
        const featuresPath = path.join(__dirname, '../features');

        if (!fs.existsSync(featuresPath)) {
            this.logger.warn('Aucun dossier features trouvé', 'startup');
            return;
        }

        const features = fs.readdirSync(featuresPath);
        let eventCount = 0;

        for (const feature of features) {
            const eventsPath = path.join(featuresPath, feature, 'events');

            if (!fs.existsSync(eventsPath)) continue;

            const eventFiles = fs
                .readdirSync(eventsPath)
                .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

            for (const file of eventFiles) {
                try {
                    const filePath = path.join(eventsPath, file);
                    const { default: EventClass } = await import(filePath);

                    const event: BaseEvent = new EventClass();

                    // Une erreur dans un handler ne doit jamais devenir une promesse rejetée non gérée
                    const listener = (...args: any[]) => {
                        event.execute(...args).catch((error) => {
                            this.logger.error(`Erreur dans l'événement ${event.name}`, 'discord', error);
                        });
                    };

                    if (event.once) {
                        this.client.once(event.name, listener);
                    } else {
                        this.client.on(event.name, listener);
                    }

                    this.logger.success(`Événement chargé: ${event.name} (feature: ${feature}, once: ${event.once})`, 'startup');
                    eventCount++;
                } catch (error) {
                    this.logger.error(`Erreur lors du chargement de ${file}`, 'startup', error);
                }
            }
        }

        this.logger.info(`Total: ${eventCount} événement(s) chargé(s)`, 'startup');
    }

    /**
     * Récupère l'ID du personnage Albion principal d'un utilisateur Discord
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @returns L'ID du personnage Albion (is_main = 1 en priorité) ou null si aucun
     *
     * @remarks
     * Utilisé pour enrichir les logs de commandes avec l'identité Albion de l'utilisateur
     * Priorise les personnages marqués comme "main", sinon retourne le premier par date
     * Retourne null silencieusement en cas d'erreur pour ne pas bloquer le logging
     */
    private async getUserMainAlbionId(discordId: string): Promise<string | null> {
        try {
            const users = await this.services.database.select<{ albion_id: string; is_main: number }>(
                'SELECT albion_id, is_main FROM tracer_users WHERE discord_id = ? ORDER BY is_main DESC, registered_at ASC',
                [discordId]
            );

            if (users.length === 0) return null;

            return users[0].albion_id;
        } catch (error) {
            return null;
        }
    }

    /**
     * Enregistre le gestionnaire d'interactions Discord pour router les commandes
     *
     * @remarks
     * Fonctionnalités:
     * - Filtre les interactions pour ne traiter que les commandes slash
     * - Route chaque commande vers son handler approprié
     * - Log automatiquement toutes les exécutions (succès et erreur) en DB
     * - Capture l'albion_character_id de l'utilisateur pour enrichir les logs
     * - Gère les erreurs avec réponse utilisateur appropriée (ephemeral)
     * - Mesure la durée d'exécution pour le monitoring
     */
    private registerInteractionHandler(): void {
        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const command = this.commands.get(interaction.commandName);

            if (!command) {
                this.logger.warn(`Commande inconnue: ${interaction.commandName}`, 'discord');
                return;
            }

            const commandOptions: Record<string, any> = {};
            interaction.options.data.forEach(option => {
                commandOptions[option.name] = option.value;
            });

            const startTime = Date.now();

            try {
                this.logger.debug(`Exécution de /${interaction.commandName} par ${interaction.user.tag}`, 'discord');
                await command.execute(interaction);

                const albionCharacterId = await this.getUserMainAlbionId(interaction.user.id);

                await this.services.dbLogger.logCommand({
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: interaction.commandName,
                    commandOptions,
                    albionCharacterId,
                    status: 'success',
                });

                const duration = Date.now() - startTime;
                this.logger.debug(`Commande /${interaction.commandName} terminée en ${duration}ms`, 'discord');
            } catch (error: any) {
                this.logger.error(`Erreur lors de l'exécution de /${interaction.commandName}`, 'discord', error);

                const albionCharacterId = await this.getUserMainAlbionId(interaction.user.id);

                await this.services.dbLogger.logCommand({
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: interaction.commandName,
                    commandOptions,
                    albionCharacterId,
                    status: 'error',
                    errorMessage: error?.message || String(error),
                });

                await this.replyWithError(interaction);
            }
        });
    }

    /**
     * Informe l'utilisateur qu'une commande a échoué
     *
     * @param interaction - L'interaction de la commande en erreur
     *
     * @remarks
     * La réponse peut elle-même échouer (interaction expirée, salon supprimé…).
     * Cette erreur est loggée mais jamais propagée, sinon elle remonterait en
     * promesse rejetée non gérée depuis le listener InteractionCreate.
     */
    private async replyWithError(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const t = commonI18n.for(await this.services.locale.resolveForInteraction(interaction));
            const errorMessage = {
                content: t('common.errors.command'),
                flags: MessageFlags.Ephemeral,
            } as const;

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            this.logger.warn(`Impossible de notifier l'erreur de /${interaction.commandName} à l'utilisateur`, 'discord', {
                error: replyError instanceof Error ? replyError.message : String(replyError),
            });
        }
    }

    /**
     * Charge uniquement les commandes sans démarrer le bot
     *
     * @remarks
     * Utilisé par le script d'enregistrement des commandes Discord (register-commands.ts)
     * pour obtenir la liste des commandes à enregistrer via l'API Discord sans démarrer le bot complet
     */
    public async loadCommandsOnly(): Promise<void> {
        await this.loadCommands();
    }

    /**
     * Arrête proprement le bot et libère toutes les ressources
     *
     * @param reason - La raison de l'arrêt (pour les logs et le monitoring)
     *
     * @remarks
     * Séquence d'arrêt propre:
     * 1. Arrêt du health monitor (stop intervals)
     * 2. Déconnexion du client Discord
     * 3. Attente des écritures de logs en cours (logger.flush())
     * 4. Fermeture de la connexion à la base de données
     *
     * Les logs émis avant l'étape 4 sont écrits en base ; les suivants en console seulement.
     * Les erreurs d'arrêt sont loggées mais ne bloquent pas la suite de la séquence.
     *
     * @example
     * ```typescript
     * await bot.shutdown('SIGTERM');
     * ```
     */
    public async shutdown(reason: string): Promise<void> {
        // Seul log annonçant l'arrêt (index.ts ne le relogue pas). Chaque étape ci-dessous
        // est loguée par le service concerné : on ne la répète pas ici.
        this.logger.warn(`Arrêt du bot: ${reason}`, 'shutdown');

        try {
            this.healthMonitor.stop();

            // destroy() est appelé même si le client n'est pas "ready" (ex: reconnexion en cours),
            // sinon la websocket resterait ouverte pendant l'arrêt
            await this.client.destroy();
            this.logger.info('Déconnexion Discord réussie', 'shutdown');

            // Les logs partent en base en arrière-plan : on attend qu'ils soient écrits
            // avant de fermer le pool, sinon les logs d'arrêt sont perdus ("Pool is closed")
            await this.logger.flush();
            await this.services.database.close();

            // Après fermeture du pool, ce log n'est plus qu'en console
            this.logger.success('Arrêt propre du bot terminé', 'shutdown');
        } catch (error) {
            this.logger.error('Erreur lors de l\'arrêt du bot', 'shutdown', error);
        }
    }
}

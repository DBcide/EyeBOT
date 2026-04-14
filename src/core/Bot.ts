import { Client, Collection, GatewayIntentBits, Events, Interaction } from 'discord.js';
import { BaseCommand } from './BaseCommand';
import { BaseEvent } from './BaseEvent';
import { LoggerService } from '../shared/services/LoggerService';
import { ServiceContainer } from '../shared/services/ServiceContainer';
import { HealthMonitorService } from '../shared/services/HealthMonitorService';
import fs from 'fs';
import path from 'path';

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
    private logger: LoggerService;
    private services: ServiceContainer;
    private healthMonitor: HealthMonitorService;

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

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildPresences,
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

        this.logger.info('🚀 Démarrage du bot...', 'startup');

        await this.loadCommands();
        await this.loadEvents();
        this.registerInteractionHandler();
        await this.client.login(process.env.DISCORD_TOKEN);

        this.client.once(Events.ClientReady, () => {
            this.healthMonitor.start(this.client);
            this.logger.success('✅ Bot démarré et connecté à Discord', 'startup');
        });
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
            this.logger.warn('⚠️  Aucun dossier features trouvé', 'startup');
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

        this.logger.info(`📦 Total: ${this.commands.size} commande(s) chargée(s)`, 'startup');
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
            this.logger.warn('⚠️  Aucun dossier features trouvé', 'startup');
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

                    if (event.once) {
                        this.client.once(event.name, (...args) => event.execute(...args));
                    } else {
                        this.client.on(event.name, (...args) => event.execute(...args));
                    }

                    this.logger.success(`Événement chargé: ${event.name} (feature: ${feature}, once: ${event.once})`, 'startup');
                    eventCount++;
                } catch (error) {
                    this.logger.error(`Erreur lors du chargement de ${file}`, 'startup', error);
                }
            }
        }

        this.logger.info(`📦 Total: ${eventCount} événement(s) chargé(s)`, 'startup');
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
                this.logger.debug(`✅ Commande /${interaction.commandName} terminée en ${duration}ms`, 'discord');
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

                const errorMessage = { content: '❌ Une erreur est survenue lors de l\'exécution de cette commande.', ephemeral: true };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        });
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
     * 3. Fermeture de la connexion à la base de données
     *
     * Tous les logs d'arrêt sont écrits en base de données avant la fermeture.
     * Les erreurs d'arrêt sont loggées mais ne bloquent pas la suite de la séquence.
     *
     * @example
     * ```typescript
     * await bot.shutdown('SIGTERM');
     * ```
     */
    public async shutdown(reason: string): Promise<void> {
        this.logger.warn(`🛑 Arrêt du bot: ${reason}`, 'shutdown');

        try {
            this.healthMonitor.stop();
            this.logger.info('✅ Health Monitor arrêté', 'shutdown');

            if (this.client.isReady()) {
                await this.client.destroy();
                this.logger.info('✅ Déconnexion Discord réussie', 'shutdown');
            }

            await this.services.database.close();
            this.logger.info('✅ Connexion DB fermée', 'shutdown');

            this.logger.success('✅ Arrêt propre du bot terminé', 'shutdown');
        } catch (error) {
            this.logger.error('❌ Erreur lors de l\'arrêt du bot', 'shutdown', error);
        }
    }
}

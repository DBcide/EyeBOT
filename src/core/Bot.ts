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
 */
export class Bot {
    public client: Client;
    public commands: Collection<string, BaseCommand>;
    private logger: LoggerService;
    private services: ServiceContainer;
    private healthMonitor: HealthMonitorService;

    constructor() {
        this.logger = new LoggerService();
        this.services = ServiceContainer.getInstance();
        this.healthMonitor = new HealthMonitorService();

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
     * Démarre le bot : charge les commandes, les événements et se connectent à Discord
     */
    public async start(): Promise<void> {
        this.logger.info('🚀 Démarrage du bot...');

        await this.services.database.testConnection();

        await this.loadCommands();
        await this.loadEvents();
        this.registerInteractionHandler();
        await this.client.login(process.env.DISCORD_TOKEN);

        // Démarrer le health monitor après la connexion Discord
        this.client.once(Events.ClientReady, () => {
            this.healthMonitor.start(this.client);
        });
    }

    /**
     * Charge automatiquement toutes les commandes depuis toutes les features
     */
    private async loadCommands(): Promise<void> {
        const featuresPath = path.join(__dirname, '../features');

        // Vérifier si le dossier features existe
        if (!fs.existsSync(featuresPath)) {
            this.logger.warn('⚠️  Aucun dossier features trouvé');
            return;
        }

        // Lister tous les dossiers de features (moderation, economy, etc.)
        const features = fs.readdirSync(featuresPath);

        for (const feature of features) {
            const commandsPath = path.join(featuresPath, feature, 'commands');

            // Vérifier si la feature a un dossier commands
            if (!fs.existsSync(commandsPath)) continue;

            // Lister tous les fichiers de commandes
            const commandFiles = fs
                .readdirSync(commandsPath)
                .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

            // Charger chaque commande
            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    const { default: CommandClass } = await import(filePath);

                    // Créer une instance de la commande
                    const command: BaseCommand = new CommandClass();

                    // Ajouter la commande à la collection
                    this.commands.set(command.name, command);

                    this.logger.success(`Commande chargée: /${command.name} (feature: ${feature})`);
                } catch (error) {
                    this.logger.error(`Erreur lors du chargement de ${file}`, error);
                }
            }
        }

        this.logger.info(`📦 Total: ${this.commands.size} commande(s) chargée(s)`);
    }

    /**
     * Charge automatiquement tous les événements depuis toutes les features
     */
    private async loadEvents(): Promise<void> {
        const featuresPath = path.join(__dirname, '../features');

        if (!fs.existsSync(featuresPath)) {
            this.logger.warn('⚠️  Aucun dossier features trouvé');
            return;
        }

        const features = fs.readdirSync(featuresPath);
        let eventCount = 0;

        for (const feature of features) {
            const eventsPath = path.join(featuresPath, feature, 'events');

            // Vérifier si la feature a un dossier events
            if (!fs.existsSync(eventsPath)) continue;

            // Lister tous les fichiers d'événements
            const eventFiles = fs
                .readdirSync(eventsPath)
                .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

            // Charger chaque événement
            for (const file of eventFiles) {
                try {
                    const filePath = path.join(eventsPath, file);
                    const { default: EventClass } = await import(filePath);

                    // Créer une instance de l'événement
                    const event: BaseEvent = new EventClass();

                    // Enregistrer l'événement sur le client Discord
                    if (event.once) {
                        this.client.once(event.name, (...args) => event.execute(...args));
                    } else {
                        this.client.on(event.name, (...args) => event.execute(...args));
                    }

                    this.logger.success(`Événement chargé: ${event.name} (feature: ${feature}, once: ${event.once})`);
                    eventCount++;
                } catch (error) {
                    this.logger.error(`Erreur lors du chargement de ${file}`, error);
                }
            }
        }

        this.logger.info(`📦 Total: ${eventCount} événement(s) chargé(s)`);
    }

    /**
     * Enregistre le gestionnaire d'interactions pour exécuter les commandes
     */
    private registerInteractionHandler(): void {
        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            // On ne traite que les commandes slash
            if (!interaction.isChatInputCommand()) return;

            // Récupérer la commande correspondante
            const command = this.commands.get(interaction.commandName);

            if (!command) {
                this.logger.warn(`Commande inconnue: ${interaction.commandName}`);
                return;
            }

            // Préparer les données pour le log
            const commandOptions: Record<string, any> = {};
            interaction.options.data.forEach(option => {
                commandOptions[option.name] = option.value;
            });

            const startTime = Date.now();

            try {
                // Exécuter la commande
                this.logger.debug(`Exécution de /${interaction.commandName} par ${interaction.user.tag}`);
                await command.execute(interaction);

                // Log de succès
                await this.services.dbLogger.logCommand({
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: interaction.commandName,
                    commandOptions,
                    status: 'success',
                });

                const duration = Date.now() - startTime;
                this.logger.debug(`✅ Commande /${interaction.commandName} terminée en ${duration}ms`);
            } catch (error: any) {
                this.logger.error(`Erreur lors de l'exécution de /${interaction.commandName}`, error);

                // Log d'erreur
                await this.services.dbLogger.logCommand({
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: interaction.commandName,
                    commandOptions,
                    status: 'error',
                    errorMessage: error?.message || String(error),
                });

                // Répondre à l'utilisateur en cas d'erreur
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
     * Utilisé par le script d'enregistrement des commandes
     */
    public async loadCommandsOnly(): Promise<void> {
        await this.loadCommands();
    }

    /**
     * Arrête proprement le bot (déconnexion Discord, arrêt monitoring, fermeture DB)
     */
    public async shutdown(reason: string): Promise<void> {
        this.logger.warn(`🛑 Arrêt du bot: ${reason}`);

        try {
            // Arrêter le health monitor
            this.healthMonitor.stop();
            this.logger.info('✅ Health Monitor arrêté');

            // Déconnecter Discord
            if (this.client.isReady()) {
                await this.client.destroy();
                this.logger.info('✅ Déconnexion Discord réussie');
            }

            // Fermer la connexion à la base de données
            await this.services.database.close();
            this.logger.info('✅ Connexion DB fermée');

            this.logger.success('✅ Arrêt propre du bot terminé');
        } catch (error) {
            this.logger.error('❌ Erreur lors de l\'arrêt du bot', error);
        }
    }
}

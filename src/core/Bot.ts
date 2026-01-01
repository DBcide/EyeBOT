import { Client, Collection, GatewayIntentBits, Events, Interaction } from 'discord.js';
import { BaseCommand } from './BaseCommand';
import { BaseEvent } from './BaseEvent';
import { LoggerService } from '../shared/services/LoggerService';
import fs from 'fs';
import path from 'path';

/**
 * Classe principale du bot qui gère l'initialisation et l'orchestration
 */
export class Bot {
    /**
     * Client Discord.js - l'interface avec Discord
     */
    public client: Client;

    /**
     * Collection de toutes les commandes chargées
     * Key: nom de la commande, Value: instance de la commande
     */
    public commands: Collection<string, BaseCommand>;

    /**
     * Service de logging
     */
    private logger: LoggerService;

    constructor() {
        // Initialiser le logger
        this.logger = new LoggerService();

        // Initialiser le client Discord avec les intents nécessaires
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,              // Événements de serveur
                GatewayIntentBits.GuildMembers,        // Événements de membres
                GatewayIntentBits.GuildMessages,       // Événements de messages
                GatewayIntentBits.MessageContent,      // Contenu des messages
                GatewayIntentBits.GuildPresences,      // Statuts des membres (online, offline, etc.)
            ]
        });

        // Initialiser la collection de commandes
        this.commands = new Collection();
    }

    /**
     * Démarre le bot : charge les commandes, les événements et se connecte à Discord
     */
    public async start(): Promise<void> {
        this.logger.info('🚀 Démarrage du bot...');

        // 1. Charger toutes les commandes
        await this.loadCommands();

        // 2. Charger tous les événements
        await this.loadEvents();

        // 3. Enregistrer le gestionnaire d'interactions pour les commandes
        this.registerInteractionHandler();

        // 4. Se connecter à Discord
        await this.client.login(process.env.DISCORD_TOKEN);
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

            try {
                // Exécuter la commande
                this.logger.debug(`Exécution de /${interaction.commandName} par ${interaction.user.tag}`);
                await command.execute(interaction);
            } catch (error) {
                this.logger.error(`Erreur lors de l'exécution de /${interaction.commandName}`, error);

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
}

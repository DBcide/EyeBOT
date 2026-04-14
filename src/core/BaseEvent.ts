/**
 * Classe abstraite définissant le contrat pour tous les gestionnaires d'événements Discord
 *
 * @remarks
 * **Architecture d'événements**:
 * - Tous les événements du bot doivent hériter de cette classe abstraite
 * - Auto-découverts par Bot.ts depuis `src/features/FEATURE/events/EventName.ts`
 * - Enregistrés automatiquement avec le client Discord au démarrage
 * - Déclenchés automatiquement par Discord.js lors d'événements Discord
 *
 * **Contrat obligatoire**:
 * - **name**: Nom de l'événement Discord (ex: "ready", "guildMemberAdd")
 * - **once**: true pour écoute unique, false pour écoute continue
 * - **execute()**: Logique d'exécution de l'événement (reçoit args spécifiques à l'événement)
 *
 * **Cycle de vie d'un événement**:
 * 1. Création du fichier `src/features/FEATURE/events/MyEvent.ts`
 * 2. Classe héritant de BaseEvent avec implémentations concrètes
 * 3. Export default de la classe
 * 4. Auto-découverte par Bot.loadEvents() au démarrage
 * 5. Enregistrement avec client.on(name, execute) ou client.once(name, execute)
 * 6. Déclenchement automatique lors d'événements Discord
 *
 * **Différence avec BaseCommand**:
 * - BaseCommand: Déclenchée par utilisateur (slash command)
 * - BaseEvent: Déclenchée par Discord automatiquement (ready, guildMemberAdd, etc.)
 *
 * **Structure d'un fichier d'événement**:
 * ```typescript
 * import { BaseEvent } from '../../../core/BaseEvent';
 * import { Guild } from 'discord.js';
 * import { ServiceContainer } from '../../../shared/services/ServiceContainer';
 *
 * export default class GuildCreateEvent extends BaseEvent {
 *     public name = 'guildCreate';
 *     public once = false;
 *
 *     public async execute(guild: Guild): Promise<void> {
 *         const services = ServiceContainer.getInstance();
 *         services.logger.info(`Bot ajouté au serveur: ${guild.name}`, 'discord');
 *         await services.database.insert('INSERT INTO guilds (guild_id, name) VALUES (?, ?)', [guild.id, guild.name]);
 *     }
 * }
 * ```
 *
 * **Événements Discord.js courants**:
 * - **ready**: Bot connecté et prêt (once: true)
 * - **guildCreate**: Bot ajouté à un serveur
 * - **guildDelete**: Bot retiré d'un serveur
 * - **guildMemberAdd**: Nouveau membre dans un serveur
 * - **guildMemberRemove**: Membre quitte un serveur
 * - **guildMemberUpdate**: Membre modifié (pseudo, rôles, etc.)
 * - **interactionCreate**: Interaction Discord (slash command, bouton, etc.)
 *
 * **Bonnes pratiques**:
 * - Utiliser ServiceContainer.getInstance() pour accéder aux services partagés
 * - Gérer les erreurs avec try/catch (un crash d'event ne doit pas crasher le bot)
 * - Logger les événements importants via LoggerService
 * - Éviter les opérations longues (> 1s) dans les événements fréquents
 * - Utiliser once: true pour les événements uniques (ready, etc.)
 *
 * **Événements existants dans EyeBOT**:
 * - **tracer/ReadyEvent**: Initialisation du bot au démarrage
 * - **tracer/GuildCreateEvent**: Enregistrement des nouveaux serveurs
 * - **tracer/GuildDeleteEvent**: Nettoyage lors du retrait du bot
 *
 * @see Bot.loadEvents() - Auto-découverte des événements
 * @see https://discord.js.org/docs/packages/discord.js/main/Client:Class#events - Liste complète des événements
 */
export abstract class BaseEvent {
    /**
     * Nom de l'événement Discord (ex: "ready", "guildMemberAdd", "messageCreate")
     * Liste complète: https://discord.js.org/docs/packages/discord.js/main/Client:Class#events
     */
    public abstract name: string;

    /**
     * Détermine si l'événement doit être écouté une seule fois ou en continu
     *
     * @remarks
     * **Valeurs**:
     * - **true**: L'événement est écouté une seule fois (client.once)
     *   - Après le premier déclenchement, le listener est automatiquement retiré
     *   - Utilisation: Événements uniques comme "ready"
     *
     * - **false**: L'événement est écouté en continu (client.on)
     *   - Le listener reste actif et se déclenche à chaque occurrence
     *   - Utilisation: Événements récurrents comme "guildMemberAdd", "guildCreate"
     *
     * **Exemples d'événements once: true**:
     * - ready: Bot connecté et prêt (une seule fois au démarrage)
     * - shardReady: Shard connecté (une fois par shard)
     *
     * **Exemples d'événements once: false**:
     * - guildCreate: Chaque fois que le bot rejoint un serveur
     * - guildMemberAdd: Chaque fois qu'un membre rejoint
     * - interactionCreate: Chaque interaction utilisateur
     *
     * **Note**: Une fois enregistré, le comportement ne change pas pendant l'exécution
     */
    public abstract once: boolean;

    /**
     * Exécute la logique de l'événement lors de son déclenchement par Discord
     *
     * @param args - Arguments fournis par Discord.js (varient selon le type d'événement)
     * @returns Promise qui se résout après traitement complet de l'événement
     *
     * @remarks
     * **Point d'entrée principal** de l'événement, appelé par Bot.ts lors du déclenchement.
     *
     * **Arguments par type d'événement**:
     * - **ready**: `(client: Client)` - Le client Discord connecté
     * - **guildCreate**: `(guild: Guild)` - Le serveur rejoint
     * - **guildDelete**: `(guild: Guild)` - Le serveur quitté
     * - **guildMemberAdd**: `(member: GuildMember)` - Le nouveau membre
     * - **guildMemberRemove**: `(member: GuildMember)` - Le membre parti
     * - **guildMemberUpdate**: `(oldMember: GuildMember, newMember: GuildMember)`
     * - **interactionCreate**: `(interaction: Interaction)` - L'interaction Discord
     *
     * **Responsabilités**:
     * 1. Extraire les données nécessaires depuis les arguments
     * 2. Exécuter la logique métier (DB, API, calculs)
     * 3. Gérer les erreurs avec try/catch (CRITIQUE: ne pas crasher le bot)
     * 4. Logger les actions importantes
     *
     * **Gestion des erreurs (CRITIQUE)**:
     * - **TOUJOURS** utiliser try/catch dans execute()
     * - Un crash d'événement ne doit JAMAIS crasher le bot entier
     * - Logger l'erreur mais continuer l'exécution
     *
     * ```typescript
     * public async execute(guild: Guild): Promise<void> {
     *     const services = ServiceContainer.getInstance();
     *     try {
     *         // Logique métier
     *         await services.database.insert('...');
     *         services.logger.success('Serveur enregistré', 'discord');
     *     } catch (error) {
     *         services.logger.error('Erreur dans guildCreate', 'discord', error);
     *         // PAS de throw - continuer l'exécution
     *     }
     * }
     * ```
     *
     * **Performance**:
     * - Éviter les opérations longues dans les événements fréquents
     * - Utiliser des tâches asynchrones si nécessaire (ne pas bloquer)
     * - Les événements comme interactionCreate doivent répondre rapidement
     *
     * **Typage des arguments**:
     * Bien que la signature soit `...args: any[]`, vous devriez typer explicitement:
     * ```typescript
     * // ✅ Bon
     * public async execute(guild: Guild): Promise<void> { ... }
     *
     * // ❌ Éviter
     * public async execute(...args: any[]): Promise<void> {
     *     const guild = args[0] as Guild;
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Événement ready (once: true)
     * export default class ReadyEvent extends BaseEvent {
     *     public name = 'ready';
     *     public once = true;
     *
     *     public async execute(client: Client): Promise<void> {
     *         const services = ServiceContainer.getInstance();
     *         services.logger.success(`Bot connecté: ${client.user?.tag}`, 'bot');
     *     }
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Événement guildCreate (once: false)
     * export default class GuildCreateEvent extends BaseEvent {
     *     public name = 'guildCreate';
     *     public once = false;
     *
     *     public async execute(guild: Guild): Promise<void> {
     *         const services = ServiceContainer.getInstance();
     *         try {
     *             await services.database.insert(
     *                 'INSERT INTO guilds (guild_id, name) VALUES (?, ?)',
     *                 [guild.id, guild.name]
     *             );
     *             services.logger.info(`Bot ajouté au serveur: ${guild.name}`, 'discord');
     *         } catch (error) {
     *             services.logger.error('Erreur enregistrement serveur', 'discord', error);
     *         }
     *     }
     * }
     * ```
     */
    public abstract execute(...args: any[]): Promise<void>;
}

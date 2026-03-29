import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

/**
 * Classe abstraite définissant le contrat pour toutes les commandes slash Discord
 *
 * @remarks
 * **Architecture de commandes**:
 * - Toutes les commandes du bot doivent hériter de cette classe abstraite
 * - Auto-découvertes par Bot.ts depuis `src/features/FEATURE/commands/CommandName.ts`
 * - Enregistrées avec l'API Discord via `npm run register`
 * - Routées automatiquement lors des interactions Discord
 *
 * **Contrat obligatoire**:
 * - **name**: Nom de la commande (ex: "register", "verify", "updateall")
 * - **description**: Description affichée dans Discord
 * - **buildCommand()**: Définit les options/paramètres de la commande (SlashCommandBuilder)
 * - **execute()**: Logique d'exécution de la commande (reçoit ChatInputCommandInteraction)
 *
 * **Cycle de vie d'une commande**:
 * 1. Création du fichier `src/features/FEATURE/commands/MyCommand.ts`
 * 2. Classe héritant de BaseCommand avec implémentations concrètes
 * 3. Export default de la classe
 * 4. Auto-découverte par Bot.loadCommands() au démarrage
 * 5. Enregistrement avec Discord API via `npm run register`
 * 6. Routage automatique: `interactionCreate` → Bot → execute()
 *
 * **Structure d'un fichier de commande**:
 * ```typescript
 * import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
 * import { BaseCommand } from '../../../core/BaseCommand';
 *
 * export default class MyCommand extends BaseCommand {
 *     public name = 'mycommand';
 *     public description = 'Description de ma commande';
 *
 *     public buildCommand(): SlashCommandBuilder {
 *         return new SlashCommandBuilder()
 *             .setName(this.name)
 *             .setDescription(this.description)
 *             .addStringOption(option =>
 *                 option.setName('param').setDescription('Un paramètre').setRequired(true)
 *             ) as SlashCommandBuilder;
 *     }
 *
 *     public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
 *         const param = interaction.options.getString('param', true);
 *         await interaction.reply(`Vous avez dit: ${param}`);
 *     }
 * }
 * ```
 *
 * **Bonnes pratiques**:
 * - Utiliser ServiceContainer.getInstance() pour accéder aux services partagés
 * - Gérer les erreurs avec try/catch et reply en cas d'échec
 * - Utiliser deferReply() pour les opérations longues (> 3 secondes)
 * - Logger les actions importantes via LoggerService
 * - Valider les permissions au début de execute() si nécessaire
 *
 * **Commandes existantes**:
 * - **tracer/RegisterCommand**: Enregistrement de personnages Albion
 * - **tracer/UpdateCommand**: Mise à jour d'un personnage
 * - **tracer/UpdateAllCommand**: Mise à jour de tous les membres (admin)
 * - **tracer/VerifyCommand**: Vérification manuelle (owner)
 *
 * @see Bot.loadCommands() - Auto-découverte des commandes
 * @see src/scripts/register-commands.ts - Enregistrement avec Discord API
 */
export abstract class BaseCommand {
    /**
     * Nom de la commande (doit correspondre au nom dans buildCommand)
     *
     * @remarks
     * - Utilisé pour le routage des interactions
     * - Doit être en minuscules, sans espaces
     * - Exemples: "register", "verify", "updateall"
     */
    public abstract name: string;

    /**
     * Description courte de la commande affichée dans Discord
     *
     * @remarks
     * - Affichée dans l'autocomplétion Discord (liste des commandes)
     * - Doit être concise (< 100 caractères)
     * - Exemples: "Enregistrer un personnage Albion", "Vérifier un personnage"
     */
    public abstract description: string;

    /**
     * Construit la définition de la commande slash pour l'API Discord
     *
     * @returns SlashCommandBuilder configuré avec nom, description et options
     *
     * @remarks
     * Définit la structure de la commande envoyée à l'API Discord:
     * - Nom et description (obligatoires)
     * - Options/paramètres (optionnel): String, Integer, User, Channel, etc.
     * - Sous-commandes (optionnel)
     * - Permissions requises (optionnel)
     *
     * **Cast nécessaire**: Retourner `as SlashCommandBuilder` après ajout d'options
     * pour éviter les problèmes de typage TypeScript.
     *
     * @example
     * ```typescript
     * public buildCommand(): SlashCommandBuilder {
     *     return new SlashCommandBuilder()
     *         .setName(this.name)
     *         .setDescription(this.description)
     *         .addStringOption(option =>
     *             option.setName('pseudo').setDescription('Pseudo Albion').setRequired(true)
     *         ) as SlashCommandBuilder;
     * }
     * ```
     */
    public abstract buildCommand(): SlashCommandBuilder;

    /**
     * Exécute la logique de la commande lors d'une interaction Discord
     *
     * @param interaction - L'interaction Discord reçue (contient options, user, guild, etc.)
     * @returns Promise qui se résout après traitement complet de la commande
     *
     * @remarks
     * **Point d'entrée principal** de la commande, appelé par Bot.ts lors d'une interaction.
     *
     * **Responsabilités**:
     * 1. Extraire les paramètres via `interaction.options.getString()`, etc.
     * 2. Valider les permissions si nécessaire
     * 3. Exécuter la logique métier (DB, API, calculs)
     * 4. Répondre à l'utilisateur via `interaction.reply()` ou `interaction.editReply()`
     * 5. Gérer les erreurs avec try/catch
     * 6. Logger les actions importantes
     *
     * **Gestion du délai Discord (3 secondes)**:
     * - Si l'opération < 3s: `await interaction.reply()`
     * - Si l'opération > 3s: `await interaction.deferReply()` puis `interaction.editReply()`
     *
     * **Gestion des erreurs**:
     * ```typescript
     * try {
     *   // Logique métier
     *   await interaction.reply({ content: 'Succès!' });
     * } catch (error) {
     *   logger.error('Erreur dans la commande', 'mycommand', error);
     *   await interaction.reply({ content: 'Une erreur est survenue.', ephemeral: true });
     * }
     * ```
     *
     * @example
     * ```typescript
     * public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
     *     await interaction.deferReply({ ephemeral: true });
     *
     *     const services = ServiceContainer.getInstance();
     *     const userId = interaction.user.id;
     *
     *     try {
     *         const result = await services.database.selectOne('SELECT * FROM users WHERE id = ?', [userId]);
     *         await interaction.editReply({ content: `Résultat: ${result}` });
     *     } catch (error) {
     *         services.logger.error('Erreur dans execute()', 'mycommand', error);
     *         await interaction.editReply({ content: 'Erreur lors du traitement.' });
     *     }
     * }
     * ```
     */
    public abstract execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

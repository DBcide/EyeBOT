import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlagsBitField,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';

/**
 * Commande /verify réservée au propriétaire du bot pour vérifier les personnages Albion
 *
 * @remarks
 * Commande administrative de plus haut niveau réservée au OWNER_ID du bot.
 *
 * Fonctionnalités:
 * - Vérifie un personnage Albion pour un utilisateur Discord spécifique
 * - Supprime automatiquement toutes les autres revendications du même personnage
 * - Verrouille définitivement le personnage à cet utilisateur
 * - Envoie une notification en MP à l'utilisateur vérifié
 * - Affiche un rapport des revendications supprimées
 *
 * Processus de vérification:
 * 1. Vérification que l'exécuteur est le propriétaire du bot
 * 2. Récupération de tous les personnages de l'utilisateur cible
 * 3. Recherche du personnage par nom (case-insensitive)
 * 4. Vérification que le personnage n'est pas déjà vérifié
 * 5. Récupération de tous les claims du personnage (pour rapport)
 * 6. Suppression des autres revendications (DELETE WHERE albion_id = ? AND discord_id != ?)
 * 7. Marquage du personnage comme vérifié (UPDATE SET is_verified = 1)
 * 8. Notification en MP à l'utilisateur vérifié
 * 9. Embed récapitulatif pour l'admin
 *
 * Sécurité:
 * - Hardcoded OWNER_ID: Seul l'utilisateur avec cet ID peut exécuter la commande
 * - Double vérification (permission Discord + vérification code)
 * - Opération irréversible: Une fois vérifié, impossible de "dévérifier"
 *
 * Cas d'usage:
 * - Après qu'un joueur a envoyé le mail in-game de vérification à "DBcide"
 * - Pour résoudre manuellement un conflit de multi-claim
 * - Pour sécuriser le personnage d'un membre de confiance
 */
export default class VerifyCommand extends BaseCommand {
    public name = 'verify';
    public description = '[OWNER] Vérifier un personnage Albion pour un utilisateur Discord';

    private tracerService: TracerService;
    private logger: LoggerService;
    private readonly OWNER_ID = '506045516421791744';

    /**
     * Crée une instance de la commande /verify
     *
     * @remarks
     * Initialise les services nécessaires:
     * - LoggerService: Depuis ServiceContainer (partagé)
     * - TracerService: Instance locale pour les opérations DB
     *
     * Configuration de sécurité:
     * - OWNER_ID: Hardcodé à '506045516421791744' (ID Discord du propriétaire du bot)
     */
    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.tracerService = new TracerService();
    }

    /**
     * Construit la définition de la commande slash pour l'API Discord
     *
     * @returns SlashCommandBuilder configuré avec deux options requises
     *
     * @remarks
     * Options de commande:
     * - discord_id (String, requis): L'ID Discord de l'utilisateur à qui appartient le personnage
     * - personnage (String, requis): Le nom exact du personnage Albion à vérifier
     *
     * Pas de restriction de permission par défaut car la vérification est faite dans execute().
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption((option) =>
                option
                    .setName('discord_id')
                    .setDescription('L\'ID Discord de l\'utilisateur propriétaire du personnage')
                    .setRequired(true)
            )
            .addStringOption((option) =>
                option
                    .setName('personnage')
                    .setDescription('Le nom du personnage Albion à vérifier')
                    .setRequired(true)
            ) as SlashCommandBuilder;
    }

    /**
     * Exécute la commande /verify
     *
     * @param interaction - L'interaction Discord de la commande slash
     * @returns Promise qui se résout après vérification complète
     *
     * @remarks
     * Flux d'exécution complet:
     *
     * **1. Vérification de sécurité**
     * - Vérifie que interaction.user.id === OWNER_ID
     * - Si non: Message de refus éphémère + return
     *
     * **2. Récupération des personnages de l'utilisateur cible**
     * - getRegisteredUsers(targetUserId)
     * - Si aucun: Message d'erreur avec mention de l'utilisateur
     *
     * **3. Recherche du personnage par nom**
     * - Recherche case-insensitive (toLowerCase)
     * - Si non trouvé: Liste tous les personnages disponibles
     *
     * **4. Vérification de l'état actuel**
     * - Si character.is_verified === 1: Message d'avertissement (déjà vérifié)
     *
     * **5. Détection des multi-claims**
     * - getAllClaimsForCharacter() pour identifier les autres revendicateurs
     * - Filtre pour exclure l'utilisateur cible
     *
     * **6. Vérification en base de données**
     * - verifyCharacter() effectue:
     *   - DELETE autres revendications (discord_id != targetUserId)
     *   - UPDATE is_verified = 1 pour l'utilisateur cible
     *
     * **7. Embed récapitulatif pour l'admin**
     * - Couleur verte (#2ECC71)
     * - Infos du personnage vérifié
     * - Champ optionnel: Liste des revendications supprimées (si duplicateClaims.length > 0)
     * - Footer: "Vérifié par [admin tag]"
     *
     * **8. Notification en MP à l'utilisateur vérifié**
     * - Embed vert avec icône de cadenas 🔒
     * - Informe que le personnage est maintenant sécurisé
     * - Si échec d'envoi (DMs fermés): Log warning silencieux
     *
     * **9. Logging**
     * - Log success avec admin, utilisateur cible et nom du personnage
     *
     * Gestion des erreurs:
     * - Erreur DB: Message générique d'erreur + log error
     * - DM impossible: Log warning (n'interrompt pas le processus)
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.user.id !== this.OWNER_ID) {
            await interaction.reply({
                content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        const targetUserId = interaction.options.getString('discord_id', true);
        const characterName = interaction.options.getString('personnage', true);

        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            const userCharacters = await this.tracerService.getRegisteredUsers(targetUserId);

            if (userCharacters.length === 0) {
                await interaction.editReply({
                    content: `❌ L'utilisateur <@${targetUserId}> n'a aucun personnage enregistré.`,
                });
                return;
            }

            const character = userCharacters.find(
                (char) => char.albion_name.toLowerCase() === characterName.toLowerCase()
            );

            if (!character) {
                const availableCharacters = userCharacters
                    .map((char) => `• ${char.albion_name}`)
                    .join('\n');

                await interaction.editReply({
                    content:
                        `❌ Le personnage "${characterName}" n'est pas lié à <@${targetUserId}>.\n\n` +
                        `**Personnages disponibles :**\n${availableCharacters}`,
                });
                return;
            }

            if (character.is_verified === 1) {
                await interaction.editReply({
                    content: `⚠️ Le personnage **${character.albion_name}** est déjà vérifié pour <@${targetUserId}>.`,
                });
                return;
            }

            const allClaims = await this.tracerService.getAllClaimsForCharacter(character.albion_id);
            const duplicateClaims = allClaims.filter((claim) => claim.discord_id !== targetUserId);

            await this.tracerService.verifyCharacter(targetUserId, character.albion_id);

            const adminEmbed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('✅ Personnage vérifié avec succès')
                .setDescription(
                    `Le personnage a été vérifié et sécurisé.\n\n` +
                    `**Utilisateur Discord :** <@${targetUserId}>\n` +
                    `**Personnage Albion :** ${character.albion_name}\n` +
                    `**Albion ID :** \`${character.albion_id}\`\n` +
                    `**Guilde :** ${character.guild_name || 'Aucune'}\n` +
                    `**Alliance :** ${character.alliance_name || 'Aucune'}`
                )
                .setTimestamp()
                .setFooter({
                    text: `Vérifié par ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            if (duplicateClaims.length > 0) {
                const removedUsers = duplicateClaims
                    .map((claim) => `• <@${claim.discord_id}> (enregistré le ${new Date(claim.registered_at).toLocaleDateString('fr-FR')})`)
                    .join('\n');

                adminEmbed.addFields({
                    name: `🗑️ Revendications supprimées (${duplicateClaims.length})`,
                    value: removedUsers,
                    inline: false,
                });
            }

            await interaction.editReply({ embeds: [adminEmbed] });

            try {
                const targetUser = await interaction.client.users.fetch(targetUserId);

                const notificationEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('🔒 Personnage vérifié !')
                    .setDescription(
                        `Votre personnage **${character.albion_name}** a été vérifié et sécurisé.\n\n` +
                        `Ce personnage est maintenant définitivement lié à votre compte Discord et ne peut plus être revendiqué par d'autres joueurs.`
                    )
                    .addFields(
                        {
                            name: '📋 Informations',
                            value:
                                `**Personnage :** ${character.albion_name}\n` +
                                `**Guilde :** ${character.guild_name || 'Aucune'}\n` +
                                `**Alliance :** ${character.alliance_name || 'Aucune'}`,
                            inline: false
                        }
                    )
                    .setTimestamp();

                await targetUser.send({ embeds: [notificationEmbed] });

                this.logger.success(
                    `Notification de vérification envoyée en DM à l'utilisateur ${targetUserId}`
                );
            } catch (dmError) {
                this.logger.warn(
                    `Impossible d'envoyer un DM à l'utilisateur ${targetUserId} - Peut-être ses DMs sont fermés`
                );
            }

            this.logger.success(
                `Personnage ${character.albion_name} vérifié pour l'utilisateur ${targetUserId} par ${interaction.user.tag}`
            );
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage', 'tracer', error);

            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la vérification du personnage.',
            });
        }
    }
}

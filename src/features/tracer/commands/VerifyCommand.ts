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

export default class VerifyCommand extends BaseCommand {
    public name = 'verify';
    public description = '[OWNER] Vérifier un personnage Albion pour un utilisateur Discord';

    private readonly tracerService: TracerService;
    private readonly logger: LoggerService;
    private readonly OWNER_ID = '506045516421791744';

    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.tracerService = new TracerService();
    }

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

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // Vérifier que seul le propriétaire du bot peut utiliser cette commande
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
            // Récupérer tous les personnages de l'utilisateur
            const userCharacters = await this.tracerService.getRegisteredUsers(targetUserId);

            if (userCharacters.length === 0) {
                await interaction.editReply({
                    content: `❌ L'utilisateur <@${targetUserId}> n'a aucun personnage enregistré.`,
                });
                return;
            }

            // Chercher le personnage spécifié
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

            // Vérifier si le personnage est déjà vérifié
            if (character.is_verified === 1) {
                await interaction.editReply({
                    content: `⚠️ Le personnage **${character.albion_name}** est déjà vérifié pour <@${targetUserId}>.`,
                });
                return;
            }

            // Vérifier s'il y a des revendications multiples
            const allClaims = await this.tracerService.getAllClaimsForCharacter(character.albion_id);
            const duplicateClaims = allClaims.filter((claim) => claim.discord_id !== targetUserId);

            // Vérifier le personnage
            await this.tracerService.verifyCharacter(targetUserId, character.albion_id);

            // Créer l'embed de confirmation pour l'admin (éphémère)
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

            // Ajouter un champ si des doublons ont été supprimés
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

            // Envoyer une notification en message privé à l'utilisateur vérifié
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
                const errorMessage = dmError instanceof Error ? dmError.message : String(dmError);
                this.logger.warn(
                    `Impossible d'envoyer un DM à l'utilisateur ${targetUserId} - Peut-être ses DMs sont fermés : ${errorMessage}`
                );
            }

            this.logger.success(
                `Personnage ${character.albion_name} vérifié pour l'utilisateur ${targetUserId} par ${interaction.user.tag}`
            );
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage', error);

            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la vérification du personnage.',
            });
        }
    }
}

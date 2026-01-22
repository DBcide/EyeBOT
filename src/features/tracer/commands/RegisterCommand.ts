import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ComponentType,
    MessageFlagsBitField,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { AlbionService } from '../services/AlbionService';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { AlbionPlayer, TracerUser } from '../models/AlbionTypes';
import { updateMemberNickname } from '../utils/DiscordUtils';
import { getAlbionApiErrorMessage } from '../utils/ErrorHandlers';
import {
    buildCharactersSummaryEmbed,
    buildVerificationInstructionsEmbed,
    buildVerificationWarningEmbed,
    buildCharacterAlreadyVerifiedEmbed,
    buildRegistrationSuccessEmbed,
    buildRegistrationWithWarningEmbed
} from '../utils/EmbedBuilders';

export default class RegisterCommand extends BaseCommand {
    public name = 'register';
    public description = 'Enregistrer votre compte Albion Online';

    private readonly albionService: AlbionService;
    private tracerService: TracerService;
    private readonly logger: LoggerService;

    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.albionService = new AlbionService();
        this.tracerService = new TracerService();
    }

    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption((option) =>
                option
                    .setName('pseudo')
                    .setDescription('Votre pseudo en jeu sur Albion Online')
                    .setRequired(true)
            ) as SlashCommandBuilder;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const pseudo = interaction.options.getString('pseudo', true);

        // Rechercher le joueur sur Albion
        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            this.logger.debug(`Recherche du joueur: ${pseudo}`);

            const players = await this.albionService.searchPlayer(pseudo);

            if (players.length === 0) {
                await interaction.editReply({
                    content: `❌ Aucun joueur trouvé avec le pseudo "${pseudo}" sur Albion Online.`,
                });
                return;
            }

            // Si un seul résultat
            if (players.length === 1) {
                await this.handlePlayerRegistration(interaction, players[0]);
                return;
            }

            // Si plusieurs résultats, afficher un menu de sélection
            await this.showPlayerSelection(interaction, players);
        } catch (error: any) {
            this.logger.error('Erreur lors de l\'enregistrement', error);

            await interaction.editReply({
                content: getAlbionApiErrorMessage(error),
            });
        }
    }

    /**
     * Gère l'enregistrement d'un joueur après vérifications
     */
    private async handlePlayerRegistration(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer
    ): Promise<void> {
        // Vérifier si ce personnage est vérifié par quelqu'un d'autre
        const verifiedOwner = await this.tracerService.isCharacterVerifiedByOther(player.Id, interaction.user.id);

        if (verifiedOwner) {
            // Personnage vérifié par quelqu'un d'autre : refus strict
            const embed = buildCharacterAlreadyVerifiedEmbed(
                verifiedOwner,
                player.Name,
                this.albionService.formatFame(player.KillFame),
                player.GuildName || undefined
            );

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Vérifier si l'utilisateur a déjà enregistré ce personnage
        const existingRegistration = await this.tracerService.getUserRegistrationForCharacter(
            interaction.user.id,
            player.Id
        );

        if (existingRegistration) {
            // L'utilisateur a déjà ce personnage
            await this.handleAlreadyRegistered(interaction, player);
            return;
        }

        // Compter les revendications non vérifiées existantes
        const unverifiedClaimsCount = await this.tracerService.countUnverifiedClaims(player.Id);

        if (unverifiedClaimsCount > 0) {
            // Il y a d'autres revendications non vérifiées : avertissement mais autorisation
            const allClaims = await this.tracerService.getAllClaimsForCharacter(player.Id);
            await this.registerPlayerWithWarning(interaction, player, allClaims);
            return;
        }

        // Personnage non réclamé, on peut l'enregistrer normalement
        await this.registerPlayer(interaction, player);
    }

    /**
     * Gère le cas où l'utilisateur essaie d'enregistrer un personnage qu'il possède déjà
     */
    private async handleAlreadyRegistered(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer
    ): Promise<void> {
        // Vérifier si le personnage est vérifié
        const isVerified = await this.tracerService.isAlbionCharacterVerified(player.Id);

        const embed = new EmbedBuilder()
            .setColor(isVerified ? '#2ECC71' : '#FF6B6B')
            .setTitle(isVerified ? '✅ Personnage déjà enregistré et vérifié' : '⚠️ Personnage déjà enregistré')
            .setDescription(
                `Ce personnage est déjà lié à votre compte Discord.\n\n` +
                `**Albion :** ${player.Name}\n` +
                `**Kill Fame :** ${this.albionService.formatFame(player.KillFame)}\n` +
                `**Guilde :** ${player.GuildName || 'Aucune'}\n` +
                `**Alliance :** ${player.AllianceName || 'Aucune'}\n` +
                `**Statut :** ${isVerified ? '🔒 Vérifié' : '⚠️ Non vérifié'}`
            )
            .setTimestamp();

        // Ajouter un champ d'information sur la vérification si le personnage n'est pas vérifié
        if (!isVerified) {
            embed.addFields({
                name: '💡 Conseil',
                value:
                    `Pour **sécuriser** ce personnage, vérifiez-le en envoyant un mail in-game à **DBcide** ` +
                    `avec votre Discord ID (\`${interaction.user.id}\`). Cela empêchera d'autres joueurs de le revendiquer.`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }

    /**
     * Affiche un menu de sélection si plusieurs joueurs sont trouvés
     */
    private async showPlayerSelection(
        interaction: ChatInputCommandInteraction,
        players: AlbionPlayer[]
    ): Promise<void> {
        const options = players.map((player, index) => ({
            label: `${index + 1}. ${player.Name}`,
            description: `Kill Fame: ${this.albionService.formatFame(player.KillFame)} | ${
                player.GuildName || 'Aucune guilde'
            }`,
            value: player.Id,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select-player')
            .setPlaceholder('Sélectionnez votre personnage')
            .addOptions(options.slice(0, 25));

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor('#4A90E2')
            .setTitle('🔍 Plusieurs joueurs trouvés')
            .setDescription(
                `Plusieurs joueurs correspondent à votre recherche. Sélectionnez le bon :\n\n` +
                players
                    .slice(0, 25)
                    .map(
                        (p, i) =>
                            `**${i + 1}.** ${p.Name} - Kill Fame: ${this.albionService.formatFame(
                                p.KillFame
                            )}`
                    )
                    .join('\n')
            );

        const response = await interaction.editReply({
            embeds: [embed],
            components: [row],
        });

        try {
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60_000,
            });

            collector.on('collect', async (selectInteraction) => {
                if (selectInteraction.user.id !== interaction.user.id) {
                    await selectInteraction.reply({
                        content: '❌ Ce menu ne vous est pas destiné.',
                        ephemeral: true,
                    });
                    return;
                }

                const selectedPlayerId = selectInteraction.values[0];
                const selectedPlayer = players.find((p) => p.Id === selectedPlayerId);

                if (!selectedPlayer) {
                    await selectInteraction.update({
                        content: '❌ Erreur : joueur introuvable.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }

                await selectInteraction.deferUpdate();
                await this.handlePlayerRegistration(interaction, selectedPlayer);
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await interaction.editReply({
                        content: '⏱️ Temps écoulé. Veuillez réessayer la commande.',
                        embeds: [],
                        components: [],
                    });
                }
            });
        } catch (error) {
            this.logger.error('Erreur lors de la sélection du joueur', error);
        }
    }

    /**
     * Enregistre le joueur sélectionné
     */
    private async registerPlayer(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer
    ): Promise<void> {
        try {
            await this.tracerService.registerUser(interaction.user.id, player);

            // Renommer le membre sur le serveur
            await updateMemberNickname(
                interaction.guild,
                interaction.user.id,
                player.Name,
                player.GuildName,
                this.logger
            );

            // Récupérer TOUS les personnages de l'utilisateur pour l'embed récapitulatif
            const allCharacters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            // Embed principal : nouveau personnage
            const mainEmbed = buildRegistrationSuccessEmbed(
                interaction.user.id,
                player.Name,
                this.albionService.formatFame(player.KillFame),
                player.GuildName,
                player.AllianceName
            );

            // Embed d'information sur la vérification
            const verificationEmbed = buildVerificationInstructionsEmbed(player.Name, interaction.user.id);

            // Embed récapitulatif : tous les personnages
            const summaryEmbed = buildCharactersSummaryEmbed(allCharacters, this.albionService);

            // Message éphémère de confirmation
            await interaction.editReply({
                content: '✅ Enregistrement réussi ! Un message public a été envoyé et les instructions de vérification vous ont été envoyées en MP.',
                embeds: [],
                components: [],
            });

            // Envoyer l'embed de vérification en MP
            try {
                await interaction.user.send({
                    embeds: [verificationEmbed]
                });
            } catch (error) {
                this.logger.warn(`Impossible d'envoyer le MP de vérification à ${interaction.user.tag}: ${error}`);
            }

            // Message public avec 2 embeds (sans verificationEmbed)
            if (interaction.channel?.isSendable()) {
                await interaction.channel.send({
                    embeds: [mainEmbed, summaryEmbed]
                });
            }
        } catch (error: any) {
            this.logger.error('Erreur lors de l\'enregistrement final', error);

            // Gérer l'erreur de personnage vérifié par quelqu'un d'autre
            if (error.message?.startsWith('CHARACTER_VERIFIED_BY_OTHER:')) {
                const verifiedOwner = error.message.split(':')[1];
                const embed = buildCharacterAlreadyVerifiedEmbed(verifiedOwner);

                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }

            await interaction.editReply({
                content: '❌ Erreur lors de l\'enregistrement.',
                embeds: [],
                components: [],
            });
        }
    }

    /**
     * Enregistre le joueur avec un avertissement sur les doublons non vérifiés
     */
    private async registerPlayerWithWarning(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer,
        existingClaims: TracerUser[]
    ): Promise<void> {
        try {
            await this.tracerService.registerUser(interaction.user.id, player);

            // Renommer le membre sur le serveur
            await updateMemberNickname(
                interaction.guild,
                interaction.user.id,
                player.Name,
                player.GuildName,
                this.logger
            );

            // Récupérer TOUS les personnages de l'utilisateur pour l'embed récapitulatif
            const allCharacters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            // Construire la liste des autres revendicateurs
            const otherClaimants = existingClaims
                .map(claim => `<@${claim.discord_id}>`)
                .join(', ');

            // Embed principal : nouveau personnage avec avertissement
            const mainEmbed = buildRegistrationWithWarningEmbed(
                interaction.user.id,
                player.Name,
                this.albionService.formatFame(player.KillFame),
                player.GuildName,
                player.AllianceName,
                otherClaimants,
                existingClaims.length
            );

            // Embed d'information sur la vérification
            const verificationEmbed = buildVerificationWarningEmbed(interaction.user.id);

            // Embed récapitulatif : tous les personnages
            const summaryEmbed = buildCharactersSummaryEmbed(allCharacters, this.albionService);

            // Message éphémère de confirmation
            await interaction.editReply({
                content: '⚠️ Personnage enregistré avec avertissement. Vérifiez-le pour le sécuriser ! Les instructions vous ont été envoyées en MP.',
                embeds: [],
                components: [],
            });

            // Envoyer l'embed de vérification en MP
            try {
                await interaction.user.send({
                    embeds: [verificationEmbed]
                });
            } catch (error) {
                this.logger.warn(`Impossible d'envoyer le MP de vérification à ${interaction.user.tag}: ${error}`);
            }

            // Message public avec 2 embeds (sans verificationEmbed)
            if (interaction.channel?.isSendable()) {
                await interaction.channel.send({
                    embeds: [mainEmbed, summaryEmbed]
                });
            }
        } catch (error: any) {
            this.logger.error('Erreur lors de l\'enregistrement avec avertissement', error);

            // Gérer l'erreur de personnage vérifié par quelqu'un d'autre
            if (error.message?.startsWith('CHARACTER_VERIFIED_BY_OTHER:')) {
                const verifiedOwner = error.message.split(':')[1];
                const embed = buildCharacterAlreadyVerifiedEmbed(verifiedOwner);

                await interaction.editReply({ embeds: [embed], components: [] });
                return;
            }

            await interaction.editReply({
                content: '❌ Erreur lors de l\'enregistrement.',
                embeds: [],
                components: [],
            });
        }
    }
}
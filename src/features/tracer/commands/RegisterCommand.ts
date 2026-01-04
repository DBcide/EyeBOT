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
import { AlbionPlayer } from '../models/AlbionTypes';

export default class RegisterCommand extends BaseCommand {
    public name = 'register';
    public description = 'Enregistrer votre compte Albion Online';

    private albionService: AlbionService;
    private tracerService: TracerService;
    private logger: LoggerService;

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

            let errorMessage = '❌ Une erreur est survenue lors de la recherche. Réessayez plus tard.';

            if (error.message && error.message.includes('timeout')) {
                errorMessage = '❌ L\'API Albion met trop de temps à répondre. Réessayez dans quelques instants.';
            } else if (error.message && error.message.includes('Rate limit')) {
                errorMessage = '❌ Trop de requêtes à l\'API Albion. Veuillez patienter quelques instants avant de réessayer.';
            } else if (error.message && error.message.includes('fetch')) {
                errorMessage = '❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.';
            }

            await interaction.editReply({
                content: errorMessage,
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
        // Vérifier si ce personnage Albion est déjà revendiqué par quelqu'un
        const claimedBy = await this.tracerService.isAlbionCharacterClaimed(player.Id);

        if (claimedBy && claimedBy !== interaction.user.id) {
            // Le personnage est déjà lié à un autre compte Discord
            // Vérifier si le compte est vérifié
            const isVerified = await this.tracerService.isAlbionCharacterVerified(player.Id);

            if (isVerified) {
                // Compte vérifié : refus strict
                const embed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle('❌ Personnage déjà vérifié')
                    .setDescription(
                        `Ce personnage est déjà lié et **vérifié** par un autre compte Discord (<@${claimedBy}>).\n\n` +
                        `⚠️ Un personnage vérifié ne peut pas être lié à un autre compte Discord.`
                    )
                    .addFields(
                        {
                            name: '📋 Informations du personnage',
                            value:
                                `**Albion :** ${player.Name}\n` +
                                `**Kill Fame :** ${this.albionService.formatFame(player.KillFame)}\n` +
                                `**Guilde :** ${player.GuildName || 'Aucune'}`,
                            inline: false
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            } else {
                // Compte non vérifié : avertissement mais autorisation
                await this.registerPlayerWithWarning(interaction, player, claimedBy);
                return;
            }
        }

        if (claimedBy === interaction.user.id) {
            // Le personnage est déjà lié à l'utilisateur actuel
            await this.handleAlreadyRegistered(interaction, player);
            return;
        }

        // Personnage non réclamé, on peut l'enregistrer
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
            if (interaction.guild && interaction.member) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);

                    const tag = buildGuildTag(player.GuildName);
                    const nickname = `${tag} ${player.Name}`;

                    await member.setNickname(nickname);
                } catch (err) {
                    this.logger.warn(
                        `Impossible de renommer le membre ${interaction.user.tag}`
                    );
                    if (err instanceof Error) {
                        this.logger.debug(`Détails de l'erreur: ${err.message}`);
                    }
                }
            }

            // Récupérer TOUS les personnages de l'utilisateur pour l'embed récapitulatif
            const allCharacters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            // Embed principal : nouveau personnage
            const mainEmbed = new EmbedBuilder()
                .setColor('#51CF66')
                .setTitle('✅ Nouveau personnage enregistré')
                .setDescription(
                    `**Discord :** <@${interaction.user.id}>\n` +
                    `**Albion :** ${player.Name}\n` +
                    `**Kill Fame :** ${this.albionService.formatFame(player.KillFame)}\n` +
                    `**Guilde :** ${player.GuildName || 'Aucune'}\n` +
                    `**Alliance :** ${player.AllianceName || 'Aucune'}`
                )
                .setTimestamp();

            // Embed d'information sur la vérification
            const verificationEmbed = new EmbedBuilder()
                .setColor('#F39C12')
                .setTitle('🔒 Sécurisez votre personnage !')
                .setDescription(
                    `Pour **protéger** votre personnage et empêcher d'autres joueurs de le revendiquer :\n\n` +
                    `**1.** Connectez-vous sur **Albion Online** avec le personnage **${player.Name}**\n` +
                    `**2.** Envoyez un **courrier in-game** à **DBcide**\n` +
                    `**3.** Dans le courrier, indiquez votre Discord ID : \`${interaction.user.id}\`\n` +
                    `**4.** Attendez la validation par un administrateur\n\n` +
                    `⚠️ **Important :** C'est bien le personnage Albion qui doit envoyer le courrier !`
                )
                .setFooter({ text: 'Une fois vérifié, ce personnage sera définitivement lié à votre compte Discord' });

            // Embed récapitulatif : tous les personnages
            const summaryEmbed = new EmbedBuilder()
                .setColor('#4A90E2')
                .setTitle('📋 Personnages liés à ce compte')
                .setDescription(
                    allCharacters.length > 0
                        ? allCharacters
                            .map(
                                (char, index) =>
                                    `**${index + 1}.** ${char.albion_name} - ${this.albionService.formatFame(
                                        char.kill_fame
                                    )} Kill Fame ${char.is_verified ? '🔒' : ''}`
                            )
                            .join('\n')
                        : 'Aucun personnage enregistré.'
                )
                .setFooter({ text: `Total : ${allCharacters.length} personnage(s) | 🔒 = Vérifié` });

            // Message éphémère de confirmation
            await interaction.editReply({
                content: '✅ Enregistrement réussi ! Un message public a été envoyé.',
                embeds: [],
                components: [],
            });

            // Message public avec les 3 embeds
            if (interaction.channel?.isSendable()) {
                await interaction.channel.send({
                    embeds: [mainEmbed, verificationEmbed, summaryEmbed]
                });
            }
        } catch (error) {
            this.logger.error('Erreur lors de l\'enregistrement final', error);

            await interaction.editReply({
                content: '❌ Erreur lors de l\'enregistrement.',
                embeds: [],
                components: [],
            });
        }
    }

    /**
     * Enregistre le joueur avec un avertissement sur le système de vérification
     */
    private async registerPlayerWithWarning(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer,
        previousOwner: string
    ): Promise<void> {
        try {
            await this.tracerService.registerUser(interaction.user.id, player);

            // Renommer le membre sur le serveur
            if (interaction.guild && interaction.member) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);

                    const tag = buildGuildTag(player.GuildName);
                    const nickname = `${tag} ${player.Name}`;

                    await member.setNickname(nickname);
                } catch (err) {
                    this.logger.warn(
                        `Impossible de renommer le membre ${interaction.user.tag}`
                    );
                    if (err instanceof Error) {
                        this.logger.debug(`Détails de l'erreur: ${err.message}`);
                    }
                }
            }

            // Récupérer TOUS les personnages de l'utilisateur pour l'embed récapitulatif
            const allCharacters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            // Embed principal : nouveau personnage avec avertissement
            const mainEmbed = new EmbedBuilder()
                .setColor('#F39C12')
                .setTitle('⚠️ Personnage enregistré (non vérifié)')
                .setDescription(
                    `**Discord :** <@${interaction.user.id}>\n` +
                    `**Albion :** ${player.Name}\n` +
                    `**Kill Fame :** ${this.albionService.formatFame(player.KillFame)}\n` +
                    `**Guilde :** ${player.GuildName || 'Aucune'}\n` +
                    `**Alliance :** ${player.AllianceName || 'Aucune'}\n\n` +
                    `⚠️ **Attention :** Ce personnage était précédemment lié à <@${previousOwner}>.\n` +
                    `Le compte n'étant pas vérifié, vous pouvez le revendiquer.`
                )
                .setTimestamp();

            // Embed d'information sur la vérification
            const verificationEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('🔒 Comment vérifier votre personnage ?')
                .setDescription(
                    `Pour **sécuriser** votre personnage et empêcher d'autres joueurs de le revendiquer :\n\n` +
                    `**1.** Connectez-vous sur Albion Online avec ce personnage\n` +
                    `**2.** Envoyez un mail in-game à **DBcide** avec votre Discord ID (\`${interaction.user.id}\`)\n` +
                    `**3.** Attendez la validation par un administrateur\n\n` +
                    `Une fois vérifié, ce personnage sera définitivement lié à votre compte Discord.`
                )
                .setFooter({ text: 'La vérification protège votre personnage contre les revendications frauduleuses' });

            // Embed récapitulatif : tous les personnages
            const summaryEmbed = new EmbedBuilder()
                .setColor('#4A90E2')
                .setTitle('📋 Personnages liés à ce compte')
                .setDescription(
                    allCharacters.length > 0
                        ? allCharacters
                            .map(
                                (char, index) =>
                                    `**${index + 1}.** ${char.albion_name} - ${this.albionService.formatFame(
                                        char.kill_fame
                                    )} Kill Fame ${char.is_verified ? '🔒' : ''}`
                            )
                            .join('\n')
                        : 'Aucun personnage enregistré.'
                )
                .setFooter({ text: `Total : ${allCharacters.length} personnage(s) | 🔒 = Vérifié` });

            // Message éphémère de confirmation
            await interaction.editReply({
                content: '⚠️ Personnage enregistré avec avertissement. Vérifiez-le pour le sécuriser !',
                embeds: [],
                components: [],
            });

            // Message public avec les 3 embeds
            if (interaction.channel?.isSendable()) {
                await interaction.channel.send({
                    embeds: [mainEmbed, verificationEmbed, summaryEmbed]
                });
            }
        } catch (error) {
            this.logger.error('Erreur lors de l\'enregistrement avec avertissement', error);

            await interaction.editReply({
                content: '❌ Erreur lors de l\'enregistrement.',
                embeds: [],
                components: [],
            });
        }
    }
}

function buildGuildTag(guildName?: string | null): string {
    if (!guildName || guildName.trim().length === 0) {
        return '[]';
    }

    const noSpaces = guildName.replace(/\s+/g, '');
    const uppercaseLetters = noSpaces.match(/[A-Z]/g) ?? [];

    let tag: string;

    if (uppercaseLetters.length > 1) {
        tag = uppercaseLetters.slice(0, 5).join('');
    } else {
        tag = noSpaces.slice(0, 5);
    }

    return `[${tag}]`;
}

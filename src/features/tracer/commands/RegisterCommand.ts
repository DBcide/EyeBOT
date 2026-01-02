import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ComponentType,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { AlbionService } from '../services/AlbionService';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { AlbionPlayer } from '../models/AlbionTypes';

// Ajouter par chat gpt :
import { TextChannel } from 'discord.js';

export default class RegisterCommand extends BaseCommand {
    public name = 'register';
    public description = 'Enregistrer votre compte Albion Online';

    private albionService: AlbionService;
    private tracerService: TracerService;
    private logger: LoggerService;

    constructor() {
        super();
        this.albionService = new AlbionService();
        this.tracerService = new TracerService();
        this.logger = new LoggerService();
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

        // Vérifier si l'utilisateur est déjà enregistré
        const isRegistered = await this.tracerService.isUserRegistered(interaction.user.id);

        if (isRegistered) {
            await this.handleAlreadyRegistered(interaction);
            return;
        }

        // Rechercher le joueur sur Albion
        await interaction.deferReply({ ephemeral: true });

        try {
            const players = await this.albionService.searchPlayer(pseudo);

            if (players.length === 0) {
                await interaction.editReply({
                    content: `❌ Aucun joueur trouvé avec le pseudo "${pseudo}" sur Albion Online.`,
                });
                return;
            }

            // Si un seul résultat et correspond exactement
            if (players.length === 1) {
                await this.registerPlayer(interaction, players[0]);
                return;
            }

            // Si plusieurs résultats, afficher un menu de sélection
            await this.showPlayerSelection(interaction, players);
        } catch (error) {
            this.logger.error('Erreur lors de l\'enregistrement', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la recherche. Réessayez plus tard.',
            });
        }
    }

    /**
     * Gère le cas où l'utilisateur est déjà enregistré
     */
    private async handleAlreadyRegistered(interaction: ChatInputCommandInteraction): Promise<void> {
        const user = await this.tracerService.getRegisteredUser(interaction.user.id);

        if (!user) {
            await interaction.reply({
                content: '❌ Erreur : utilisateur introuvable dans la base de données.',
                ephemeral: true,
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⚠️ Déjà enregistré')
            .setDescription(
                `Vous êtes déjà enregistré dans le système.\n\n` +
                `**Discord :** <@${user.discord_id}>\n` +
                `**Albion :** ${user.albion_name}\n` +
                `**Kill Fame :** ${this.albionService.formatFame(user.kill_fame)}\n` +
                `**Guilde :** ${user.guild_name || 'Aucune'}\n` +
                `**Alliance :** ${user.alliance_name || 'Aucune'}\n\n` +
                `*Enregistré le : ${new Date(user.registered_at).toLocaleDateString('fr-FR')}*`
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
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
            .addOptions(options.slice(0, 25)); // Discord limite à 25 options

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
                time: 60_000, // 1 minute
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
                await this.registerPlayer(interaction, selectedPlayer, true);
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
        player: AlbionPlayer,
        fromSelection: boolean = false
    ): Promise<void> {
        try {
            await this.tracerService.registerUser(interaction.user.id, player);

            // Renommer le membre sur le serveur
            if (interaction.guild && interaction.member) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    await member.setNickname(`[] ${player.Name}`);
                } catch (err) {
                    this.logger.warn(
                        `Impossible de renommer le membre ${interaction.user.tag}`
                    );
                    if (err instanceof Error) {
                        this.logger.debug(`Détails de l'erreur: ${err.message}`);
                    }
                }
            }

            // Embed public
            const publicEmbed = new EmbedBuilder()
                .setColor('#51CF66')
                .setTitle('✅ Nouvel enregistrement')
                .setDescription(
                    `**Discord :** <@${interaction.user.id}>\n` +
                    `**Albion :** ${player.Name}\n` +
                    `**Kill Fame :** ${this.albionService.formatFame(player.KillFame)}\n` +
                    `**Guilde :** ${player.GuildName || 'Aucune'}\n` +
                    `**Alliance :** ${player.AllianceName || 'Aucune'}`
                )
                .setTimestamp();

            if (fromSelection) {
                // Si on vient de la sélection, on update le message éphémère
                await interaction.editReply({
                    content: '✅ Enregistrement réussi ! Un message public a été envoyé.',
                    embeds: [],
                    components: [],
                });

                // ✅ CHANGEMENT : Envoyer le message public dans le canal
                if (interaction.channel?.isSendable()) {
                    await interaction.channel.send({ embeds: [publicEmbed] });
                }
            } else {
                // Si pas de sélection (1 seul résultat), on met à jour l'éphémère
                await interaction.editReply({
                    content: '✅ Enregistrement réussi ! Un message public a été envoyé.',
                    embeds: [],
                });

                // ✅ CHANGEMENT : Envoyer le message public dans le canal
                if (interaction.channel?.isSendable()) {
                    await interaction.channel.send({ embeds: [publicEmbed] });
                }
            }
        } catch (error) {
            this.logger.error('Erreur lors de l\'enregistrement final', error);

            const errorMessage = fromSelection
                ? { content: '❌ Erreur lors de l\'enregistrement.', embeds: [], components: [] }
                : { content: '❌ Erreur lors de l\'enregistrement.' };

            await interaction.editReply(errorMessage);
        }
    }
}

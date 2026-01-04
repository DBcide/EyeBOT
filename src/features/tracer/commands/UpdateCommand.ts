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
import { TracerUser } from '../models/AlbionTypes';

export default class UpdateCommand extends BaseCommand {
    public name = 'update';
    public description = 'Mettre à jour les informations de votre compte Albion Online';

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
            .setDescription(this.description) as SlashCommandBuilder;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            // Récupérer tous les personnages de l'utilisateur
            const characters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            // Cas 1 : Aucun personnage enregistré
            if (characters.length === 0) {
                await interaction.editReply({
                    content:
                        '❌ Vous n\'avez aucun compte Albion enregistré.\n' +
                        'Utilisez `/register` pour enregistrer votre premier personnage.',
                });
                return;
            }

            // Cas 2 : Un seul personnage enregistré
            if (characters.length === 1) {
                await this.updateCharacter(interaction, characters[0]);
                return;
            }

            // Cas 3 : Plusieurs personnages enregistrés
            await this.showCharacterSelection(interaction, characters);
        } catch (error) {
            this.logger.error('Erreur lors de la mise à jour', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la mise à jour. Réessayez plus tard.',
            });
        }
    }

    /**
     * Affiche un menu de sélection si plusieurs personnages sont enregistrés
     */
    private async showCharacterSelection(
        interaction: ChatInputCommandInteraction,
        characters: TracerUser[]
    ): Promise<void> {
        const options = characters.map((character, index) => ({
            label: `${index + 1}. ${character.albion_name}`,
            description: `Kill Fame: ${this.albionService.formatFame(character.kill_fame)} | ${
                character.guild_name || 'Aucune guilde'
            }`,
            value: character.albion_id,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select-character-update')
            .setPlaceholder('Sélectionnez le personnage à mettre à jour')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor('#4A90E2')
            .setTitle('🔄 Sélectionnez un personnage à mettre à jour')
            .setDescription(
                `Vous avez plusieurs personnages enregistrés. Sélectionnez celui à mettre à jour :\n\n` +
                characters
                    .map(
                        (char, i) =>
                            `**${i + 1}.** ${char.albion_name} - ${this.albionService.formatFame(
                                char.kill_fame
                            )} Kill Fame`
                    )
                    .join('\n') +
                `\n\n⚠️ **Attention :** Vous serez renommé sur ce serveur avec le personnage sélectionné.`
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

                const selectedCharacterId = selectInteraction.values[0];
                const selectedCharacter = characters.find((char) => char.albion_id === selectedCharacterId);

                if (!selectedCharacter) {
                    await selectInteraction.update({
                        content: '❌ Erreur : personnage introuvable.',
                        embeds: [],
                        components: [],
                    });
                    return;
                }

                await selectInteraction.deferUpdate();
                await this.updateCharacter(interaction, selectedCharacter);
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
            this.logger.error('Erreur lors de la sélection du personnage', error);
        }
    }

    /**
     * Met à jour un personnage depuis l'API Albion
     */
    private async updateCharacter(
        interaction: ChatInputCommandInteraction,
        character: TracerUser
    ): Promise<void> {
        try {
            // Récupérer les données à jour depuis l'API Albion
            this.logger.debug(`Mise à jour du personnage ${character.albion_name} (ID: ${character.albion_id})`);

            const playerDetails = await this.albionService.getPlayerDetailsById(character.albion_id);

            if (!playerDetails) {
                await interaction.editReply({
                    content: `❌ Impossible de récupérer les informations du personnage "${character.albion_name}" depuis l'API Albion.`,
                    embeds: [],
                    components: [],
                });
                return;
            }

            // Mettre à jour en base de données
            await this.tracerService.updateUserFromApi(character.albion_id, playerDetails);

            // Renommer le membre sur le serveur
            if (interaction.guild && interaction.member) {
                try {
                    const member = await interaction.guild.members.fetch(interaction.user.id);

                    const tag = buildGuildTag(playerDetails.GuildName);
                    const nickname = `${tag} ${playerDetails.Name}`;

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

            // Créer l'embed de confirmation
            const embed = new EmbedBuilder()
                .setColor('#51CF66')
                .setTitle('✅ Personnage mis à jour')
                .setDescription(
                    `Vos informations ont été mises à jour avec succès !\n\n` +
                    `**Albion :** ${playerDetails.Name}\n` +
                    `**Kill Fame :** ${this.albionService.formatFame(playerDetails.KillFame)}\n` +
                    `**Death Fame :** ${this.albionService.formatFame(playerDetails.DeathFame)}\n` +
                    `**Guilde :** ${playerDetails.GuildName || 'Aucune'}\n` +
                    `**Alliance :** ${playerDetails.AllianceName || 'Aucune'}`
                )
                .setTimestamp();

            await interaction.editReply({
                content: null,
                embeds: [embed],
                components: [],
            });

            this.logger.success(`Personnage ${playerDetails.Name} mis à jour pour ${interaction.user.tag}`);

        } catch (error: any) {
            this.logger.error('Erreur lors de la mise à jour du personnage', error);

            let errorMessage = '❌ Une erreur est survenue lors de la mise à jour.';

            // Messages d'erreur personnalisés selon le type d'erreur
            if (error.message && error.message.includes('timeout')) {
                errorMessage = '❌ L\'API Albion met trop de temps à répondre. Réessayez dans quelques instants.';
            } else if (error.message && error.message.includes('Rate limit')) {
                errorMessage = '❌ Trop de requêtes à l\'API Albion. Veuillez patienter quelques instants avant de réessayer.';
            } else if (error.message && error.message.includes('fetch')) {
                errorMessage = '❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.';
            }

            await interaction.editReply({
                content: errorMessage,
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

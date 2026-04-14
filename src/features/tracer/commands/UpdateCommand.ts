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
import { updateMemberNickname } from '../utils/DiscordUtils';
import { getAlbionApiErrorMessage } from '../utils/ErrorHandlers';

/**
 * Commande /update pour rafraîchir les informations d'un personnage Albion depuis l'API
 *
 * @remarks
 * Fonctionnalités:
 * - Rafraîchit les stats d'un personnage enregistré depuis l'API Albion
 * - Menu de sélection si l'utilisateur a plusieurs personnages
 * - Mise à jour en base de données (kill_fame, death_fame, guild, alliance)
 * - Mise à jour automatique du nickname Discord
 * - Affiche les nouvelles stats dans un embed de confirmation
 *
 * Cas d'usage:
 * - L'utilisateur a changé de guilde/alliance
 * - Les stats de fame ont évolué
 * - Le personnage a été renommé in-game
 *
 * Flux d'exécution:
 * 1. Récupère tous les personnages de l'utilisateur depuis la base de données
 * 2. Si 0 personnage → Message d'erreur + redirection vers /register
 * 3. Si 1 personnage → Mise à jour directe
 * 4. Si plusieurs → Menu de sélection (timeout 60s)
 * 5. Appel API Albion pour récupérer les données actuelles
 * 6. Mise à jour en base de données
 * 7. Mise à jour du nickname Discord
 * 8. Embed de confirmation avec nouvelles stats
 */
export default class UpdateCommand extends BaseCommand {
    public name = 'update';
    public description = 'Mettre à jour les informations de votre compte Albion Online';

    private albionService: AlbionService;
    private tracerService: TracerService;
    private readonly logger: LoggerService;

    /**
     * Crée une instance de la commande /update
     *
     * @remarks
     * Initialise les services nécessaires:
     * - LoggerService: Depuis ServiceContainer (partagé)
     * - AlbionService: Instance locale pour les appels API
     * - TracerService: Instance locale pour les opérations DB
     */
    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.albionService = new AlbionService();
        this.tracerService = new TracerService();
    }

    /**
     * Construit la définition de la commande slash pour l'API Discord
     *
     * @returns SlashCommandBuilder configuré sans options
     *
     * @remarks
     * Aucune option requise car la commande utilise automatiquement
     * les personnages déjà enregistrés par l'utilisateur.
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description) as SlashCommandBuilder;
    }

    /**
     * Exécute la commande /update
     *
     * @param interaction - L'interaction Discord de la commande slash
     * @returns Promise qui se résout après mise à jour complète
     *
     * @remarks
     * Logique de routage basée sur le nombre de personnages:
     *
     * **0 personnage**:
     * - Message d'erreur éphémère
     * - Suggestion d'utiliser /register
     *
     * **1 personnage**:
     * - Mise à jour directe sans menu de sélection
     * - Appelle updateCharacter() immédiatement
     *
     * **Plusieurs personnages**:
     * - Affiche un menu déroulant (showCharacterSelection)
     * - Timeout de 60 secondes
     * - L'utilisateur choisit quel personnage mettre à jour
     *
     * Toutes les réponses sont éphémères (visibles uniquement par l'utilisateur).
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            const characters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            if (characters.length === 0) {
                await interaction.editReply({
                    content:
                        '❌ Vous n\'avez aucun compte Albion enregistré.\n' +
                        'Utilisez `/register` pour enregistrer votre premier personnage.',
                });
                return;
            }

            if (characters.length === 1) {
                await this.updateCharacter(interaction, characters[0]);
                return;
            }

            await this.showCharacterSelection(interaction, characters);
        } catch (error) {
            this.logger.error('Erreur lors de la mise à jour', 'tracer', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la mise à jour. Réessayez plus tard.',
            });
        }
    }

    /**
     * Affiche un menu déroulant de sélection pour choisir le personnage à mettre à jour
     *
     * @param interaction - L'interaction Discord
     * @param characters - Liste des personnages enregistrés par l'utilisateur
     * @returns Promise qui se résout après sélection ou timeout
     *
     * @remarks
     * Crée un SelectMenu Discord avec:
     * - Une option par personnage de l'utilisateur
     * - Format: "N. Pseudo | Kill Fame: XXX | Guilde"
     * - Timeout de 60 secondes
     *
     * Comportement du collector:
     * - Filtre: Seul l'utilisateur qui a lancé la commande peut sélectionner
     * - Si sélection: Appelle updateCharacter() avec le personnage choisi
     * - Si timeout (60s): Message d'erreur demandant de réessayer
     * - Si utilisateur différent clique: Message éphémère de refus
     *
     * L'embed affiche un avertissement:
     * "⚠️ **Attention :** Vous serez renommé sur ce serveur avec le personnage sélectionné."
     *
     * Le menu et l'embed sont supprimés après sélection ou timeout.
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
            this.logger.error('Erreur lors de la sélection du personnage', 'tracer', error);
        }
    }

    /**
     * Met à jour les informations d'un personnage depuis l'API Albion
     *
     * @param interaction - L'interaction Discord
     * @param character - Le personnage à mettre à jour (depuis la base de données)
     * @returns Promise qui se résout après mise à jour complète
     *
     * @remarks
     * Séquence de mise à jour:
     *
     * 1. **Appel API Albion**
     *    - getPlayerDetailsById() avec l'albion_id du personnage
     *    - Retourne null si le personnage n'existe plus (404)
     *
     * 2. **Mise à jour base de données**
     *    - updateUserFromApi() met à jour:
     *      - albion_name (peut changer si renommé in-game)
     *      - kill_fame (valeur actuelle)
     *      - death_fame (valeur actuelle)
     *      - guild_name (nouvelle guilde ou null)
     *      - alliance_name (nouvelle alliance ou null)
     *      - updated_at (timestamp automatique)
     *
     * 3. **Mise à jour nickname Discord**
     *    - updateMemberNickname() change le pseudo du membre
     *    - Format: "Pseudo [TAG]" si guilde, "Pseudo" sinon
     *    - Silencieusement ignoré si permissions insuffisantes
     *
     * 4. **Embed de confirmation**
     *    - Couleur verte (#51CF66)
     *    - Affiche toutes les nouvelles stats
     *    - Timestamp du moment de la mise à jour
     *
     * Gestion des erreurs:
     * - Personnage 404 (supprimé in-game): Message d'erreur spécifique
     * - Timeout/Rate limit API: Message formaté via getAlbionApiErrorMessage()
     * - Autres erreurs: Message générique
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
            await updateMemberNickname(
                interaction.guild,
                interaction.user.id,
                playerDetails.Name,
                playerDetails.GuildName,
                this.logger
            );

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
            this.logger.error('Erreur lors de la mise à jour du personnage', 'tracer', error);

            await interaction.editReply({
                content: getAlbionApiErrorMessage(error),
                embeds: [],
                components: [],
            });
        }
    }
}

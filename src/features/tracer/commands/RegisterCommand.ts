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

/**
 * Paramètres qui différencient un enregistrement standard d'un enregistrement avec avertissement
 */
interface RegistrationMessages {
    /** Embed public annonçant le nouveau personnage */
    mainEmbed: EmbedBuilder;
    /** Embed d'instructions de vérification envoyé en MP */
    verificationEmbed: EmbedBuilder;
    /** Message éphémère de confirmation */
    confirmationMessage: string;
    /** Message de log en cas d'erreur */
    errorLogMessage: string;
}

/**
 * Commande /register pour enregistrer un personnage Albion Online à un compte Discord
 *
 * @remarks
 * Fonctionnalités:
 * - Recherche d'un personnage Albion par pseudo (API publique Albion)
 * - Menu de sélection si plusieurs résultats
 * - Vérification des conflits (personnage déjà vérifié par quelqu'un d'autre)
 * - Support des multi-claims (plusieurs utilisateurs peuvent revendiquer le même personnage non vérifié)
 * - Mise à jour automatique du pseudo Discord sur le serveur
 * - Embed récapitulatif avec tous les personnages de l'utilisateur
 * - Instructions de vérification envoyées en MP
 *
 * Flux d'enregistrement:
 * 1. Recherche du personnage via l'API Albion
 * 2. Menu de sélection si plusieurs résultats (max 25, timeout 60s)
 * 3. Vérifications:
 *    - Personnage vérifié par quelqu'un d'autre ? → REFUS
 *    - Utilisateur a déjà ce personnage ? → Affiche le statut existant
 *    - Autres claims non vérifiés existent ? → Enregistrement avec avertissement
 *    - Sinon → Enregistrement normal
 * 4. Mise à jour du nickname Discord (format: [TAG] Pseudo)
 * 5. Messages:
 *    - Éphémère: Confirmation rapide
 *    - MP: Instructions de vérification détaillées
 *    - Public: Embed d'enregistrement + récapitulatif des personnages
 */
export default class RegisterCommand extends BaseCommand {
    public name = 'register';
    public description = 'Enregistrer votre compte Albion Online';

    private readonly albionService: AlbionService;
    private readonly tracerService: TracerService;
    private readonly logger: LoggerService;

    /** Nombre maximum d'options d'un menu déroulant Discord */
    private readonly MAX_SELECT_OPTIONS = 25;
    private readonly SELECTION_TIMEOUT_MS = 60_000;

    /**
     * Crée une instance de la commande /register
     *
     * @remarks
     * Le logger provient du ServiceContainer ; AlbionService et TracerService
     * s'appuient eux aussi sur les services partagés (pool MySQL unique).
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
     * @returns SlashCommandBuilder avec l'option requise `pseudo`
     */
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

    /**
     * Exécute la commande /register
     *
     * @param interaction - L'interaction Discord de la commande slash
     *
     * @remarks
     * 0 résultat → message d'erreur, 1 résultat → enregistrement direct,
     * plusieurs résultats → menu de sélection.
     * Les erreurs API (timeout, rate limit…) sont traduites via getAlbionApiErrorMessage().
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const pseudo = interaction.options.getString('pseudo', true);

        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            this.logger.debug(`Recherche du joueur: ${pseudo}`, 'tracer');

            const players = await this.albionService.searchPlayer(pseudo);

            if (players.length === 0) {
                await interaction.editReply({
                    content: `❌ Aucun joueur trouvé avec le pseudo "${pseudo}" sur Albion Online.`,
                });
                return;
            }

            if (players.length === 1) {
                await this.handlePlayerRegistration(interaction, players[0]);
                return;
            }

            await this.showPlayerSelection(interaction, players);
        } catch (error: any) {
            this.logger.error('Erreur lors de l\'enregistrement', 'tracer', error);

            await interaction.editReply({
                content: getAlbionApiErrorMessage(error),
            });
        }
    }

    /**
     * Gère l'enregistrement d'un joueur après vérifications de conflits
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion sélectionné
     *
     * @remarks
     * Ordre des vérifications:
     * 1. Vérifié par quelqu'un d'autre → refus
     * 2. Déjà enregistré par l'utilisateur → affichage du statut
     * 3. Revendiqué (non vérifié) par d'autres → enregistrement avec avertissement
     * 4. Aucun conflit → enregistrement standard
     */
    private async handlePlayerRegistration(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer
    ): Promise<void> {
        const verifiedOwner = await this.tracerService.isCharacterVerifiedByOther(player.Id, interaction.user.id);

        if (verifiedOwner) {
            const embed = buildCharacterAlreadyVerifiedEmbed(
                verifiedOwner,
                player.Name,
                this.albionService.formatFame(player.KillFame),
                player.GuildName || undefined
            );

            await interaction.editReply({ embeds: [embed], components: [] });
            return;
        }

        const existingRegistration = await this.tracerService.getUserRegistrationForCharacter(
            interaction.user.id,
            player.Id
        );

        if (existingRegistration) {
            await this.handleAlreadyRegistered(interaction, player);
            return;
        }

        const unverifiedClaimsCount = await this.tracerService.countUnverifiedClaims(player.Id);

        if (unverifiedClaimsCount > 0) {
            const allClaims = await this.tracerService.getAllClaimsForCharacter(player.Id);
            await this.registerPlayerWithWarning(interaction, player, allClaims);
            return;
        }

        await this.registerPlayer(interaction, player);
    }

    /**
     * Affiche le statut d'un personnage déjà lié au compte de l'utilisateur
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion que l'utilisateur possède déjà
     *
     * @remarks
     * Vert si vérifié, rouge avec rappel de la procédure de vérification sinon.
     */
    private async handleAlreadyRegistered(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer
    ): Promise<void> {
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

        if (!isVerified) {
            embed.addFields({
                name: '💡 Conseil',
                value:
                    `Pour **sécuriser** ce personnage, vérifiez-le en envoyant un mail in-game à **DBcide** ` +
                    `avec votre Discord ID (\`${interaction.user.id}\`). Cela empêchera d'autres joueurs de le revendiquer.`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed], components: [] });
    }

    /**
     * Affiche un menu déroulant quand plusieurs joueurs correspondent à la recherche
     *
     * @param interaction - L'interaction Discord
     * @param players - Liste des joueurs trouvés via l'API Albion
     *
     * @remarks
     * - 25 options maximum (limite Discord), timeout de 60 secondes
     * - Seul l'auteur de la commande peut sélectionner
     * - Une seule sélection est traitée : le collector est arrêté dès la première,
     *   ce qui évite un double enregistrement si l'utilisateur change d'avis
     * - Le handler `collect` tourne après la fin de execute() : ses erreurs sont
     *   donc gérées ici (sinon promesse rejetée non gérée et utilisateur sans réponse)
     */
    private async showPlayerSelection(
        interaction: ChatInputCommandInteraction,
        players: AlbionPlayer[]
    ): Promise<void> {
        const displayedPlayers = players.slice(0, this.MAX_SELECT_OPTIONS);

        const options = displayedPlayers.map((player, index) => ({
            label: `${index + 1}. ${player.Name}`,
            description: `Kill Fame: ${this.albionService.formatFame(player.KillFame)} | ${
                player.GuildName || 'Aucune guilde'
            }`,
            value: player.Id,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select-player')
            .setPlaceholder('Sélectionnez votre personnage')
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor('#4A90E2')
            .setTitle('🔍 Plusieurs joueurs trouvés')
            .setDescription(
                `Plusieurs joueurs correspondent à votre recherche. Sélectionnez le bon :\n\n` +
                displayedPlayers
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

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: this.SELECTION_TIMEOUT_MS,
        });

        collector.on('collect', async (selectInteraction) => {
            try {
                if (selectInteraction.user.id !== interaction.user.id) {
                    await selectInteraction.reply({
                        content: '❌ Ce menu ne vous est pas destiné.',
                        flags: MessageFlagsBitField.Flags.Ephemeral,
                    });
                    return;
                }

                collector.stop('selected');

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
            } catch (error) {
                this.logger.error('Erreur lors de la sélection du joueur', 'tracer', error);
                await this.safeEditReply(interaction, getAlbionApiErrorMessage(error));
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'time') {
                await this.safeEditReply(interaction, '⏱️ Temps écoulé. Veuillez réessayer la commande.');
            }
        });
    }

    /**
     * Enregistre un personnage Albion sans conflit (cas standard)
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion à enregistrer
     */
    private async registerPlayer(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer
    ): Promise<void> {
        await this.completeRegistration(interaction, player, {
            mainEmbed: buildRegistrationSuccessEmbed(
                interaction.user.id,
                player.Name,
                this.albionService.formatFame(player.KillFame),
                player.GuildName,
                player.AllianceName
            ),
            verificationEmbed: buildVerificationInstructionsEmbed(player.Name, interaction.user.id),
            confirmationMessage: '✅ Enregistrement réussi ! Un message public a été envoyé et les instructions de vérification vous ont été envoyées en MP.',
            errorLogMessage: 'Erreur lors de l\'enregistrement final',
        });
    }

    /**
     * Enregistre un personnage Albion déjà revendiqué (non vérifié) par d'autres utilisateurs
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion à enregistrer
     * @param existingClaims - Revendications existantes des autres utilisateurs
     *
     * @remarks
     * Même séquence que registerPlayer() mais avec des embeds d'avertissement listant
     * les autres revendicateurs. Le premier à se faire vérifier verrouille le personnage.
     */
    private async registerPlayerWithWarning(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer,
        existingClaims: TracerUser[]
    ): Promise<void> {
        const otherClaimants = existingClaims
            .map(claim => `<@${claim.discord_id}>`)
            .join(', ');

        await this.completeRegistration(interaction, player, {
            mainEmbed: buildRegistrationWithWarningEmbed(
                interaction.user.id,
                player.Name,
                this.albionService.formatFame(player.KillFame),
                player.GuildName,
                player.AllianceName,
                otherClaimants,
                existingClaims.length
            ),
            verificationEmbed: buildVerificationWarningEmbed(interaction.user.id),
            confirmationMessage: '⚠️ Personnage enregistré avec avertissement. Vérifiez-le pour le sécuriser ! Les instructions vous ont été envoyées en MP.',
            errorLogMessage: 'Erreur lors de l\'enregistrement avec avertissement',
        });
    }

    /**
     * Séquence commune d'enregistrement : DB, pseudo, puis messages éphémère / MP / public
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion à enregistrer
     * @param messages - Embeds et textes propres au type d'enregistrement
     *
     * @remarks
     * L'échec du MP (DMs fermés) ou du message public (permissions du salon) est
     * seulement loggé : l'enregistrement a déjà réussi et l'utilisateur ne doit pas
     * recevoir un faux message d'erreur.
     *
     * Erreur CHARACTER_VERIFIED_BY_OTHER (personnage vérifié entre-temps) : embed de refus.
     */
    private async completeRegistration(
        interaction: ChatInputCommandInteraction,
        player: AlbionPlayer,
        messages: RegistrationMessages
    ): Promise<void> {
        try {
            await this.tracerService.registerUser(interaction.user.id, player);

            await updateMemberNickname(
                interaction.guild,
                interaction.user.id,
                player.Name,
                player.GuildName,
                this.logger
            );

            const allCharacters = await this.tracerService.getRegisteredUsers(interaction.user.id);
            const summaryEmbed = buildCharactersSummaryEmbed(allCharacters, this.albionService);

            await interaction.editReply({
                content: messages.confirmationMessage,
                embeds: [],
                components: [],
            });

            try {
                await interaction.user.send({ embeds: [messages.verificationEmbed] });
            } catch (error) {
                this.logger.warn(`Impossible d'envoyer le MP de vérification à ${interaction.user.tag}: ${error}`, 'tracer');
            }

            if (interaction.channel?.isSendable()) {
                try {
                    await interaction.channel.send({ embeds: [messages.mainEmbed, summaryEmbed] });
                } catch (error) {
                    this.logger.warn(`Impossible d'envoyer le message public d'enregistrement: ${error}`, 'tracer');
                }
            }
        } catch (error: any) {
            this.logger.error(messages.errorLogMessage, 'tracer', error);

            if (error.message?.startsWith('CHARACTER_VERIFIED_BY_OTHER:')) {
                const verifiedOwner = error.message.split(':')[1];
                const embed = buildCharacterAlreadyVerifiedEmbed(verifiedOwner);

                await interaction.editReply({ content: null, embeds: [embed], components: [] });
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
     * Modifie la réponse éphémère sans jamais lever d'erreur
     *
     * @param interaction - L'interaction Discord d'origine
     * @param content - Le texte à afficher (embeds et composants retirés)
     *
     * @remarks
     * Utilisé dans les handlers du collector, qui s'exécutent hors du try/catch de execute().
     */
    private async safeEditReply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
        try {
            await interaction.editReply({ content, embeds: [], components: [] });
        } catch (error) {
            this.logger.warn('Impossible de modifier la réponse de /register', 'tracer', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}

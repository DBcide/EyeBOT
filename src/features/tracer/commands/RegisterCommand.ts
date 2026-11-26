import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
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
import { tracerI18n, TracerTranslator } from '../i18n';
import { buildPlayerSelectMenu } from '../components/SelectMenus';
import { CharacterUpdateHandler } from '../handlers/CharacterUpdateHandler';
import {
    buildCharacterAlreadyVerifiedEmbed,
    buildCharactersSummaryEmbed,
    buildPlayerSelectionEmbed,
    buildRegistrationSuccessEmbed,
    buildRegistrationWithWarningEmbed,
    buildVerificationInstructionsEmbed,
    buildVerificationWarningEmbed,
    fromAlbionPlayer,
    fromTracerUser,
} from '../embeds';

/**
 * Paramètres qui différencient un enregistrement standard d'un enregistrement avec avertissement
 */
interface RegistrationMessages {
    /** Embed public annonçant le nouveau personnage */
    mainEmbed: EmbedBuilder;
    /** Embed d'instructions de vérification envoyé en MP */
    verificationEmbed: EmbedBuilder;
    /** Message éphémère de confirmation (déjà traduit) */
    confirmationMessage: string;
    /** Message de log en cas d'erreur */
    errorLogMessage: string;
}

/**
 * Commande /register pour enregistrer un personnage Albion Online à un compte Discord
 *
 * @remarks
 * Flux d'enregistrement:
 * 1. Recherche du personnage via l'API Albion
 * 2. Menu de sélection si plusieurs résultats (max 25, timeout 60s)
 * 3. Vérifications:
 *    - Personnage vérifié par quelqu'un d'autre ? → REFUS
 *    - Utilisateur a déjà ce personnage ? → Mise à jour comme /update (stats + pseudo sur ce serveur)
 *    - Autres claims non vérifiés existent ? → Enregistrement avec avertissement
 *    - Sinon → Enregistrement normal
 * 4. Mise à jour du nickname Discord (format: [TAG] Pseudo)
 * 5. Messages (dans la langue de l'utilisateur):
 *    - Éphémère: Confirmation rapide
 *    - MP: Instructions de vérification détaillées
 *    - Public: Embed d'enregistrement + récapitulatif des personnages
 *
 * Les textes et embeds sont dans `../locales/*.json` et `../embeds/`.
 */
export default class RegisterCommand extends BaseCommand {
    public name = 'register';
    public description = tracerI18n.default('commands.register.description');

    private readonly albionService: AlbionService;
    private readonly tracerService: TracerService;
    private readonly updateHandler: CharacterUpdateHandler;
    private readonly logger: LoggerService;

    private readonly SELECTION_TIMEOUT_MS = 60_000;

    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.albionService = new AlbionService();
        this.tracerService = new TracerService();
        this.updateHandler = new CharacterUpdateHandler();
    }

    /**
     * Construit la définition de la commande slash (descriptions traduites par Discord)
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(tracerI18n.localizations('commands.register.description'))
            .addStringOption((option) =>
                option
                    .setName('pseudo')
                    .setDescription(tracerI18n.default('commands.register.options.pseudo'))
                    .setDescriptionLocalizations(tracerI18n.localizations('commands.register.options.pseudo'))
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
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const pseudo = interaction.options.getString('pseudo', true);

        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        const t = tracerI18n.for(await this.resolveLocale(interaction));

        try {
            this.logger.debug(`Recherche du joueur: ${pseudo}`, 'tracer');

            const players = await this.albionService.searchPlayer(pseudo);

            if (players.length === 0) {
                await interaction.editReply({ content: t('register.playerNotFound', { pseudo }) });
                return;
            }

            if (players.length === 1) {
                await this.handlePlayerRegistration(interaction, t, players[0]);
                return;
            }

            await this.showPlayerSelection(interaction, t, players);
        } catch (error: any) {
            this.logger.error('Erreur lors de l\'enregistrement', 'tracer', error);
            await interaction.editReply({ content: getAlbionApiErrorMessage(error, t) });
        }
    }

    /**
     * Gère l'enregistrement d'un joueur après vérifications de conflits
     *
     * @param interaction - L'interaction Discord
     * @param t - Traductions dans la langue de l'utilisateur
     * @param player - Le personnage Albion sélectionné
     *
     * @remarks
     * Ordre des vérifications:
     * 1. Vérifié par quelqu'un d'autre → refus
     * 2. Déjà enregistré par l'utilisateur → mise à jour (flux de /update)
     * 3. Revendiqué (non vérifié) par d'autres → enregistrement avec avertissement
     * 4. Aucun conflit → enregistrement standard
     */
    private async handlePlayerRegistration(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        player: AlbionPlayer
    ): Promise<void> {
        const verifiedOwner = await this.tracerService.isCharacterVerifiedByOther(player.Id, interaction.user.id);

        if (verifiedOwner) {
            const embed = buildCharacterAlreadyVerifiedEmbed(t, verifiedOwner, fromAlbionPlayer(player));
            await interaction.editReply({ embeds: [embed], components: [] });
            return;
        }

        const existingRegistration = await this.tracerService.getUserRegistrationForCharacter(
            interaction.user.id,
            player.Id
        );

        if (existingRegistration) {
            // Déjà lié (ex: retour sur un serveur quitté, ou autre serveur utilisant le bot) :
            // on exécute directement le flux de /update au lieu d'un message "déjà enregistré"
            // qui n'indiquait pas quoi faire pour être renommé sur ce serveur
            await this.updateHandler.updateAndReply(interaction, t, existingRegistration);
            return;
        }

        const unverifiedClaimsCount = await this.tracerService.countUnverifiedClaims(player.Id);

        if (unverifiedClaimsCount > 0) {
            const allClaims = await this.tracerService.getAllClaimsForCharacter(player.Id);
            await this.registerPlayerWithWarning(interaction, t, player, allClaims);
            return;
        }

        await this.registerPlayer(interaction, t, player);
    }

    /**
     * Affiche un menu déroulant quand plusieurs joueurs correspondent à la recherche
     *
     * @param interaction - L'interaction Discord
     * @param t - Traductions dans la langue de l'utilisateur
     * @param players - Liste des joueurs trouvés via l'API Albion
     *
     * @remarks
     * - 25 options maximum (limite Discord), timeout de 60 secondes
     * - Seul l'auteur de la commande peut sélectionner
     * - Une seule sélection est traitée : le collector est arrêté dès la première
     * - Le handler `collect` tourne après la fin de execute() : ses erreurs sont gérées ici
     */
    private async showPlayerSelection(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        players: AlbionPlayer[]
    ): Promise<void> {
        const views = players.map(fromAlbionPlayer);

        const response = await interaction.editReply({
            embeds: [buildPlayerSelectionEmbed(t, views)],
            components: [buildPlayerSelectMenu(t, views)],
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: this.SELECTION_TIMEOUT_MS,
        });

        collector.on('collect', async (selectInteraction) => {
            try {
                if (selectInteraction.user.id !== interaction.user.id) {
                    // Réponse dans la langue de celui qui a cliqué, pas de l'auteur de la commande
                    const clickerT = tracerI18n.for(
                        await ServiceContainer.getInstance().locale.resolveForInteraction(selectInteraction)
                    );
                    await selectInteraction.reply({
                        content: clickerT('common.menu.notForYou'),
                        flags: MessageFlagsBitField.Flags.Ephemeral,
                    });
                    return;
                }

                collector.stop('selected');

                const selectedPlayer = players.find((p) => p.Id === selectInteraction.values[0]);

                if (!selectedPlayer) {
                    await selectInteraction.update({
                        content: t('register.selectedPlayerNotFound'),
                        embeds: [],
                        components: [],
                    });
                    return;
                }

                await selectInteraction.deferUpdate();
                await this.handlePlayerRegistration(interaction, t, selectedPlayer);
            } catch (error) {
                this.logger.error('Erreur lors de la sélection du joueur', 'tracer', error);
                await this.safeEditReply(interaction, getAlbionApiErrorMessage(error, t));
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'time') {
                await this.safeEditReply(interaction, t('common.menu.timeout'));
            }
        });
    }

    /**
     * Enregistre un personnage Albion sans conflit (cas standard)
     */
    private async registerPlayer(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        player: AlbionPlayer
    ): Promise<void> {
        await this.completeRegistration(interaction, t, player, {
            mainEmbed: buildRegistrationSuccessEmbed(t, interaction.user.id, fromAlbionPlayer(player)),
            verificationEmbed: buildVerificationInstructionsEmbed(t, player.Name, interaction.user.id),
            confirmationMessage: t('register.success'),
            errorLogMessage: 'Erreur lors de l\'enregistrement final',
        });
    }

    /**
     * Enregistre un personnage Albion déjà revendiqué (non vérifié) par d'autres utilisateurs
     *
     * @param existingClaims - Revendications existantes des autres utilisateurs
     *
     * @remarks
     * Embeds d'avertissement listant les autres revendicateurs.
     * Le premier à se faire vérifier verrouille le personnage.
     */
    private async registerPlayerWithWarning(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        player: AlbionPlayer,
        existingClaims: TracerUser[]
    ): Promise<void> {
        await this.completeRegistration(interaction, t, player, {
            mainEmbed: buildRegistrationWithWarningEmbed(
                t,
                interaction.user.id,
                fromAlbionPlayer(player),
                existingClaims.map(claim => claim.discord_id)
            ),
            verificationEmbed: buildVerificationWarningEmbed(t, interaction.user.id),
            confirmationMessage: t('register.successWithWarning'),
            errorLogMessage: 'Erreur lors de l\'enregistrement avec avertissement',
        });
    }

    /**
     * Séquence commune d'enregistrement : DB, pseudo, puis messages éphémère / MP / public
     *
     * @remarks
     * L'échec du MP (DMs fermés) ou du message public (permissions du salon) est
     * seulement loggé : l'enregistrement a déjà réussi.
     *
     * Erreur CHARACTER_VERIFIED_BY_OTHER (personnage vérifié entre-temps) : embed de refus.
     */
    private async completeRegistration(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
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
            const summaryEmbed = buildCharactersSummaryEmbed(t, allCharacters.map(fromTracerUser));

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
                const embed = buildCharacterAlreadyVerifiedEmbed(t, verifiedOwner);

                await interaction.editReply({ content: null, embeds: [embed], components: [] });
                return;
            }

            await interaction.editReply({
                content: t('register.error'),
                embeds: [],
                components: [],
            });
        }
    }

    /**
     * Modifie la réponse éphémère sans jamais lever d'erreur
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

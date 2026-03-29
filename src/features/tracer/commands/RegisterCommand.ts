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
 * 4. Mise à jour du nickname Discord (format: Pseudo [TAG])
 * 5. Messages:
 *    - Éphémère: Confirmation rapide
 *    - MP: Instructions de vérification détaillées
 *    - Public: Embed d'enregistrement + récapitulatif des personnages
 */
export default class RegisterCommand extends BaseCommand {
    public name = 'register';
    public description = 'Enregistrer votre compte Albion Online';

    private readonly albionService: AlbionService;
    private tracerService: TracerService;
    private readonly logger: LoggerService;

    /**
     * Crée une instance de la commande /register
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
     * @returns SlashCommandBuilder configuré avec le nom, description et options
     *
     * @remarks
     * Options de commande:
     * - pseudo (String, requis): Le pseudo in-game du joueur sur Albion Online
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
     * @returns Promise qui se résout quand l'enregistrement est terminé
     *
     * @remarks
     * Flux d'exécution:
     * 1. Defer la réponse en éphémère (recherche API peut prendre du temps)
     * 2. Rechercher le pseudo sur l'API Albion
     * 3. Si 0 résultat → Message d'erreur
     * 4. Si 1 résultat → handlePlayerRegistration() directement
     * 5. Si plusieurs résultats → showPlayerSelection() avec menu déroulant (max 25)
     *
     * Gestion des erreurs:
     * - Timeout API (10s) → Message d'erreur formaté
     * - Rate limit (429) → Message demandant de réessayer
     * - Autres erreurs → Message générique via getAlbionApiErrorMessage()
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const pseudo = interaction.options.getString('pseudo', true);

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
     * @returns Promise qui se résout après traitement complet
     *
     * @remarks
     * Cette méthode centralise la logique de décision pour l'enregistrement.
     * Elle effectue 3 vérifications dans l'ordre:
     *
     * 1. **Personnage vérifié par quelqu'un d'autre ?**
     *    - Résultat: REFUS strict avec embed d'erreur
     *    - Le personnage est verrouillé à son propriétaire vérifié
     *
     * 2. **Utilisateur a déjà enregistré ce personnage ?**
     *    - Résultat: Affiche le statut actuel (vérifié ou non)
     *    - Rappel des instructions de vérification si non vérifié
     *
     * 3. **D'autres utilisateurs revendiquent ce personnage (non vérifié) ?**
     *    - Résultat: Enregistrement autorisé avec avertissement
     *    - Liste les autres revendicateurs dans l'embed
     *    - Rappel d'importance de la vérification
     *
     * 4. **Aucun conflit**
     *    - Résultat: Enregistrement normal sans avertissement
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

            await interaction.editReply({ embeds: [embed] });
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
     * Gère le cas où l'utilisateur essaie d'enregistrer un personnage déjà lié à son compte
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion que l'utilisateur possède déjà
     * @returns Promise qui se résout après envoi de l'embed de statut
     *
     * @remarks
     * Affiche un embed informatif avec deux états possibles:
     *
     * **Si vérifié (is_verified = 1)**:
     * - Couleur verte (#2ECC71)
     * - Titre: "✅ Personnage déjà enregistré et vérifié"
     * - Pas de champ supplémentaire (déjà sécurisé)
     *
     * **Si non vérifié (is_verified = 0)**:
     * - Couleur rouge (#FF6B6B)
     * - Titre: "⚠️ Personnage déjà enregistré"
     * - Champ "💡 Conseil" rappelant la procédure de vérification
     *
     * L'embed affiche toujours:
     * - Pseudo Albion
     * - Kill Fame (formaté)
     * - Guilde et Alliance
     * - Statut de vérification
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

        await interaction.editReply({ embeds: [embed] });
    }

    /**
     * Affiche un menu déroulant de sélection quand plusieurs joueurs correspondent à la recherche
     *
     * @param interaction - L'interaction Discord
     * @param players - Liste des joueurs trouvés via l'API Albion
     * @returns Promise qui se résout après sélection ou timeout
     *
     * @remarks
     * Crée un SelectMenu Discord avec:
     * - Maximum 25 options (limite Discord pour les SelectMenu)
     * - Format: "N. Pseudo | Kill Fame: XXX | Guilde"
     * - Timeout de 60 secondes
     *
     * Comportement du collector:
     * - Filtre: Seul l'utilisateur qui a lancé la commande peut sélectionner
     * - Si sélection: Appelle handlePlayerRegistration() avec le joueur choisi
     * - Si timeout (60s): Message d'erreur demandant de réessayer
     * - Si utilisateur différent clique: Message éphémère de refus
     *
     * Le menu et l'embed sont supprimés après sélection ou timeout.
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
            this.logger.error('Erreur lors de la sélection du joueur', 'tracer', error);
        }
    }

    /**
     * Enregistre un personnage Albion sans conflit (cas standard)
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion à enregistrer
     * @returns Promise qui se résout après enregistrement complet
     *
     * @remarks
     * Séquence d'enregistrement standard (aucun autre claim existant):
     *
     * 1. **Enregistrement en base de données**
     *    - Appelle tracerService.registerUser()
     *    - Crée l'enregistrement dans tracer_users
     *
     * 2. **Mise à jour du nickname Discord**
     *    - Format: "Pseudo [TAG]" si l'utilisateur a une guilde
     *    - Format: "Pseudo" sinon
     *    - Utilise updateMemberNickname() qui gère les permissions
     *
     * 3. **Récupération de tous les personnages de l'utilisateur**
     *    - Pour afficher l'embed récapitulatif
     *
     * 4. **Construction des embeds**
     *    - mainEmbed: Succès de l'enregistrement avec infos du personnage
     *    - verificationEmbed: Instructions de vérification (envoyé en MP)
     *    - summaryEmbed: Liste de tous les personnages de l'utilisateur
     *
     * 5. **Envoi des messages**
     *    - Éphémère (editReply): Confirmation rapide
     *    - MP (DM): Instructions de vérification détaillées
     *    - Public (channel.send): mainEmbed + summaryEmbed
     *
     * Gestion d'erreur:
     * - CHARACTER_VERIFIED_BY_OTHER: Affiche embed de refus (race condition)
     * - Autres erreurs: Message générique d'erreur
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
            this.logger.error('Erreur lors de l\'enregistrement final', 'tracer', error);

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
     * Enregistre un personnage Albion avec avertissement (multi-claims détectés)
     *
     * @param interaction - L'interaction Discord
     * @param player - Le personnage Albion à enregistrer
     * @param existingClaims - Liste des autres utilisateurs qui revendiquent ce personnage
     * @returns Promise qui se résout après enregistrement complet
     *
     * @remarks
     * Identique à registerPlayer() mais avec des embeds différents pour signaler le conflit.
     *
     * **Différences avec registerPlayer()**:
     * - mainEmbed: Utilise buildRegistrationWithWarningEmbed() avec liste des revendicateurs
     * - verificationEmbed: Utilise buildVerificationWarningEmbed() (plus insistant)
     * - Message éphémère: "⚠️ Personnage enregistré avec avertissement"
     *
     * **Contexte du multi-claim**:
     * - Plusieurs utilisateurs Discord revendiquent le même personnage Albion
     * - Tous les claims sont non vérifiés (is_verified = 0)
     * - L'enregistrement est autorisé pour permettre la flexibilité
     * - Le premier à vérifier (mail in-game) verrouille le personnage
     * - La vérification supprime automatiquement tous les autres claims
     *
     * **Informations affichées dans l'embed**:
     * - Liste des autres revendicateurs (mentions Discord)
     * - Nombre total de revendications
     * - Rappel de l'importance de la vérification
     *
     * Séquence identique à registerPlayer():
     * 1. Enregistrement DB
     * 2. Mise à jour nickname
     * 3. Récupération de tous les personnages
     * 4. Construction des embeds (versions "warning")
     * 5. Envoi des messages (éphémère, MP, public)
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
            this.logger.error('Erreur lors de l\'enregistrement avec avertissement', 'tracer', error);

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
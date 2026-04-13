import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ComponentType,
    MessageFlagsBitField,
    Guild,
    GuildMember,
    User,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { VouchService } from '../services/VouchService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import {
    buildVouchNoVerifiedAccountEmbed,
    buildVouchTargetNoAccountEmbed,
    buildVouchCircularEmbed,
    buildVouchNoPermissionsEmbed,
    buildVouchGuildSelectorEmbed,
    buildVouchSuccessEmbed,
    buildVouchDMNotificationEmbed,
} from '../utils/VouchEmbedBuilders';

/**
 * Commande /vouch — Se porter garant d'un autre joueur Albion Online
 *
 * @remarks
 * Permet à un joueur vérifié de se porter garant pour un autre joueur sur un ou plusieurs
 * serveurs Discord en commun avec le bot.
 *
 * Flux d'exécution:
 * 1. Vérification des prérequis des deux utilisateurs (comptes Albion)
 * 2. Détection des vouches circulaires
 * 3. Récupération des serveurs éligibles (bot + exécuteur + cible membres)
 * 4. Vérification des autorisations (paramètres + prérequis de rôles) par serveur
 * 5. Affichage public d'un menu de sélection des serveurs (ou direct si serveur précisé)
 * 6. Enregistrement des vouches + notification MP à l'utilisateur garanti
 *
 * **Prévention des vouches circulaires**:
 * Si A vouche B, alors B ne peut plus voucher A (dans aucun serveur).
 *
 * **Paramètre optionnel `serveur`**:
 * Si précisé (ID du serveur), le vouch est appliqué directement sur ce serveur
 * si l'exécuteur y a les autorisations (sans afficher le menu de sélection).
 */
export default class VouchCommand extends BaseCommand {
    public name = 'vouch';
    public description = 'Se porter garant pour un autre joueur Albion Online';

    private readonly vouchService: VouchService;
    private readonly logger: LoggerService;

    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.vouchService = new VouchService();
    }

    /**
     * Construit la définition de la commande slash pour l'API Discord
     *
     * @returns SlashCommandBuilder configuré avec les options utilisateur et serveur
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addUserOption(option =>
                option
                    .setName('utilisateur')
                    .setDescription('L\'utilisateur Discord pour qui vous vous portez garant')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('serveur')
                    .setDescription('ID du serveur Discord ciblé (optionnel — tous les serveurs éligibles sinon)')
                    .setRequired(false)
            ) as SlashCommandBuilder;
    }

    /**
     * Exécute la commande /vouch
     *
     * @param interaction - L'interaction Discord de la commande slash
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        const targetUser = interaction.options.getUser('utilisateur', true);
        const specificGuildId = interaction.options.getString('serveur', false);

        // Auto-vouch interdit
        if (targetUser.id === interaction.user.id) {
            await interaction.editReply({
                embeds: [buildVouchNoPermissionsEmbed('Vous ne pouvez pas vous porter garant de vous-même.')]
            });
            return;
        }

        try {
            // Étape 2 : vérifier que l'exécuteur a un compte Albion vérifié
            const executorHasVerified = await this.vouchService.hasVerifiedAlbionAccount(interaction.user.id);
            if (!executorHasVerified) {
                await interaction.editReply({ embeds: [buildVouchNoVerifiedAccountEmbed()] });
                return;
            }

            // Étape 2 : vérifier que la cible a au moins un compte Albion enregistré
            const targetHasAccount = await this.vouchService.hasAnyAlbionAccount(targetUser.id);
            if (!targetHasAccount) {
                await interaction.editReply({ embeds: [buildVouchTargetNoAccountEmbed(targetUser)] });
                return;
            }

            // Récupération des serveurs où les deux utilisateurs sont membres ET le bot est présent
            const eligibleGuilds = await this.resolveEligibleGuilds(
                interaction,
                targetUser,
                specificGuildId
            );

            if (eligibleGuilds.length === 0) {
                const reason = specificGuildId
                    ? `Vous n'avez pas les autorisations pour effectuer un vouch dans le serveur spécifié, ou ce serveur est introuvable / les deux utilisateurs n'en sont pas membres.`
                    : `Vous n'avez les autorisations pour effectuer un vouch dans aucun des serveurs communs.\n\n💡 Les autorisations de vouch sont définies par les administrateurs des serveurs Discord.`;
                await interaction.editReply({ embeds: [buildVouchNoPermissionsEmbed(reason)] });
                return;
            }

            // Si un serveur spécifique est précisé et que l'exécuteur y a accès → vouch direct
            if (specificGuildId && eligibleGuilds.length === 1) {
                await this.processDirectVouch(interaction, targetUser, eligibleGuilds);
                return;
            }

            // Étape 3 : afficher le menu de sélection des serveurs (message public non éphémère)
            await this.showGuildSelector(interaction, targetUser, eligibleGuilds);

        } catch (error) {
            this.logger.error('Erreur lors de l\'exécution du vouch', 'vouch', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors du traitement du vouch. Veuillez réessayer.',
                embeds: [],
                components: [],
            });
        }
    }

    /**
     * Résout la liste des serveurs éligibles pour le vouch
     *
     * @param interaction - L'interaction Discord
     * @param targetUser - L'utilisateur cible
     * @param specificGuildId - ID du serveur spécifique (optionnel)
     * @returns Liste des serveurs où le vouch peut être effectué
     *
     * @remarks
     * Un serveur est éligible si:
     * 1. Le bot y est présent
     * 2. L'exécuteur en est membre
     * 3. La cible en est membre
     * 4. La feature vouch est activée sur ce serveur (vouch_guild_settings.is_enabled = 1)
     * 5. L'exécuteur remplit les prérequis de rôles configurés
     * 6. Le vouch n'existe pas déjà (voucher → vouchee dans ce serveur)
     */
    private async resolveEligibleGuilds(
        interaction: ChatInputCommandInteraction,
        targetUser: User,
        specificGuildId: string | null
    ): Promise<Guild[]> {
        const guildsToCheck = specificGuildId
            ? interaction.client.guilds.cache.filter(g => g.id === specificGuildId)
            : interaction.client.guilds.cache;

        const eligibleGuilds: Guild[] = [];

        for (const [, guild] of guildsToCheck) {
            try {
                // Vérifier la présence des deux utilisateurs dans ce serveur
                const [voucherMember, ] = await Promise.all([
                    guild.members.fetch(interaction.user.id),
                    guild.members.fetch(targetUser.id),
                ]);

                // Vérifier si la feature vouch est activée pour ce serveur
                const settings = await this.vouchService.getGuildSettings(guild.id);
                if (!settings || settings.is_enabled !== 1) continue;

                // Vérifier que l'exécuteur remplit les prérequis de rôles
                const voucherRoles = (voucherMember as GuildMember).roles.cache.map(r => r.id);
                const meetsRequirements = await this.vouchService.userMeetsRequirements(voucherRoles, guild.id);
                if (!meetsRequirements) continue;

                // Vérifier que ce vouch n'existe pas déjà
                const alreadyVouched = await this.vouchService.vouchExists(
                    interaction.user.id,
                    targetUser.id,
                    guild.id
                );
                if (alreadyVouched) continue;

                // Vérifier que l'ajout de cet arc ne crée pas de circuit dans le graphe du serveur
                const canVouch = await this.vouchService.canVouch(
                    interaction.user.id,
                    targetUser.id,
                    guild.id
                );
                if (!canVouch) continue;

                eligibleGuilds.push(guild);
            } catch {
                // L'un des membres n'est pas dans ce serveur ou fetch impossible
            }
        }

        return eligibleGuilds;
    }

    /**
     * Affiche le menu de sélection des serveurs (message public non éphémère)
     *
     * @param interaction - L'interaction Discord
     * @param targetUser - L'utilisateur sous garantie
     * @param eligibleGuilds - Liste des serveurs éligibles
     *
     * @remarks
     * Envoie un message non éphémère dans le canal avec un menu déroulant (multi-sélection).
     * Timeout de 5 minutes. Le message est édité avec le résultat après sélection.
     */
    private async showGuildSelector(
        interaction: ChatInputCommandInteraction,
        targetUser: User,
        eligibleGuilds: Guild[]
    ): Promise<void> {
        if (!interaction.channel?.isSendable()) {
            await interaction.editReply({
                content: '❌ Impossible d\'envoyer le message dans ce canal.',
            });
            return;
        }

        // Supprimer le message éphémère "thinking..." — le message public suffit
        await interaction.deleteReply();

        const options = eligibleGuilds.slice(0, 25).map(guild => ({
            label: guild.name,
            value: guild.id,
            description: `Serveur ID: ${guild.id}`,
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`vouch-guild-select-${interaction.user.id}`)
            .setPlaceholder('Sélectionnez le(s) serveur(s)...')
            .setMinValues(1)
            .setMaxValues(options.length)
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const selectorEmbed = buildVouchGuildSelectorEmbed(interaction.user, targetUser, eligibleGuilds);

        const publicMessage = await interaction.channel.send({
            embeds: [selectorEmbed],
            components: [row],
        });

        const collector = publicMessage.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300_000, // 5 minutes
            filter: i => i.user.id === interaction.user.id,
            max: 1,
        });

        collector.on('collect', async selectInteraction => {
            await selectInteraction.deferUpdate();

            const selectedGuildIds = selectInteraction.values;
            const selectedGuilds = eligibleGuilds.filter(g => selectedGuildIds.includes(g.id));

            await this.saveVouches(interaction.user, targetUser, selectedGuilds);

            const successEmbed = buildVouchSuccessEmbed(interaction.user, targetUser, selectedGuilds);
            await publicMessage.edit({ embeds: [successEmbed], components: [] });

            await this.sendDMToVouchee(targetUser, interaction.user, selectedGuilds);
        });

        collector.on('end', async collected => {
            if (collected.size === 0) {
                await publicMessage.edit({
                    embeds: [buildVouchNoPermissionsEmbed('⏱️ Temps écoulé. La sélection des serveurs a expiré.')],
                    components: [],
                });
            }
        });
    }

    /**
     * Traite un vouch direct (sans menu de sélection) quand un serveur spécifique est précisé
     *
     * @param interaction - L'interaction Discord
     * @param targetUser - L'utilisateur sous garantie
     * @param eligibleGuilds - Liste des serveurs éligibles (1 seul dans ce cas)
     *
     * @remarks
     * Utilisé quand le paramètre `serveur` est fourni et que l'exécuteur y a accès.
     * Envoie un message public dans le canal + DM à l'utilisateur garanti.
     */
    private async processDirectVouch(
        interaction: ChatInputCommandInteraction,
        targetUser: User,
        eligibleGuilds: Guild[]
    ): Promise<void> {
        await this.saveVouches(interaction.user, targetUser, eligibleGuilds);

        const successEmbed = buildVouchSuccessEmbed(interaction.user, targetUser, eligibleGuilds);

        // Supprimer le message éphémère "thinking..." et envoyer uniquement le message public
        await interaction.deleteReply();

        if (interaction.channel?.isSendable()) {
            await interaction.channel.send({ embeds: [successEmbed] });
        }

        await this.sendDMToVouchee(targetUser, interaction.user, eligibleGuilds);
    }

    /**
     * Enregistre les vouches en base de données et log chaque création
     *
     * @param voucher - L'utilisateur Discord qui se porte garant
     * @param vouchee - L'utilisateur Discord sous garantie
     * @param guilds - Liste des serveurs sur lesquels créer le vouch
     */
    private async saveVouches(voucher: User, vouchee: User, guilds: Guild[]): Promise<void> {
        const services = ServiceContainer.getInstance();

        for (const guild of guilds) {
            await this.vouchService.createVouch(voucher.id, vouchee.id, guild.id);

            await services.dbLogger.logEvent({
                eventType: 'vouch_created',
                userId: voucher.id,
                guildId: guild.id,
                details: {
                    voucherId: voucher.id,
                    voucherTag: voucher.username,
                    voucheeId: vouchee.id,
                    voucheeTag: vouchee.username,
                    guildId: guild.id,
                    guildName: guild.name,
                },
            });
        }
    }

    /**
     * Envoie un message privé à l'utilisateur sous garantie pour le notifier du vouch
     *
     * @param vouchee - L'utilisateur Discord sous garantie
     * @param voucher - L'utilisateur Discord qui s'est porté garant
     * @param guilds - Liste des serveurs sur lesquels le vouch a été accordé
     */
    private async sendDMToVouchee(vouchee: User, voucher: User, guilds: Guild[]): Promise<void> {
        try {
            const dmEmbed = buildVouchDMNotificationEmbed(voucher, guilds);
            await vouchee.send({ embeds: [dmEmbed] });
        } catch {
            this.logger.warn(`Impossible d'envoyer la notification MP de vouch à ${vouchee.username}`);
        }
    }
}

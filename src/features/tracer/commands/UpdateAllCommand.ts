import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlagsBitField,
    GuildMember,
    Message,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { CharacterSyncService } from '../services/CharacterSyncService';
import { AlbionService } from '../services/AlbionService';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { TracerUser } from '../models/AlbionTypes';
import { tracerI18n, TracerTranslator } from '../i18n';
import {
    buildUpdateAllProgressEmbed,
    buildUpdateAllStartEmbed,
    buildUpdateAllSummaryEmbed,
    UpdateAllResults,
} from '../embeds';

/**
 * Commande /updateall pour mettre à jour tous les membres d'un serveur en masse
 *
 * @remarks
 * Commande administrative réservée aux membres ayant la permission "Gérer les pseudonymes".
 *
 * Flux d'exécution:
 * 1. Vérification des permissions (ManageNicknames requise)
 * 2. Récupération de tous les membres du serveur et des utilisateurs enregistrés en DB
 * 3. Filtrage des membres avec personnages enregistrés (personnage "main" en priorité)
 * 4. Traitement par batch de 5 (1s de pause entre batches) avec progression affichée
 * 5. Rapport final avec statistiques détaillées
 *
 * La progression est publique dans le salon, affichée dans la langue de l'administrateur.
 */
export default class UpdateAllCommand extends BaseCommand {
    public name = 'updateall';
    public description = tracerI18n.default('commands.updateall.description');

    private readonly tracerService: TracerService;
    private readonly syncService: CharacterSyncService;
    private readonly logger: LoggerService;

    private readonly BATCH_SIZE = 5;
    private readonly DELAY_BETWEEN_BATCHES_MS = 1000;

    /**
     * @param albionService - Client API Albion (injection pour les tests)
     * @param tracerService - Accès aux personnages en base (injection pour les tests)
     * @param logger - Logger (injection pour les tests)
     */
    constructor(albionService?: AlbionService, tracerService?: TracerService, logger?: LoggerService) {
        super();
        this.logger = logger ?? ServiceContainer.getInstance().logger;
        this.tracerService = tracerService ?? new TracerService(undefined, this.logger);
        this.syncService = new CharacterSyncService(albionService, this.tracerService, this.logger);
    }

    /**
     * Construit la définition de la commande slash
     *
     * @remarks
     * Permission par défaut ManageNicknames : la commande est masquée aux autres membres.
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(tracerI18n.localizations('commands.updateall.description'))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames);
    }

    /**
     * Exécute la commande /updateall
     *
     * @param interaction - L'interaction Discord de la commande slash
     *
     * @remarks
     * - Erreurs individuelles : capturées par Promise.allSettled dans processBatchUpdates()
     * - Erreur critique : message d'erreur + log pour investigation
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const t = tracerI18n.for(await this.resolveLocale(interaction));

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageNicknames)) {
            await interaction.reply({
                content: t('updateAll.noPermission'),
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        if (!interaction.guild) {
            await interaction.reply({
                content: t('updateAll.guildOnly'),
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        // deferReply sans flag ephemeral : la progression sera visible dans le canal.
        // Cela permet de récupérer un vrai Message après le premier editReply et d'utiliser
        // message.edit() (token bot, sans limite 15 min) au lieu de interaction.editReply()
        // (token webhook, qui expire 15 minutes après la création de l'interaction).
        await interaction.deferReply();

        let progressMessage: Message | null = null;

        try {
            this.logger.info(`UpdateAll lancé par ${interaction.user.tag} sur ${interaction.guild.name}`, 'tracer');

            const members = await interaction.guild.members.fetch();
            this.logger.debug(`${members.size} membres trouvés sur le serveur`, 'tracer');

            const registeredUsers = await this.getAllRegisteredUsers();
            this.logger.debug(`${registeredUsers.length} utilisateurs enregistrés dans la base`, 'tracer');

            // Index par discord_id : évite de reparcourir toute la table pour chaque membre
            const charactersByDiscordId = new Map<string, TracerUser[]>();
            for (const user of registeredUsers) {
                const characters = charactersByDiscordId.get(user.discord_id) ?? [];
                characters.push(user);
                charactersByDiscordId.set(user.discord_id, characters);
            }

            const membersToUpdate: { member: GuildMember; dbUser: TracerUser }[] = [];

            for (const member of members.values()) {
                if (member.user.bot) continue;

                const userCharacters = charactersByDiscordId.get(member.id);

                if (userCharacters && userCharacters.length > 0) {
                    const mainCharacter = userCharacters.find(u => u.is_main === 1) || userCharacters[0];
                    membersToUpdate.push({ member, dbUser: mainCharacter });
                }
            }

            if (membersToUpdate.length === 0) {
                await interaction.editReply({ content: t('updateAll.noMembers') });
                return;
            }

            await interaction.editReply({ embeds: [buildUpdateAllStartEmbed(t, membersToUpdate.length)] });

            // Récupère l'objet Message réel après le premier editReply.
            // Les appels suivants passent par message.edit() (token bot) et non
            // interaction.editReply() (token webhook expirant à 15 min).
            progressMessage = await interaction.fetchReply();

            const results = await this.processBatchUpdates(t, membersToUpdate, progressMessage);

            await progressMessage.edit({ embeds: [buildUpdateAllSummaryEmbed(t, results)] });

            this.logger.success(`UpdateAll terminé : ${results.success} réussites, ${results.failures} échecs`, 'tracer');

        } catch (error) {
            this.logger.error('Erreur lors de l\'UpdateAll', 'tracer', error);
            await this.reportCriticalError(interaction, t, progressMessage);
        }
    }

    /**
     * Affiche le message d'erreur critique sans jamais lever d'erreur
     *
     * @remarks
     * Après 15 minutes, le token de l'interaction a expiré : interaction.editReply()
     * échoue. On passe donc par message.edit() (token bot) dès que le message existe.
     */
    private async reportCriticalError(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        progressMessage: Message | null
    ): Promise<void> {
        const content = t('updateAll.criticalError');

        try {
            if (progressMessage) {
                await progressMessage.edit({ content, embeds: [] });
            } else {
                await interaction.editReply({ content });
            }
        } catch (error) {
            this.logger.warn('Impossible d\'afficher l\'erreur critique de /updateall', 'tracer', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Récupère tous les personnages enregistrés, triés par discord_id puis is_main
     */
    private async getAllRegisteredUsers(): Promise<TracerUser[]> {
        return this.tracerService.getAllUsers();
    }

    /**
     * Traite les mises à jour par batch pour éviter de surcharger l'API Albion
     *
     * @param t - Traductions de l'administrateur (embed de progression)
     * @param membersToUpdate - Membres à mettre à jour avec leur personnage
     * @param progressMessage - Message de progression à éditer après chaque batch
     * @returns Compteurs (réussites, échecs, ignorés) et détails des échecs
     *
     * @remarks
     * - fulfilled + success → réussite ; fulfilled + !success → ignoré (personnage 404)
     * - rejected → échec, ajouté aux détails
     * - Pause de DELAY_BETWEEN_BATCHES_MS entre chaque batch (sauf le dernier)
     */
    private async processBatchUpdates(
        t: TracerTranslator,
        membersToUpdate: { member: GuildMember; dbUser: TracerUser }[],
        progressMessage: Message
    ): Promise<UpdateAllResults> {
        let successCount = 0;
        let failureCount = 0;
        let skippedCount = 0;
        const failureDetails: string[] = [];

        const totalBatches = Math.ceil(membersToUpdate.length / this.BATCH_SIZE);

        for (let i = 0; i < membersToUpdate.length; i += this.BATCH_SIZE) {
            const batch = membersToUpdate.slice(i, i + this.BATCH_SIZE);
            const currentBatch = Math.floor(i / this.BATCH_SIZE) + 1;

            this.logger.debug(`Traitement du batch ${currentBatch}/${totalBatches}`, 'tracer');

            const batchResults = await Promise.allSettled(
                batch.map(({ member, dbUser }) => this.updateSingleMember(member, dbUser))
            );

            batchResults.forEach((result, index) => {
                const { member, dbUser } = batch[index];

                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        successCount++;
                    } else {
                        skippedCount++;
                    }
                } else {
                    failureCount++;
                    this.logger.error(`Erreur lors de la mise à jour de ${member.user.tag}`, 'tracer', result.reason);
                    const errorMsg = result.reason?.message || 'Erreur inconnue';
                    failureDetails.push(`${member.user.tag} (${dbUser.albion_name}): ${errorMsg}`);
                }
            });

            const progressEmbed = buildUpdateAllProgressEmbed(t, {
                total: membersToUpdate.length,
                processed: i + batch.length,
                success: successCount,
                skipped: skippedCount,
                failures: failureCount,
                batch: currentBatch,
                totalBatches,
            });

            // Un échec d'affichage de la progression ne doit pas interrompre les mises à jour
            try {
                await progressMessage.edit({ embeds: [progressEmbed] });
            } catch (error) {
                this.logger.warn('Impossible de mettre à jour la progression de /updateall', 'tracer', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }

            if (i + this.BATCH_SIZE < membersToUpdate.length) {
                await this.delay(this.DELAY_BETWEEN_BATCHES_MS);
            }
        }

        return {
            success: successCount,
            failures: failureCount,
            skipped: skippedCount,
            details: failureDetails,
        };
    }

    /**
     * Met à jour un membre : API Albion → base de données → nickname Discord
     *
     * @returns { success: true } si réussi, { success: false, skipped: true } si personnage 404
     * @throws {Error} Si erreur API (timeout, rate limit) ou DB : capturée par Promise.allSettled
     * et loguée une seule fois dans processBatchUpdates()
     */
    private async updateSingleMember(
        member: GuildMember,
        dbUser: TracerUser
    ): Promise<{ success: boolean; skipped?: boolean }> {
        const playerDetails = await this.syncService.syncCharacter(member.guild, member.id, dbUser.albion_id);

        if (!playerDetails) {
            this.logger.warn(`Personnage ${dbUser.albion_name} (ID: ${dbUser.albion_id}) introuvable sur l'API`, 'tracer');
            return { success: false, skipped: true };
        }

        this.logger.debug(`Mise à jour réussie : ${member.user.tag} -> ${playerDetails.Name}`, 'tracer');

        return { success: true };
    }

    /**
     * Pause asynchrone entre deux batches
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

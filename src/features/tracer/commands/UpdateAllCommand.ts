import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlagsBitField,
    GuildMember,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { AlbionService } from '../services/AlbionService';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { TracerUser } from '../models/AlbionTypes';
import { updateMemberNickname } from '../utils/DiscordUtils';

export default class UpdateAllCommand extends BaseCommand {
    public name = 'updateall';
    public description = 'Met à jour les pseudonymes de tous les membres enregistrés sur le serveur';

    private readonly albionService: AlbionService;
    private readonly tracerService: TracerService;
    private readonly logger: LoggerService;

    // Configuration pour optimiser les requêtes API
    private readonly BATCH_SIZE = 5; // Nombre de requêtes simultanées
    private readonly DELAY_BETWEEN_BATCHES_MS = 1000; // Délai entre chaque batch (1 seconde)

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
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames) as SlashCommandBuilder;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // Vérifier les permissions
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageNicknames)) {
            await interaction.reply({
                content: '❌ Vous n\'avez pas la permission de gérer les pseudonymes.',
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            this.logger.info(`UpdateAll lancé par ${interaction.user.tag} sur ${interaction.guild.name}`);

            // Étape 1 : Récupérer tous les membres du serveur
            const members = await interaction.guild.members.fetch();
            this.logger.debug(`${members.size} membres trouvés sur le serveur`);

            // Étape 2 : Récupérer tous les utilisateurs enregistrés dans la base de données
            const registeredUsers = await this.getAllRegisteredUsers();
            this.logger.debug(`${registeredUsers.length} utilisateurs enregistrés dans la base`);

            // Étape 3 : Filtrer les membres qui ont un compte enregistré
            const membersToUpdate: { member: GuildMember; dbUser: TracerUser }[] = [];

            for (const [_, member] of members) {
                // Ignorer les bots
                if (member.user.bot) continue;

                // Chercher si ce membre a un compte enregistré
                const userCharacters = registeredUsers.filter(u => u.discord_id === member.id);

                if (userCharacters.length > 0) {
                    // Prendre le personnage principal si défini, sinon le premier
                    const mainCharacter = userCharacters.find(u => u.is_main === 1) || userCharacters[0];
                    membersToUpdate.push({ member, dbUser: mainCharacter });
                }
            }

            if (membersToUpdate.length === 0) {
                await interaction.editReply({
                    content: '📭 Aucun membre avec un compte Albion enregistré n\'a été trouvé.',
                });
                return;
            }

            // Étape 4 : Afficher un message initial de progression
            const initialEmbed = new EmbedBuilder()
                .setColor('#4A90E2')
                .setTitle('🔄 Mise à jour en cours...')
                .setDescription(
                    `**Membres à mettre à jour :** ${membersToUpdate.length}\n` +
                    `**Progression :** 0/${membersToUpdate.length}\n\n` +
                    `⏳ Traitement en cours, veuillez patienter...`
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [initialEmbed] });

            // Étape 5 : Traiter les mises à jour par batch
            const results = await this.processBatchUpdates(membersToUpdate, interaction);

            // Étape 6 : Afficher le résumé final
            await this.displayFinalSummary(interaction, results);

            this.logger.success(`UpdateAll terminé : ${results.success} réussites, ${results.failures} échecs`);

        } catch (error) {
            this.logger.error('Erreur lors de l\'UpdateAll', error);
            await interaction.editReply({
                content: '❌ Une erreur critique est survenue lors de la mise à jour. Consultez les logs.',
            });
        }
    }

    /**
     * Récupère tous les utilisateurs enregistrés dans la base de données
     */
    private async getAllRegisteredUsers(): Promise<TracerUser[]> {
        const db = ServiceContainer.getInstance().database;
        return await db.select<TracerUser>('SELECT * FROM tracer_users ORDER BY discord_id, is_main DESC');
    }

    /**
     * Traite les mises à jour par batch pour éviter de surcharger l'API
     */
    private async processBatchUpdates(
        membersToUpdate: { member: GuildMember; dbUser: TracerUser }[],
        interaction: ChatInputCommandInteraction
    ): Promise<{ success: number; failures: number; skipped: number; details: string[] }> {
        let successCount = 0;
        let failureCount = 0;
        let skippedCount = 0;
        const failureDetails: string[] = [];

        const totalBatches = Math.ceil(membersToUpdate.length / this.BATCH_SIZE);

        for (let i = 0; i < membersToUpdate.length; i += this.BATCH_SIZE) {
            const batch = membersToUpdate.slice(i, i + this.BATCH_SIZE);
            const currentBatch = Math.floor(i / this.BATCH_SIZE) + 1;

            this.logger.debug(`Traitement du batch ${currentBatch}/${totalBatches}`);

            // Traiter le batch en parallèle
            const batchResults = await Promise.allSettled(
                batch.map(({ member, dbUser }) => this.updateSingleMember(member, dbUser))
            );

            // Analyser les résultats du batch
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
                    const errorMsg = result.reason?.message || 'Erreur inconnue';
                    failureDetails.push(`${member.user.tag} (${dbUser.albion_name}): ${errorMsg}`);
                }
            });

            // Mettre à jour la progression
            const progressEmbed = new EmbedBuilder()
                .setColor('#4A90E2')
                .setTitle('🔄 Mise à jour en cours...')
                .setDescription(
                    `**Membres à mettre à jour :** ${membersToUpdate.length}\n` +
                    `**Progression :** ${i + batch.length}/${membersToUpdate.length}\n` +
                    `**Réussites :** ${successCount} ✅\n` +
                    `**Ignorés :** ${skippedCount} ⏭️\n` +
                    `**Échecs :** ${failureCount} ❌\n\n` +
                    `⏳ Batch ${currentBatch}/${totalBatches} terminé...`
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [progressEmbed] });

            // Délai entre les batches pour éviter le "rate limit" (sauf pour le dernier batch)
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
     * Met à jour un seul membre
     */
    private async updateSingleMember(
        member: GuildMember,
        dbUser: TracerUser
    ): Promise<{ success: boolean; skipped?: boolean }> {
        try {
            // Récupérer les données à jour depuis l'API Albion
            const playerDetails = await this.albionService.getPlayerDetailsById(dbUser.albion_id);

            if (!playerDetails) {
                this.logger.warn(`Personnage ${dbUser.albion_name} (ID: ${dbUser.albion_id}) introuvable sur l'API`);
                return { success: false, skipped: true };
            }

            // Mettre à jour en base de données
            await this.tracerService.updateUserFromApi(dbUser.albion_id, playerDetails);

            // Renommer le membre sur le serveur
            await updateMemberNickname(
                member.guild,
                member.id,
                playerDetails.Name,
                playerDetails.GuildName,
                this.logger
            );

            this.logger.debug(`✅ Mise à jour réussie : ${member.user.tag} -> ${playerDetails.Name}`);

            return { success: true };
        } catch (error: any) {
            this.logger.error(`Erreur lors de la mise à jour de ${member.user.tag}`, error);
            throw error;
        }
    }

    /**
     * Affiche le résumé final de la mise à jour
     */
    private async displayFinalSummary(
        interaction: ChatInputCommandInteraction,
        results: { success: number; failures: number; skipped: number; details: string[] }
    ): Promise<void> {
        const total = results.success + results.failures + results.skipped;
        const color = results.failures > 0 ? '#F39C12' : '#51CF66';

        const summaryEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle('✅ Mise à jour terminée')
            .setDescription(
                `**Total de membres traités :** ${total}\n\n` +
                `✅ **Réussies :** ${results.success}\n` +
                `⏭️ **Ignorés (non trouvés sur l'API) :** ${results.skipped}\n` +
                `❌ **Échecs :** ${results.failures}`
            )
            .setTimestamp();

        // Ajouter les détails des échecs s'il y en a (limité aux 10 premiers)
        if (results.details.length > 0) {
            const errorList = results.details
                .slice(0, 10)
                .map((detail, i) => `${i + 1}. ${detail}`)
                .join('\n');

            summaryEmbed.addFields({
                name: '❌ Détails des échecs',
                value: errorList + (results.details.length > 10 ? `\n... et ${results.details.length - 10} autres` : ''),
            });
        }

        await interaction.editReply({ embeds: [summaryEmbed] });
    }

    /**
     * Délai asynchrone
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

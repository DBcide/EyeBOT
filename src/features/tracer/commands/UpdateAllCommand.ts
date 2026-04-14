import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlagsBitField,
    GuildMember,
    Message,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { AlbionService } from '../services/AlbionService';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { TracerUser } from '../models/AlbionTypes';
import { updateMemberNickname } from '../utils/DiscordUtils';

/**
 * Commande /updateall pour mettre à jour tous les membres d'un serveur en masse
 *
 * @remarks
 * Commande administrative réservée aux membres ayant la permission "Gérer les pseudonymes".
 *
 * Fonctionnalités:
 * - Récupère tous les membres du serveur Discord
 * - Filtre ceux qui ont un personnage Albion enregistré
 * - Met à jour leurs informations depuis l'API Albion
 * - Met à jour automatiquement leurs pseudonymes Discord
 * - Affiche une progression en temps réel
 * - Génère un rapport détaillé (réussites, échecs, ignorés)
 *
 * Optimisations pour éviter le rate limiting:
 * - **Batch processing**: Traite 5 membres en parallèle maximum
 * - **Délai entre batches**: 1 seconde de pause entre chaque groupe
 * - **Timeout API**: 10 secondes par requête Albion
 *
 * Cas d'usage:
 * - Après un changement de format de pseudonyme
 * - Après une migration de données
 * - Pour rafraîchir les infos de tous les membres en une fois
 * - Maintenance régulière du serveur
 *
 * Priorisation des personnages:
 * - Si l'utilisateur a plusieurs personnages, utilise celui marqué is_main = 1
 * - Sinon, utilise le premier personnage enregistré
 *
 * Flux d'exécution:
 * 1. Vérification des permissions (ManageNicknames requise)
 * 2. Récupération de tous les membres du serveur
 * 3. Récupération de tous les utilisateurs enregistrés en DB
 * 4. Filtrage des membres avec personnages enregistrés
 * 5. Traitement par batch avec progression affichée
 * 6. Rapport final avec statistiques détaillées
 */
export default class UpdateAllCommand extends BaseCommand {
    public name = 'updateall';
    public description = 'Met à jour les pseudonymes de tous les membres enregistrés sur le serveur';

    private albionService: AlbionService;
    private tracerService: TracerService;
    private readonly logger: LoggerService;

    private readonly BATCH_SIZE = 5;
    private readonly DELAY_BETWEEN_BATCHES_MS = 1000;

    /**
     * Crée une instance de la commande /updateall
     *
     * @remarks
     * Initialise les services nécessaires:
     * - LoggerService: Depuis ServiceContainer (partagé)
     * - AlbionService: Instance locale pour les appels API
     * - TracerService: Instance locale pour les opérations DB
     *
     * Configuration du batch processing:
     * - BATCH_SIZE = 5: Maximum 5 requêtes API simultanées
     * - DELAY_BETWEEN_BATCHES_MS = 1000: Pause de 1s entre chaque groupe
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
     * @returns SlashCommandBuilder configuré avec permissions administratives
     *
     * @remarks
     * Configuration:
     * - Aucune option requise
     * - Permission par défaut: ManageNicknames (Gérer les pseudonymes)
     * - Les utilisateurs sans cette permission ne voient pas la commande dans Discord
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames) as SlashCommandBuilder;
    }

    /**
     * Exécute la commande /updateall
     *
     * @param interaction - L'interaction Discord de la commande slash
     * @returns Promise qui se résout après mise à jour de tous les membres
     *
     * @remarks
     * Séquence d'exécution complète:
     *
     * **1. Vérifications préalables**
     * - Vérifie ManageNicknames permission (double-check côté serveur)
     * - Vérifie que la commande est lancée dans un serveur (pas en MP)
     *
     * **2. Récupération des données (Étapes 1-3)**
     * - Fetch tous les membres du serveur (peut prendre du temps pour les gros serveurs)
     * - Récupère tous les utilisateurs enregistrés en base de données
     * - Croise les données pour identifier les membres à mettre à jour
     * - Filtre les bots automatiquement
     * - Priorise les personnages "main" (is_main = 1)
     *
     * **3. Affichage progression initiale (Étape 4)**
     * - Embed bleu avec compteur 0/N
     * - Informe l'utilisateur de patienter
     *
     * **4. Traitement par batch (Étape 5)**
     * - Appelle processBatchUpdates() avec configuration:
     *   - 5 membres en parallèle max
     *   - 1 seconde de pause entre batches
     * - Met à jour l'embed de progression après chaque batch
     * - Collecte les statistiques (success, failures, skipped)
     *
     * **5. Rapport final (Étape 6)**
     * - Embed vert (si tout OK) ou orange (si échecs)
     * - Statistiques complètes
     * - Liste des 10 premiers échecs si applicable
     *
     * Gestion des erreurs:
     * - Erreurs individuelles: Capturées par Promise.allSettled dans processBatchUpdates()
     * - Erreur critique (catch global): Message d'erreur + log pour investigation
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

        // deferReply sans flag ephemeral : la progression sera visible dans le canal.
        // Cela permet de récupérer un vrai Message après le premier editReply et d'utiliser
        // message.edit() (token bot, sans limite 15 min) au lieu de interaction.editReply()
        // (token webhook, qui expire 15 minutes après la création de l'interaction).
        await interaction.deferReply();

        try {
            this.logger.info(`UpdateAll lancé par ${interaction.user.tag} sur ${interaction.guild.name}`);

            const members = await interaction.guild.members.fetch();
            this.logger.debug(`${members.size} membres trouvés sur le serveur`);

            const registeredUsers = await this.getAllRegisteredUsers();
            this.logger.debug(`${registeredUsers.length} utilisateurs enregistrés dans la base`);

            const membersToUpdate: { member: GuildMember; dbUser: TracerUser }[] = [];

            for (const [_, member] of members) {
                if (member.user.bot) continue;

                const userCharacters = registeredUsers.filter(u => u.discord_id === member.id);

                if (userCharacters.length > 0) {
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

            // Récupère l'objet Message réel après le premier editReply.
            // Les appels suivants passent par message.edit() (token bot) et non
            // interaction.editReply() (token webhook expirant à 15 min).
            const progressMessage = await interaction.fetchReply();

            const results = await this.processBatchUpdates(membersToUpdate, progressMessage);

            await this.displayFinalSummary(progressMessage, results);

            this.logger.success(`UpdateAll terminé : ${results.success} réussites, ${results.failures} échecs`);

        } catch (error) {
            this.logger.error('Erreur lors de l\'UpdateAll', 'tracer', error);
            await interaction.editReply({
                content: '❌ Une erreur critique est survenue lors de la mise à jour. Consultez les logs.',
            });
        }
    }


    /**
     * Récupère tous les utilisateurs enregistrés dans la base de données
     *
     * @returns Promise contenant tous les personnages enregistrés, triés par discord_id puis is_main
     *
     * @remarks
     * Requête SQL:
     * ```sql
     * SELECT * FROM tracer_users ORDER BY discord_id, is_main DESC
     * ```
     *
     * Tri:
     * - Les personnages sont groupés par discord_id
     * - Pour chaque utilisateur, les personnages "main" (is_main = 1) apparaissent en premier
     * - Facilite la sélection du personnage prioritaire dans execute()
     */
    private async getAllRegisteredUsers(): Promise<TracerUser[]> {
        const db = ServiceContainer.getInstance().database;
        return await db.select<TracerUser>('SELECT * FROM tracer_users ORDER BY discord_id, is_main DESC');
    }

    /**
     * Traite les mises à jour par batch pour éviter de surcharger l'API Albion
     *
     * @param membersToUpdate - Liste des membres à mettre à jour avec leurs personnages
     * @param progressMessage - L'interaction Discord pour mettre à jour la progression
     * @returns Promise avec statistiques détaillées (success, failures, skipped, details)
     *
     * @remarks
     * Stratégie de batch processing:
     *
     * **Configuration**:
     * - BATCH_SIZE = 5: Maximum 5 requêtes API Albion simultanées
     * - DELAY_BETWEEN_BATCHES_MS = 1000ms: Pause de 1 seconde entre chaque groupe
     *
     * **Traitement**:
     * 1. Divise la liste en groupes de 5 membres
     * 2. Traite chaque groupe avec Promise.allSettled (ne bloque pas si une échoue)
     * 3. Analyse les résultats:
     *    - fulfilled + value.success = true → successCount++
     *    - fulfilled + value.success = false → skippedCount++ (personnage 404)
     *    - rejected → failureCount++ + ajout dans failureDetails[]
     * 4. Met à jour l'embed de progression après chaque batch
     * 5. Pause de 1s avant le batch suivant (sauf dernier batch)
     *
     * **Gestion des erreurs**:
     * - Les erreurs individuelles n'arrêtent pas le traitement global
     * - Chaque erreur est capturée avec le nom du membre et le message d'erreur
     * - Les erreurs sont affichées dans le rapport final (max 10)
     *
     * **Raisons de "skipped"**:
     * - Personnage supprimé du jeu (404 sur l'API Albion)
     * - Personnage transféré à un autre serveur
     * - ID Albion invalide en base de données
     */
    private async processBatchUpdates(
        membersToUpdate: { member: GuildMember; dbUser: TracerUser }[],
        progressMessage: Message
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

            await progressMessage.edit({ embeds: [progressEmbed] });

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
     * Met à jour les informations d'un seul membre du serveur
     *
     * @param member - Le membre Discord à mettre à jour
     * @param dbUser - Le personnage Albion enregistré en base de données
     * @returns Promise avec { success: true } si réussi, { success: false, skipped: true } si personnage 404
     * @throws {Error} Si erreur lors de la mise à jour (API timeout, DB error, etc.)
     *
     * @remarks
     * Séquence de mise à jour (identique à UpdateCommand):
     *
     * 1. **Appel API Albion**
     *    - getPlayerDetailsById() avec l'albion_id du personnage
     *    - Retourne null si personnage 404 → success=false, skipped=true
     *
     * 2. **Mise à jour base de données**
     *    - updateUserFromApi() met à jour les champs:
     *      - albion_name, kill_fame, death_fame, guild_name, alliance_name, updated_at
     *
     * 3. **Mise à jour nickname Discord**
     *    - updateMemberNickname() change le pseudo du membre
     *    - Format: "Pseudo [TAG]" si guilde, "Pseudo" sinon
     *    - Silencieusement ignoré si permissions insuffisantes
     *
     * **Gestion des cas spéciaux**:
     * - Personnage 404: Log warning + retourne { success: false, skipped: true }
     * - Timeout API: Lève une erreur (capturée par Promise.allSettled dans processBatchUpdates)
     * - Rate limit (429): Lève une erreur (capturée par Promise.allSettled)
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
            this.logger.error(`Erreur lors de la mise à jour de ${member.user.tag}`, 'tracer', error);
            throw error;
        }
    }

    /**
     * Affiche l'embed de résumé final après traitement de tous les membres
     *
     * @param progressMessage - L'interaction Discord
     * @param results - Statistiques complètes du traitement
     * @returns Promise qui se résout après affichage de l'embed
     *
     * @remarks
     * Construit un embed récapitulatif avec:
     *
     * **Couleur dynamique**:
     * - Vert (#51CF66) si aucun échec
     * - Orange (#F39C12) si au moins un échec
     *
     * **Statistiques affichées**:
     * - Total de membres traités
     * - ✅ Réussies: Nombre de mises à jour réussies
     * - ⏭️ Ignorés: Personnages 404 (non trouvés sur l'API)
     * - ❌ Échecs: Erreurs lors du traitement (timeout, rate limit, etc.)
     *
     * **Détails des échecs** (champ optionnel):
     * - Affiche les 10 premiers échecs
     * - Format: "N. DiscordTag (AlbionName): Message d'erreur"
     * - Si plus de 10 échecs: "... et X autres" à la fin
     * - Le champ n'est pas affiché si aucun échec
     *
     * Cet embed remplace l'embed de progression affiché pendant le traitement.
     */
    private async displayFinalSummary(
        progressMessage: Message,
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

        await progressMessage.edit({ embeds: [summaryEmbed] });
    }

    /**
     * Crée un délai asynchrone pour espacer les batches de requêtes
     *
     * @param ms - Durée du délai en millisecondes
     * @returns Promise qui se résout après le délai spécifié
     *
     * @remarks
     * Utilisé entre chaque batch pour éviter le rate limiting de l'API Albion.
     * Implémentation standard avec setTimeout dans une Promise.
     *
     * @example
     * ```typescript
     * await this.delay(1000); // Pause de 1 seconde
     * ```
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

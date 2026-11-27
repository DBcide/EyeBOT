import { DatabaseService } from '../../../shared/services/DatabaseService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { AlbionPlayer, AlbionPlayerDetailed, TracerUser } from '../models/AlbionTypes';

/**
 * Service de gestion des personnages Albion Online liés aux comptes Discord
 *
 * @remarks
 * Gère le système de "claim" et de vérification des personnages:
 * - Un personnage peut être "claimed" par plusieurs utilisateurs Discord (non vérifié)
 * - Un personnage ne peut être "vérifié" que par UN SEUL utilisateur (verrouillage permanent)
 * - La vérification supprime automatiquement toutes les autres revendications
 * - Un utilisateur Discord peut avoir plusieurs personnages (alts)
 * - Un personnage peut être marqué comme "main" (prioritaire pour les logs)
 *
 * Table: tracer_users
 * Colonnes clés: discord_id, albion_id, is_verified, is_main
 */
export class TracerService {
    private readonly db: DatabaseService;
    private readonly logger: LoggerService;

    /**
     * Crée une instance du service Tracer
     *
     * @param db - Base de données à utiliser (injection pour les tests)
     * @param logger - Logger à utiliser (injection pour les tests)
     *
     * @remarks
     * Par défaut, utilise les services partagés du ServiceContainer. Ne jamais créer
     * un `new DatabaseService()` ici : chaque instance ouvrirait son propre pool MySQL
     * de 10 connexions (jamais fermé à l'arrêt).
     */
    constructor(db?: DatabaseService, logger?: LoggerService) {
        this.db = db ?? ServiceContainer.getInstance().database;
        this.logger = logger ?? ServiceContainer.getInstance().logger;
    }

    /**
     * Récupère tous les personnages enregistrés, triés par discord_id puis personnage "main" en premier
     *
     * @returns Tous les enregistrements de tracer_users
     * @throws {Error} Si la requête échoue
     */
    public async getAllUsers(): Promise<TracerUser[]> {
        return this.db.select<TracerUser>('SELECT * FROM tracer_users ORDER BY discord_id, is_main DESC');
    }

    /**
     * Vérifie si un utilisateur Discord a au moins un personnage enregistré
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @returns true si l'utilisateur a au moins un personnage, false sinon
     * @throws {Error} Si la requête en base de données échoue
     *
     * @example
     * ```typescript
     * const isRegistered = await tracerService.isUserRegistered('123456789');
     * if (isRegistered) {
     *     console.log('Utilisateur déjà enregistré');
     * }
     * ```
     */
    public async isUserRegistered(discordId: string): Promise<boolean> {
        const users = await this.db.select<TracerUser>(
            'SELECT * FROM tracer_users WHERE discord_id = ?',
            [discordId]
        );
        return users.length > 0;
    }

    /**
     * Récupère tous les personnages Albion enregistrés pour un utilisateur Discord
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @returns Tableau de personnages triés par date d'enregistrement (plus ancien en premier)
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Retourne un tableau vide si l'utilisateur n'a aucun personnage.
     * Inclut les personnages vérifiés ET non vérifiés.
     */
    public async getRegisteredUsers(discordId: string): Promise<TracerUser[]> {
        return await this.db.select<TracerUser>(
            'SELECT * FROM tracer_users WHERE discord_id = ? ORDER BY registered_at',
            [discordId]
        );
    }

    /**
     * Récupère un personnage spécifique par son ID Albion
     *
     * @param albionId - L'ID unique du personnage Albion
     * @returns Le personnage trouvé ou null si aucun enregistrement
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Retourne le PREMIER enregistrement trouvé (peut y avoir plusieurs claims).
     * Pour récupérer tous les claims, utilisez getAllClaimsForCharacter().
     */
    public async getRegisteredUserByAlbionId(albionId: string): Promise<TracerUser | null> {
        return await this.db.selectOne<TracerUser>(
            'SELECT * FROM tracer_users WHERE albion_id = ?',
            [albionId]
        );
    }

    /**
     * Vérifie si un personnage Albion est déjà revendiqué par un utilisateur Discord
     *
     * @param albionId - L'ID unique du personnage Albion
     * @returns L'ID Discord du propriétaire (vérifié ou non), ou null si non revendiqué
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Retourne le premier discord_id trouvé, même si plusieurs utilisateurs revendiquent le personnage.
     * Pour vérifier si le personnage est VÉRIFIÉ, utilisez isAlbionCharacterVerified().
     */
    public async isAlbionCharacterClaimed(albionId: string): Promise<string | null> {
        const user = await this.db.selectOne<TracerUser>(
            'SELECT discord_id FROM tracer_users WHERE albion_id = ?',
            [albionId]
        );
        return user ? user.discord_id : null;
    }

    /**
     * Vérifie si un personnage Albion a été vérifié par son propriétaire
     *
     * @param albionId - L'ID unique du personnage Albion
     * @returns true si le personnage est vérifié (is_verified = 1), false sinon
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Un personnage vérifié est verrouillé à un seul utilisateur Discord.
     * Les personnages vérifiés ne peuvent plus être revendiqués par d'autres.
     */
    public async isAlbionCharacterVerified(albionId: string): Promise<boolean> {
        const user = await this.db.selectOne<TracerUser>(
            'SELECT is_verified FROM tracer_users WHERE albion_id = ? AND is_verified = 1',
            [albionId]
        );
        return user ? user.is_verified === 1 : false;
    }

    /**
     * Vérifie si un personnage Albion est vérifié par un autre utilisateur Discord
     *
     * @param albionId - L'ID unique du personnage Albion
     * @param currentDiscordId - L'ID Discord de l'utilisateur actuel (à exclure de la recherche)
     * @returns L'ID Discord du propriétaire vérifié, ou null si non vérifié ou vérifié par currentDiscordId
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Utilisé avant l'enregistrement pour empêcher de revendiquer un personnage déjà vérifié.
     * Si cette méthode retourne un discord_id, l'enregistrement doit être refusé.
     *
     * @example
     * ```typescript
     * const verifiedOwner = await tracerService.isCharacterVerifiedByOther('albion123', 'discord456');
     * if (verifiedOwner) {
     *     throw new Error(`Ce personnage est déjà vérifié par <@${verifiedOwner}>`);
     * }
     * ```
     */
    public async isCharacterVerifiedByOther(albionId: string, currentDiscordId: string): Promise<string | null> {
        const user = await this.db.selectOne<TracerUser>(
            'SELECT discord_id FROM tracer_users WHERE albion_id = ? AND is_verified = 1 AND discord_id != ?',
            [albionId, currentDiscordId]
        );
        return user ? user.discord_id : null;
    }

    /**
     * Récupère l'enregistrement d'un utilisateur Discord pour un personnage Albion spécifique
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @param albionId - L'ID unique du personnage Albion
     * @returns L'enregistrement complet si trouvé, null sinon
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Utilisé pour vérifier si un utilisateur a déjà enregistré un personnage.
     * Permet de décider entre INSERT (nouveau) ou UPDATE (mise à jour).
     */
    public async getUserRegistrationForCharacter(discordId: string, albionId: string): Promise<TracerUser | null> {
        return await this.db.selectOne<TracerUser>(
            'SELECT * FROM tracer_users WHERE discord_id = ? AND albion_id = ?',
            [discordId, albionId]
        );
    }

    /**
     * Compte le nombre de revendications non vérifiées pour un personnage Albion
     *
     * @param albionId - L'ID unique du personnage Albion
     * @returns Le nombre de revendications avec is_verified = 0
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Un personnage peut avoir plusieurs revendications non vérifiées (multi-claim).
     * Quand un personnage est vérifié, toutes les autres revendications sont supprimées.
     */
    public async countUnverifiedClaims(albionId: string): Promise<number> {
        const result = await this.db.selectOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM tracer_users WHERE albion_id = ? AND is_verified = 0',
            [albionId]
        );
        return result?.count || 0;
    }

    /**
     * Enregistre ou met à jour un personnage Albion pour un utilisateur Discord
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @param albionPlayer - Les données du personnage depuis l'API Albion
     * @param setAsMain - Si true, marque ce personnage comme principal (is_main = 1)
     * @returns Objet contenant l'ID de l'enregistrement et si c'était un UPDATE (true) ou INSERT (false)
     * @throws {Error} Si le personnage est déjà vérifié par un autre utilisateur (format: 'CHARACTER_VERIFIED_BY_OTHER:discord_id')
     * @throws {Error} Si la requête en base de données échoue
     *
     * @remarks
     * Logique d'enregistrement:
     * 1. Vérifie si le personnage est vérifié par quelqu'un d'autre → ERREUR
     * 2. Vérifie si l'utilisateur a déjà ce personnage → UPDATE (met à jour les stats)
     * 3. Sinon → INSERT (nouvelle revendication, même si d'autres claims non vérifiés existent)
     *
     * Champs mis à jour:
     * - albion_name, kill_fame, death_fame, guild_name, alliance_name
     * - is_main (si setAsMain = true, sinon conserve la valeur existante)
     * - updated_at (timestamp automatique)
     *
     * @example
     * ```typescript
     * try {
     *     const result = await tracerService.registerUser(
     *         'discord123',
     *         albionPlayerData,
     *         true // Marquer comme personnage principal
     *     );
     *     if (result.isUpdate) {
     *         console.log('Personnage mis à jour');
     *     } else {
     *         console.log('Nouveau personnage enregistré');
     *     }
     * } catch (error) {
     *     if (error.message.startsWith('CHARACTER_VERIFIED_BY_OTHER:')) {
     *         const ownerId = error.message.split(':')[1];
     *         console.error(`Personnage déjà vérifié par ${ownerId}`);
     *     }
     * }
     * ```
     */
    public async registerUser(
        discordId: string,
        albionPlayer: AlbionPlayer,
        setAsMain: boolean = false
    ): Promise<{ id: number; isUpdate: boolean }> {
        // Vérifier si le personnage est vérifié par quelqu'un d'autre
        const verifiedOwner = await this.isCharacterVerifiedByOther(albionPlayer.Id, discordId);
        if (verifiedOwner) {
            throw new Error(`CHARACTER_VERIFIED_BY_OTHER:${verifiedOwner}`);
        }

        // Vérifier si l'utilisateur a déjà enregistré ce personnage
        const existingRegistration = await this.getUserRegistrationForCharacter(discordId, albionPlayer.Id);

        if (existingRegistration) {
            // UPDATE au lieu d'INSERT
            await this.db.execute(
                `UPDATE tracer_users
                SET albion_name = ?, kill_fame = ?, death_fame = ?,
                    guild_name = ?, alliance_name = ?, is_main = ?, updated_at = NOW()
                WHERE discord_id = ? AND albion_id = ?`,
                [
                    albionPlayer.Name,
                    albionPlayer.KillFame,
                    albionPlayer.DeathFame,
                    albionPlayer.GuildName || null,
                    albionPlayer.AllianceName || null,
                    setAsMain ? 1 : existingRegistration.is_main,
                    discordId,
                    albionPlayer.Id,
                ]
            );

            this.logger.success(`Personnage ${albionPlayer.Name} mis à jour pour l'utilisateur ${discordId}`, 'tracer');
            return { id: existingRegistration.id, isUpdate: true };
        }

        // INSERT nouveau personnage
        const insertId = await this.db.insert(
            `INSERT INTO tracer_users
            (discord_id, albion_id, albion_name, kill_fame, death_fame, guild_name, alliance_name, is_main)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                discordId,
                albionPlayer.Id,
                albionPlayer.Name,
                albionPlayer.KillFame,
                albionPlayer.DeathFame,
                albionPlayer.GuildName || null,
                albionPlayer.AllianceName || null,
                setAsMain ? 1 : 0,
            ]
        );

        this.logger.success(`Personnage ${albionPlayer.Name} enregistré pour l'utilisateur ${discordId}`, 'tracer');
        return { id: insertId, isUpdate: false };
    }

    /**
     * Met à jour les informations d'un personnage existant (depuis AlbionPlayer)
     *
     * @param albionId - L'ID unique du personnage Albion à mettre à jour
     * @param albionPlayer - Les nouvelles données du personnage depuis l'API Albion (format de recherche)
     * @returns Promise qui se résout quand la mise à jour est terminée
     * @throws {Error} Si la mise à jour échoue
     *
     * @remarks
     * Met à jour TOUS les enregistrements ayant cet albion_id (plusieurs utilisateurs peuvent revendiquer).
     * Champs mis à jour: albion_name, kill_fame, death_fame, guild_name, alliance_name, updated_at.
     * Préserve: discord_id, is_verified, is_main, registered_at.
     */
    public async updateUser(
        albionId: string,
        albionPlayer: AlbionPlayer
    ): Promise<void> {
        await this.db.execute(
            `UPDATE tracer_users
        SET albion_name = ?, kill_fame = ?, death_fame = ?,
        guild_name = ?, alliance_name = ?, updated_at = NOW()
        WHERE albion_id = ?`,
            [
                albionPlayer.Name,
                albionPlayer.KillFame,
                albionPlayer.DeathFame,
                albionPlayer.GuildName || null,
                albionPlayer.AllianceName || null,
                albionId,
            ]
        );

        this.logger.success(`Personnage ${albionPlayer.Name} mis à jour`, 'tracer');
    }

    /**
     * Met à jour les informations d'un personnage depuis l'API Albion (format détaillé)
     *
     * @param albionId - L'ID unique du personnage Albion à mettre à jour
     * @param playerDetails - Les nouvelles données du personnage depuis l'API Albion (format détaillé)
     * @returns Promise qui se résout quand la mise à jour est terminée
     * @throws {Error} Si la mise à jour échoue
     *
     * @remarks
     * Identique à updateUser() mais accepte AlbionPlayerDetailed au lieu de AlbionPlayer.
     * Met à jour tous les enregistrements ayant cet albion_id.
     * Utilisé par la commande /update pour rafraîchir les stats depuis l'API.
     */
    public async updateUserFromApi(
        albionId: string,
        playerDetails: AlbionPlayerDetailed
    ): Promise<void> {
        await this.db.execute(
            `UPDATE tracer_users
      SET albion_name = ?, kill_fame = ?, death_fame = ?,
          guild_name = ?, alliance_name = ?, updated_at = NOW()
      WHERE albion_id = ?`,
            [
                playerDetails.Name,
                playerDetails.KillFame,
                playerDetails.DeathFame,
                playerDetails.GuildName || null,
                playerDetails.AllianceName || null,
                albionId,
            ]
        );

        this.logger.success(`Personnage ${playerDetails.Name} mis à jour depuis l'API`, 'tracer');
    }

    /**
     * Compte le nombre total de personnages enregistrés pour un utilisateur Discord
     *
     * @param discordId - L'ID Discord de l'utilisateur
     * @returns Le nombre de personnages (vérifiés + non vérifiés)
     * @throws {Error} Si la requête échoue
     *
     * @remarks
     * Compte tous les personnages liés à cet utilisateur Discord.
     * Utile pour afficher "Vous avez X personnages enregistrés".
     */
    public async countUserCharacters(discordId: string): Promise<number> {
        const result = await this.db.selectOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM tracer_users WHERE discord_id = ?',
            [discordId]
        );
        return result?.count || 0;
    }

    /**
     * Vérifie un personnage Albion pour un utilisateur Discord et supprime les autres revendications
     *
     * @param discordId - L'ID Discord du propriétaire vérifié
     * @param albionId - L'ID unique du personnage Albion à vérifier
     * @returns Promise qui se résout quand la vérification est terminée
     * @throws {Error} Si la vérification échoue
     *
     * @remarks
     * Opération en 2 étapes exécutée dans une transaction (tout ou rien):
     * 1. DELETE toutes les revendications de ce personnage par d'autres utilisateurs
     * 2. UPDATE l'enregistrement de l'utilisateur actuel: is_verified = 1
     *
     * Après cette opération:
     * - Le personnage est verrouillé à cet utilisateur Discord
     * - Plus personne d'autre ne peut revendiquer ce personnage
     * - Les autres utilisateurs qui avaient revendiqué ce personnage perdent leur claim
     *
     * Utilisé par la commande /verify (réservée au propriétaire du bot).
     *
     * @example
     * ```typescript
     * // Récupérer toutes les revendications avant vérification
     * const claims = await tracerService.getAllClaimsForCharacter('albion123');
     * console.log(`${claims.length} revendications trouvées`);
     *
     * // Vérifier le personnage pour l'utilisateur discord456
     * await tracerService.verifyCharacter('discord456', 'albion123');
     *
     * // Les autres revendications ont été supprimées
     * const claimsAfter = await tracerService.getAllClaimsForCharacter('albion123');
     * console.log(`${claimsAfter.length} revendication(s) restante(s)`); // 1
     * ```
     */
    public async verifyCharacter(discordId: string, albionId: string): Promise<void> {
        // Transaction : si l'UPDATE échoue, les revendications supprimées sont restaurées
        const connection = await this.db.beginTransaction();
        try {
            await connection.execute(
                'DELETE FROM tracer_users WHERE albion_id = ? AND discord_id != ?',
                [albionId, discordId]
            );

            await connection.execute(
                'UPDATE tracer_users SET is_verified = 1, updated_at = NOW() WHERE albion_id = ? AND discord_id = ?',
                [albionId, discordId]
            );

            await this.db.commit(connection);
        } catch (error) {
            await this.db.rollback(connection);
            throw error;
        }

        this.logger.success(`Personnage ${albionId} vérifié pour l'utilisateur ${discordId}`, 'tracer');
    }

    /**
     * Récupère toutes les revendications d'un personnage Albion
     *
     * @param albionId - L'ID unique du personnage Albion
     * @returns Tableau de tous les enregistrements pour ce personnage, triés par date d'enregistrement
     * @throws {Error} Si la requête échoue
     *
     * @remarks
     * Utilisé pour identifier les multi-claims (plusieurs utilisateurs Discord revendiquent le même personnage).
     * Retourne un tableau vide si le personnage n'est revendiqué par personne.
     * Inclut les revendications vérifiées ET non vérifiées.
     *
     * Cas d'usage:
     * - Afficher tous les utilisateurs qui revendiquent un personnage
     * - Détecter les conflits avant vérification
     * - Notifier les utilisateurs dont le claim sera supprimé lors de la vérification
     */
    public async getAllClaimsForCharacter(albionId: string): Promise<TracerUser[]> {
        return await this.db.select<TracerUser>(
            'SELECT * FROM tracer_users WHERE albion_id = ? ORDER BY registered_at',
            [albionId]
        );
    }
}

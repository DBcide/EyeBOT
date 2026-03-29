import { DatabaseService } from '../../../shared/services/DatabaseService';
import { LoggerService } from '../../../shared/services/LoggerService';
import {AlbionPlayerDetailed, TracerUser} from '../models/AlbionTypes';
import { AlbionPlayer } from '../models/AlbionTypes';

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
    private db: DatabaseService;
    private logger: LoggerService;

    /**
     * Crée une instance du service Tracer
     *
     * @remarks
     * Initialise ses propres instances de DatabaseService et LoggerService.
     * Ces services ne sont PAS partagés avec ServiceContainer (isolation du feature).
     */
    constructor() {
        this.db = new DatabaseService();
        this.logger = new LoggerService();
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
        try {
            const users = await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
            return users.length > 0;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification de l\'enregistrement', 'tracer', error);
            throw error;
        }
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
        try {
            return await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ? ORDER BY registered_at',
                [discordId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des utilisateurs', 'tracer', error);
            throw error;
        }
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
        try {
            return await this.db.selectOne<TracerUser>(
                'SELECT * FROM tracer_users WHERE albion_id = ?',
                [albionId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération du personnage', 'tracer', error);
            throw error;
        }
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
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT discord_id FROM tracer_users WHERE albion_id = ?',
                [albionId]
            );
            return user ? user.discord_id : null;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage Albion', 'tracer', error);
            throw error;
        }
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
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT is_verified FROM tracer_users WHERE albion_id = ? AND is_verified = 1',
                [albionId]
            );
            return user ? user.is_verified === 1 : false;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du statut de vérification', 'tracer', error);
            throw error;
        }
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
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT discord_id FROM tracer_users WHERE albion_id = ? AND is_verified = 1 AND discord_id != ?',
                [albionId, currentDiscordId]
            );
            return user ? user.discord_id : null;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du propriétaire vérifié', 'tracer', error);
            throw error;
        }
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
        try {
            return await this.db.selectOne<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ? AND albion_id = ?',
                [discordId, albionId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération de l\'enregistrement utilisateur', 'tracer', error);
            throw error;
        }
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
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM tracer_users WHERE albion_id = ? AND is_verified = 0',
                [albionId]
            );
            return result?.count || 0;
        } catch (error) {
            this.logger.error('Erreur lors du comptage des revendications non vérifiées', 'tracer', error);
            throw error;
        }
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
        try {
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

                this.logger.success(`Personnage ${albionPlayer.Name} mis à jour pour l'utilisateur ${discordId}`);
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

            this.logger.success(`Personnage ${albionPlayer.Name} enregistré pour l'utilisateur ${discordId}`);
            return { id: insertId, isUpdate: false };
        } catch (error) {
            this.logger.error('Erreur lors de l\'enregistrement du personnage', 'tracer', error);
            throw error;
        }
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
        try {
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

            this.logger.success(`Personnage ${albionPlayer.Name} mis à jour`);
        } catch (error) {
            this.logger.error('Erreur lors de la mise à jour du personnage', 'tracer', error);
            throw error;
        }
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
        try {
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

            this.logger.success(`Personnage ${playerDetails.Name} mis à jour depuis l'API`);
        } catch (error) {
            this.logger.error('Erreur lors de la mise à jour du personnage', 'tracer', error);
            throw error;
        }
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
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
            return result?.count || 0;
        } catch (error) {
            this.logger.error('Erreur lors du comptage des personnages', 'tracer', error);
            throw error;
        }
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
     * Opération en 2 étapes (NON TRANSACTIONNELLE):
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
        try {
            await this.db.execute(
                'DELETE FROM tracer_users WHERE albion_id = ? AND discord_id != ?',
                [albionId, discordId]
            );

            await this.db.execute(
                'UPDATE tracer_users SET is_verified = 1, updated_at = NOW() WHERE albion_id = ? AND discord_id = ?',
                [albionId, discordId]
            );

            this.logger.success(`Personnage ${albionId} vérifié pour l'utilisateur ${discordId}`);
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage', 'tracer', error);
            throw error;
        }
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
        try {
            return await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users WHERE albion_id = ? ORDER BY registered_at',
                [albionId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des revendications', 'tracer', error);
            throw error;
        }
    }
}

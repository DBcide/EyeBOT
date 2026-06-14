import { DatabaseService } from '../../../shared/services/DatabaseService';
import { LoggerService } from '../../../shared/services/LoggerService';
import {AlbionPlayer, AlbionPlayerDetailed, TracerUser} from '../models/AlbionTypes';

/**
 * Service pour gérer l'enregistrement et le suivi des utilisateurs
 */
export class TracerService {
    private readonly db: DatabaseService;
    private readonly logger: LoggerService;

    constructor(db?: DatabaseService, logger?: LoggerService) {
        this.db = db ?? new DatabaseService();
        this.logger = logger ?? new LoggerService();
    }

    /**
     * Vérifie si un utilisateur Discord à au moins un personnage enregistré
     */
    public async isUserRegistered(discordId: string): Promise<boolean> {
        try {
            const users = await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
            return users.length > 0;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification de l\'enregistrement', error);
            throw error;
        }
    }

    /**
     * Récupère TOUS les personnages enregistrés pour un utilisateur Discord
     */
    public async getRegisteredUsers(discordId: string): Promise<TracerUser[]> {
        try {
            return await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ? ORDER BY registered_at',
                [discordId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des utilisateurs', error);
            throw error;
        }
    }

    /**
     * Récupère tous les utilisateurs enregistrés dans la base de données
     */
    public async getAllUsers(): Promise<TracerUser[]> {
        try {
            return await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users ORDER BY discord_id, is_main DESC'
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération de tous les utilisateurs', error);
            throw error;
        }
    }

    /**
     * Récupère UN personnage spécifique par son ID Albion
     */
    public async getRegisteredUserByAlbionId(albionId: string): Promise<TracerUser | null> {
        try {
            return await this.db.selectOne<TracerUser>(
                'SELECT * FROM tracer_users WHERE albion_id = ?',
                [albionId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération du personnage', error);
            throw error;
        }
    }

    /**
     * Vérifie si un personnage Albion est déjà lié à un compte Discord
     * Retourne le Discord ID du propriétaire, ou null si personne ne l'a
     */
    public async isAlbionCharacterClaimed(albionId: string): Promise<string | null> {
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT discord_id FROM tracer_users WHERE albion_id = ?',
                [albionId]
            );
            return user ? user.discord_id : null;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage Albion', error);
            throw error;
        }
    }

    /**
     * Vérifie si un personnage Albion est vérifié
     * Retourne true si le personnage est vérifié, false sinon
     */
    public async isAlbionCharacterVerified(albionId: string): Promise<boolean> {
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT is_verified FROM tracer_users WHERE albion_id = ? AND is_verified = 1',
                [albionId]
            );
            return user ? user.is_verified === 1 : false;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du statut de vérification', error);
            throw error;
        }
    }

    /**
     * Vérifie si un personnage Albion est vérifié par quelqu'un d'autre
     * Retourne le discord_id du propriétaire vérifié, ou null
     */
    public async isCharacterVerifiedByOther(albionId: string, currentDiscordId: string): Promise<string | null> {
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT discord_id FROM tracer_users WHERE albion_id = ? AND is_verified = 1 AND discord_id != ?',
                [albionId, currentDiscordId]
            );
            return user ? user.discord_id : null;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du propriétaire vérifié', error);
            throw error;
        }
    }

    /**
     * Récupère l'enregistrement d'un utilisateur pour un personnage spécifique
     * Retourne l'enregistrement si l'utilisateur a déjà ce personnage, null sinon
     */
    public async getUserRegistrationForCharacter(discordId: string, albionId: string): Promise<TracerUser | null> {
        try {
            return await this.db.selectOne<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ? AND albion_id = ?',
                [discordId, albionId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération de l\'enregistrement utilisateur', error);
            throw error;
        }
    }

    /**
     * Compte le nombre de revendications non vérifiées pour un personnage
     */
    public async countUnverifiedClaims(albionId: string): Promise<number> {
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM tracer_users WHERE albion_id = ? AND is_verified = 0',
                [albionId]
            );
            return result?.count || 0;
        } catch (error) {
            this.logger.error('Erreur lors du comptage des revendications non vérifiées', error);
            throw error;
        }
    }

    /**
     * Enregistre un nouveau personnage pour un utilisateur
     * - Si le personnage est vérifié par quelqu'un d'autre → erreur
     * - Si l'utilisateur a déjà ce personnage → UPDATE
     * - Sinon → INSERT (même si d'autres non vérifiés existent)
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
            this.logger.error('Erreur lors de l\'enregistrement du personnage', error);
            throw error;
        }
    }

    /**
     * Met à jour les informations d'un personnage existant
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
            this.logger.error('Erreur lors de la mise à jour du personnage', error);
            throw error;
        }
    }

    /**
     * Met à jour les informations d'un personnage depuis l'API Albion
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
            this.logger.error('Erreur lors de la mise à jour du personnage', error);
            throw error;
        }
    }

    /**
     * Compte le nombre de personnages enregistrés pour un utilisateur Discord
     */
    public async countUserCharacters(discordId: string): Promise<number> {
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
            return result?.count || 0;
        } catch (error) {
            this.logger.error('Erreur lors du comptage des personnages', error);
            throw error;
        }
    }

    /**
     * Vérifie un personnage Albion pour un utilisateur Discord spécifique
     * et supprime toutes les autres revendications du même personnage
     */
    public async verifyCharacter(discordId: string, albionId: string): Promise<void> {
        try {
            // Supprimer toutes les autres revendications de ce personnage
            await this.db.execute(
                'DELETE FROM tracer_users WHERE albion_id = ? AND discord_id != ?',
                [albionId, discordId]
            );

            // Marquer le personnage comme vérifié
            await this.db.execute(
                'UPDATE tracer_users SET is_verified = 1, updated_at = NOW() WHERE albion_id = ? AND discord_id = ?',
                [albionId, discordId]
            );

            this.logger.success(`Personnage ${albionId} vérifié pour l'utilisateur ${discordId}`);
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage', error);
            throw error;
        }
    }

    /**
     * Récupère toutes les revendications d'un personnage Albion (pour vérifier les doublons)
     */
    public async getAllClaimsForCharacter(albionId: string): Promise<TracerUser[]> {
        try {
            return await this.db.select<TracerUser>(
                'SELECT * FROM tracer_users WHERE albion_id = ? ORDER BY registered_at',
                [albionId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des revendications', error);
            throw error;
        }
    }
}

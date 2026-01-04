import { DatabaseService } from '../../../shared/services/DatabaseService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { TracerUser } from '../models/AlbionTypes';
import { AlbionPlayer } from '../models/AlbionTypes';

/**
 * Service pour gérer l'enregistrement et le suivi des utilisateurs
 */
export class TracerService {
    private db: DatabaseService;
    private logger: LoggerService;

    constructor() {
        this.db = new DatabaseService();
        this.logger = new LoggerService();
    }

    /**
     * Vérifie si un utilisateur Discord a au moins un personnage enregistré
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
                'SELECT * FROM tracer_users WHERE discord_id = ? ORDER BY registered_at ASC',
                [discordId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des utilisateurs', error);
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
     * Enregistre un nouveau personnage pour un utilisateur
     */
    public async registerUser(
        discordId: string,
        albionPlayer: AlbionPlayer,
        setAsMain: boolean = false
    ): Promise<number> {
        try {
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
            return insertId;
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
}

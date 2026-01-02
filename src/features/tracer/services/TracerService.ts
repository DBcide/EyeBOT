// src/features/tracer/services/TracerService.ts
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
     * Vérifie si un utilisateur Discord est déjà enregistré
     */
    public async isUserRegistered(discordId: string): Promise<boolean> {
        try {
            const user = await this.db.selectOne<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
            return user !== null;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification de l\'enregistrement', error);
            throw error;
        }
    }

    /**
     * Récupère les informations d'un utilisateur enregistré
     */
    public async getRegisteredUser(discordId: string): Promise<TracerUser | null> {
        try {
            return await this.db.selectOne<TracerUser>(
                'SELECT * FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération de l\'utilisateur', error);
            throw error;
        }
    }

    /**
     * Enregistre un nouvel utilisateur
     */
    public async registerUser(
        discordId: string,
        albionPlayer: AlbionPlayer
    ): Promise<number> {
        try {
            const insertId = await this.db.insert(
                `INSERT INTO tracer_users 
        (discord_id, albion_id, albion_name, kill_fame, death_fame, guild_name, alliance_name) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    discordId,
                    albionPlayer.Id,
                    albionPlayer.Name,
                    albionPlayer.KillFame,
                    albionPlayer.DeathFame,
                    albionPlayer.GuildName || null,
                    albionPlayer.AllianceName || null,
                ]
            );

            this.logger.success(`Utilisateur ${discordId} enregistré avec succès (Albion: ${albionPlayer.Name})`);
            return insertId;
        } catch (error) {
            this.logger.error('Erreur lors de l\'enregistrement de l\'utilisateur', error);
            throw error;
        }
    }

    /**
     * Met à jour les informations d'un utilisateur existant
     */
    public async updateUser(
        discordId: string,
        albionPlayer: AlbionPlayer
    ): Promise<void> {
        try {
            await this.db.execute(
                `UPDATE tracer_users 
        SET albion_id = ?, albion_name = ?, kill_fame = ?, death_fame = ?, 
            guild_name = ?, alliance_name = ?, updated_at = NOW()
        WHERE discord_id = ?`,
                [
                    albionPlayer.Id,
                    albionPlayer.Name,
                    albionPlayer.KillFame,
                    albionPlayer.DeathFame,
                    albionPlayer.GuildName || null,
                    albionPlayer.AllianceName || null,
                    discordId,
                ]
            );

            this.logger.success(`Utilisateur ${discordId} mis à jour (Albion: ${albionPlayer.Name})`);
        } catch (error) {
            this.logger.error('Erreur lors de la mise à jour de l\'utilisateur', error);
            throw error;
        }
    }
}
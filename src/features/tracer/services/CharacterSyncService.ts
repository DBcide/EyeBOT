import { Guild } from 'discord.js';
import { AlbionService } from './AlbionService';
import { TracerService } from './TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { AlbionPlayerDetailed } from '../models/AlbionTypes';
import { updateMemberNickname } from '../utils/DiscordUtils';

/**
 * Synchronise un personnage enregistré avec l'API Albion
 *
 * @remarks
 * Point unique de la séquence "rafraîchir un personnage", utilisée par
 * /update, /updateall et /register (quand le personnage est déjà lié) :
 * 1. Récupère les données à jour depuis l'API Albion
 * 2. Met à jour toutes les lignes tracer_users de ce personnage
 * 3. Renomme le membre sur le serveur courant (format `[TAG] Pseudo`)
 *
 * Aucune réponse Discord ici : c'est le rôle des commandes / handlers.
 */
export class CharacterSyncService {
    private readonly albionService = new AlbionService();
    private readonly tracerService = new TracerService();
    private readonly logger: LoggerService = ServiceContainer.getInstance().logger;

    /**
     * Rafraîchit un personnage et renomme son propriétaire sur le serveur
     *
     * @param guild - Serveur où renommer le membre (null en MP : renommage ignoré)
     * @param discordId - ID Discord du propriétaire
     * @param albionId - ID Albion du personnage
     * @returns Les données à jour, ou null si le personnage n'existe plus sur l'API (404)
     * @throws {Error} Erreur API (timeout, rate limit) ou base de données
     *
     * @remarks
     * Un échec de renommage (permissions, propriétaire du serveur) n'est pas une erreur :
     * updateMemberNickname() le logge et continue.
     */
    public async syncCharacter(
        guild: Guild | null,
        discordId: string,
        albionId: string
    ): Promise<AlbionPlayerDetailed | null> {
        const playerDetails = await this.albionService.getPlayerDetailsById(albionId);

        if (!playerDetails) {
            return null;
        }

        await this.tracerService.updateUserFromApi(albionId, playerDetails);

        await updateMemberNickname(guild, discordId, playerDetails.Name, playerDetails.GuildName, this.logger);

        return playerDetails;
    }
}

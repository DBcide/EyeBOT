import { AlbionSearchResponse, AlbionPlayer } from '../models/AlbionTypes';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Service pour interagir avec l'API d'Albion Online
 */
export class AlbionService {
    private readonly API_BASE_URL = 'https://gameinfo-ams.albiononline.com/api/gameinfo';
    private logger: LoggerService;

    constructor() {
        this.logger = new LoggerService();
    }

    /**
     * Recherche un joueur par pseudo sur Albion Online
     * @param playerName Pseudo du joueur
     * @returns Liste des joueurs trouvés
     */
    public async searchPlayer(playerName: string): Promise<AlbionPlayer[]> {
        try {
            const url = `${this.API_BASE_URL}/search?q=${encodeURIComponent(playerName)}`;
            this.logger.debug(`Recherche Albion API: ${playerName}`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`API Albion error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as AlbionSearchResponse; // ✅ Cast explicite

            this.logger.debug(`Résultats trouvés: ${data.players.length} joueur(s)`);

            return data.players;
        } catch (error) {
            this.logger.error('Erreur lors de la recherche Albion', error);
            throw error;
        }
    }

    /**
     * Récupère les informations d'un joueur spécifique par son ID
     * @param playerId ID du joueur Albion
     * @returns Informations du joueur ou null
     */
    public async getPlayerById(playerId: string): Promise<AlbionPlayer | null> {
        try {
            const url = `${this.API_BASE_URL}/players/${playerId}`;
            this.logger.debug(`Récupération joueur Albion: ${playerId}`);

            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`API Albion error: ${response.status} ${response.statusText}`);
            }

            const player = await response.json() as AlbionPlayer; // ✅ Cast explicite
            return player;
        } catch (error) {
            this.logger.error('Erreur lors de la récupération du joueur', error);
            throw error;
        }
    }

    /**
     * Formate le nombre de fame pour l'affichage (ex: 1234567 -> 1.23M)
     */
    public formatFame(fame: number): string {
        if (fame >= 1_000_000_000) {
            return `${(fame / 1_000_000_000).toFixed(2)}B`;
        } else if (fame >= 1_000_000) {
            return `${(fame / 1_000_000).toFixed(2)}M`;
        } else if (fame >= 1_000) {
            return `${(fame / 1_000).toFixed(2)}K`;
        }
        return fame.toString();
    }
}

import { AlbionSearchResponse, AlbionPlayer, AlbionPlayerDetailed } from '../models/AlbionTypes';
import { LoggerService } from '../../../shared/services/LoggerService';

/**
 * Service pour interagir avec l'API d'Albion Online
 */
export class AlbionService {
    private readonly API_BASE_URL = 'https://gameinfo-ams.albiononline.com/api/gameinfo';
    private readonly TIMEOUT_MS = 10000;
    private readonly logger: LoggerService;

    constructor() {
        this.logger = new LoggerService();
    }

    /**
     * Effectue une requête fetch avec timeout
     */
    private async fetchWithTimeout(url: string, timeoutMs: number = this.TIMEOUT_MS): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout: L\'API Albion met trop de temps à répondre');
            }
            throw error;
        }
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

            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Rate limit: Trop de requêtes à l\'API Albion. Réessayez dans quelques instants.');
                }
                throw new Error(`API Albion error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as AlbionSearchResponse;

            this.logger.debug(`Résultats trouvés: ${data.players.length} joueur(s)`);

            return data.players;
        } catch (error) {
            this.logger.error('Erreur lors de la recherche Albion', error);
            throw error;
        }
    }

    /**
     * Récupère les informations détaillées d'un joueur par son ID
     * @param playerId ID du joueur Albion
     * @returns Informations détaillées du joueur ou null
     */
    public async getPlayerDetailsById(playerId: string): Promise<AlbionPlayerDetailed | null> {
        try {
            const url = `${this.API_BASE_URL}/players/${playerId}`;
            this.logger.debug(`Récupération détails joueur Albion: ${playerId}`);

            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                if (response.status === 429) {
                    throw new Error('Rate limit: Trop de requêtes à l\'API Albion. Réessayez dans quelques instants.');
                }
                throw new Error(`API Albion error: ${response.status} ${response.statusText}`);
            }

            return await response.json() as AlbionPlayerDetailed;
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des détails du joueur', error);
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

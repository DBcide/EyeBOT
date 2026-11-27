import { AlbionSearchResponse, AlbionPlayer, AlbionPlayerDetailed } from '../models/AlbionTypes';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { formatFame } from '../utils/FameUtils';

/**
 * Service d'intégration avec l'API publique d'Albion Online
 *
 * @remarks
 * Fournit l'accès aux données publiques des joueurs Albion:
 * - Recherche de joueurs par pseudo (endpoint: /search)
 * - Détails d'un joueur par ID (endpoint: /players/{id})
 * - Formatage des valeurs de fame pour l'affichage
 *
 * Configuration:
 * - API Base URL: https://gameinfo-ams.albiononline.com/api/gameinfo
 * - Timeout: 10 secondes par défaut
 * - Rate limiting: Géré par l'API Albion (erreur 429 si dépassement)
 *
 * Gestion des erreurs:
 * - Timeout (10s): Lève une erreur "Request timeout"
 * - Rate limit (429): Lève une erreur "Rate limit"
 * - Not found (404): Retourne null pour getPlayerDetailsById()
 * - Autres erreurs HTTP: Lève une erreur avec status + statusText
 *
 * @see https://www.albiononline.com/api Albion Online API (non officielle)
 */
export class AlbionService {
    private readonly API_BASE_URL = 'https://gameinfo-ams.albiononline.com/api/gameinfo';
    private readonly TIMEOUT_MS = 10000;
    private readonly logger: LoggerService;

    /**
     * Crée une instance du service Albion API
     *
     * @remarks
     * Utilise le LoggerService partagé du ServiceContainer (logs également persistés en base).
     * Le service est stateless et peut être instancié plusieurs fois.
     */
    constructor(logger?: LoggerService) {
        this.logger = logger ?? ServiceContainer.getInstance().logger;
    }

    /**
     * Effectue une requête HTTP fetch avec timeout automatique
     *
     * @param url - L'URL complète de l'endpoint à appeler
     * @param timeoutMs - Durée maximale de la requête en millisecondes (défaut: 10000ms)
     * @returns Promise contenant la Response HTTP
     * @throws {Error} Si la requête dépasse le timeout (erreur "Request timeout")
     * @throws {Error} Si la requête échoue pour d'autres raisons (réseau, etc.)
     *
     * @remarks
     * Utilise AbortController pour annuler la requête si le timeout est dépassé.
     * Le timeout est nettoyé automatiquement après succès ou échec.
     * L'API Albion peut être lente, d'où le timeout de 10 secondes par défaut.
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
     * Recherche un ou plusieurs joueurs par pseudo sur Albion Online
     *
     * @param playerName - Le pseudo du joueur à rechercher (insensible à la casse)
     * @returns Tableau de joueurs correspondant à la recherche (peut être vide)
     * @throws {Error} Si rate limit dépassé (429)
     * @throws {Error} Si timeout (10s)
     * @throws {Error} Si autre erreur HTTP
     *
     * @remarks
     * L'API Albion retourne une liste de joueurs dont le pseudo correspond (recherche partielle).
     * Les résultats incluent:
     * - Id: Identifiant unique du joueur
     * - Name: Pseudo exact du joueur
     * - GuildName: Nom de la guilde (null si aucune)
     * - AllianceName: Nom de l'alliance (null si aucune)
     * - KillFame: Fame de kill total
     * - DeathFame: Fame de mort total
     *
     * Le pseudo est URL-encodé automatiquement pour gérer les caractères spéciaux.
     *
     * @example
     * ```typescript
     * const players = await albionService.searchPlayer('DBcide');
     * if (players.length === 0) {
     *     console.log('Aucun joueur trouvé');
     * } else {
     *     console.log(`${players.length} joueur(s) trouvé(s)`);
     *     players.forEach(p => console.log(`- ${p.Name} (${p.Id})`));
     * }
     * ```
     */
    public async searchPlayer(playerName: string): Promise<AlbionPlayer[]> {
        const url = `${this.API_BASE_URL}/search?q=${encodeURIComponent(playerName)}`;
        this.logger.debug(`Recherche Albion API: ${playerName}`, 'albion');

        const response = await this.fetchWithTimeout(url);

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Rate limit: Trop de requêtes à l\'API Albion. Réessayez dans quelques instants.');
            }
            throw new Error(`API Albion error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as AlbionSearchResponse;
        // L'API peut omettre la clé "players" : on évite un crash sur .length
        const players = data?.players ?? [];

        this.logger.debug(`Résultats trouvés: ${players.length} joueur(s)`, 'albion');

        return players;
    }

    /**
     * Récupère les informations détaillées d'un joueur Albion par son ID
     *
     * @param playerId - L'ID unique du joueur Albion
     * @returns Les informations détaillées du joueur ou null si joueur introuvable (404)
     * @throws {Error} Si rate limit dépassé (429)
     * @throws {Error} Si timeout (10s)
     * @throws {Error} Si autre erreur HTTP (sauf 404)
     *
     * @remarks
     * L'API Albion retourne des informations plus complètes que la recherche:
     * - Id: Identifiant unique du joueur
     * - Name: Pseudo exact du joueur
     * - GuildId: ID de la guilde (null si aucune)
     * - GuildName: Nom de la guilde (null si aucune)
     * - AllianceId: ID de l'alliance (null si aucune)
     * - AllianceName: Nom de l'alliance (null si aucune)
     * - AllianceTag: Tag de l'alliance (null si aucune)
     * - KillFame: Fame de kill total
     * - DeathFame: Fame de mort total
     * - FameRatio: Ratio kill/death fame
     * - LifetimeStatistics: Statistiques détaillées (PvP, PvE, crafting, etc.)
     *
     * Retourne null si le joueur n'existe pas (404), contrairement à searchPlayer qui retourne [].
     *
     * @example
     * ```typescript
     * const player = await albionService.getPlayerDetailsById('abc123');
     * if (!player) {
     *     console.log('Joueur introuvable');
     * } else {
     *     console.log(`${player.Name} - ${player.GuildName || 'Sans guilde'}`);
     *     console.log(`Kill Fame: ${player.KillFame}`);
     * }
     * ```
     */
    public async getPlayerDetailsById(playerId: string): Promise<AlbionPlayerDetailed | null> {
        const url = `${this.API_BASE_URL}/players/${encodeURIComponent(playerId)}`;
        this.logger.debug(`Récupération détails joueur Albion: ${playerId}`, 'albion');

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
    }

    /**
     * Formate une valeur de fame pour l'affichage lisible
     *
     * @param fame - La valeur de fame à formater (nombre entier)
     * @returns La valeur formatée avec unité (B, M, K) ou le nombre brut si < 1000
     *
     * @deprecated Utiliser directement {@link formatFame} de `utils/FameUtils`
     * (fonction pure, utilisable dans les builders d'embeds sans instance de service).
     */
    public formatFame(fame: number): string {
        return formatFame(fame);
    }
}

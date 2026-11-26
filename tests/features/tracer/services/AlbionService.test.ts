import { AlbionService } from '@/features/tracer/services/AlbionService';
import { LoggerService } from '@/shared/services/LoggerService';

// Helper : construit une Response mockée
function makeResponse(ok: boolean, status: number, body?: unknown) {
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        json: jest.fn().mockResolvedValue(body),
    };
}

// Helper : simule un AbortError (déclenché par fetchWithTimeout)
function makeAbortError(): Error {
    return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

describe('AlbionService', () => {
    let service: AlbionService;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            raw: jest.fn(),
        } as unknown as jest.Mocked<LoggerService>;

        service = new AlbionService(mockLogger);
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ─── constructeur ─────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('[positif] s\'initialise avec son propre LoggerService si aucun n\'est fourni', () => {
            expect(() => new AlbionService()).not.toThrow();
        });
    });

    // ─── formatFame() ─────────────────────────────────────────────────────────

    describe('formatFame()', () => {
        it('[positif] formate en milliards (>= 1 000 000 000)', () => {
            expect(service.formatFame(1_500_000_000)).toBe('1.50B');
        });

        it('[positif] formate en millions (>= 1 000 000)', () => {
            expect(service.formatFame(2_500_000)).toBe('2.50M');
        });

        it('[positif] formate en milliers (>= 1 000)', () => {
            expect(service.formatFame(1_500)).toBe('1.50K');
        });

        it('[positif] retourne la valeur brute pour les nombres < 1 000', () => {
            expect(service.formatFame(500)).toBe('500');
        });

        it('[extrême] retourne "0" pour une fame de 0', () => {
            expect(service.formatFame(0)).toBe('0');
        });

        it('[extrême] frontière exacte 1 000 → "1.00K"', () => {
            expect(service.formatFame(1_000)).toBe('1.00K');
        });

        it('[extrême] frontière exacte 1 000 000 → "1.00M"', () => {
            expect(service.formatFame(1_000_000)).toBe('1.00M');
        });

        it('[extrême] frontière exacte 1 000 000 000 → "1.00B"', () => {
            expect(service.formatFame(1_000_000_000)).toBe('1.00B');
        });
    });

    // ─── searchPlayer() ───────────────────────────────────────────────────────

    describe('searchPlayer()', () => {
        it('[positif] retourne la liste des joueurs trouvés', async () => {
            const players = [{ Id: 'abc', Name: 'DBcide' }, { Id: 'def', Name: 'Other' }];
            (global.fetch as jest.Mock).mockResolvedValue(
                makeResponse(true, 200, { players, guilds: [] })
            );

            const result = await service.searchPlayer('DBcide');

            expect(result).toEqual(players);
        });

        it('[positif] retourne un tableau vide si aucun joueur trouvé', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(
                makeResponse(true, 200, { players: [], guilds: [] })
            );

            const result = await service.searchPlayer('inconnu');

            expect(result).toEqual([]);
        });

        it('[positif] encode les caractères spéciaux dans l\'URL', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(
                makeResponse(true, 200, { players: [], guilds: [] })
            );

            await service.searchPlayer('My Player');

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('My%20Player'),
                expect.any(Object)
            );
        });

        it('[extrême] lance une erreur rate limit si la réponse a le status 429', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(makeResponse(false, 429));

            await expect(service.searchPlayer('DBcide')).rejects.toThrow('Rate limit');
        });

        it('[extrême] lance une erreur générique si la réponse n\'est pas ok (ex: 500)', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(makeResponse(false, 500));

            await expect(service.searchPlayer('DBcide')).rejects.toThrow('API Albion error: 500');
        });

        it('[extrême] lance une erreur timeout si fetch est annulé par AbortController', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(makeAbortError());

            await expect(service.searchPlayer('DBcide')).rejects.toThrow('Request timeout');
        });

        it('[extrême] propage l\'erreur telle quelle si fetch échoue pour une autre raison', async () => {
            const networkError = new Error('network failure');
            (global.fetch as jest.Mock).mockRejectedValue(networkError);

            await expect(service.searchPlayer('DBcide')).rejects.toThrow('network failure');
        });
    });

    // ─── getPlayerDetailsById() ───────────────────────────────────────────────

    describe('getPlayerDetailsById()', () => {
        it('[positif] retourne les détails du joueur si la requête réussit', async () => {
            const playerDetails = { Id: 'abc123', Name: 'DBcide', KillFame: 5000 };
            (global.fetch as jest.Mock).mockResolvedValue(
                makeResponse(true, 200, playerDetails)
            );

            const result = await service.getPlayerDetailsById('abc123');

            expect(result).toEqual(playerDetails);
        });

        it('[extrême] retourne null si le joueur n\'existe pas (status 404)', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(makeResponse(false, 404));

            const result = await service.getPlayerDetailsById('inexistant');

            expect(result).toBeNull();
        });

        it('[extrême] lance une erreur rate limit si la réponse a le status 429', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(makeResponse(false, 429));

            await expect(service.getPlayerDetailsById('abc123')).rejects.toThrow('Rate limit');
        });

        it('[extrême] lance une erreur générique si la réponse n\'est pas ok (ex: 503)', async () => {
            (global.fetch as jest.Mock).mockResolvedValue(makeResponse(false, 503));

            await expect(service.getPlayerDetailsById('abc123')).rejects.toThrow('API Albion error: 503');
        });

        it('[extrême] lance une erreur timeout si fetch est annulé par AbortController', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(makeAbortError());

            await expect(service.getPlayerDetailsById('abc123')).rejects.toThrow('Request timeout');
        });

        it('[extrême] propage l\'erreur telle quelle si fetch échoue pour une autre raison', async () => {
            const networkError = new Error('DNS lookup failed');
            (global.fetch as jest.Mock).mockRejectedValue(networkError);

            await expect(service.getPlayerDetailsById('abc123')).rejects.toThrow('DNS lookup failed');
        });
    });
});

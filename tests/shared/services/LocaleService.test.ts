import { LocaleService } from '@/shared/services/LocaleService';
import { DatabaseService } from '@/shared/services/DatabaseService';
import { LoggerService } from '@/shared/services/LoggerService';

describe('LocaleService', () => {
    let service: LocaleService;
    let mockDb: jest.Mocked<Pick<DatabaseService, 'selectOne' | 'execute'>>;
    let mockLogger: jest.Mocked<LoggerService>;

    // Interaction minimale : seuls l'utilisateur et la langue du client Discord comptent
    const interaction = (userId: string, locale: string) => ({ user: { id: userId }, locale });

    beforeEach(() => {
        // Le setup global simule getUserLocale : ici on teste la vraie implémentation
        jest.restoreAllMocks();

        mockDb = {
            selectOne: jest.fn().mockResolvedValue(null),
            execute: jest.fn().mockResolvedValue(1),
        };
        mockLogger = { warn: jest.fn() } as unknown as jest.Mocked<LoggerService>;

        service = new LocaleService(mockDb as unknown as DatabaseService, mockLogger);
    });

    // ─── resolveForInteraction() ──────────────────────────────────────────────

    describe('resolveForInteraction()', () => {
        it('[positif] utilise la langue choisie avec /language en priorité', async () => {
            mockDb.selectOne.mockResolvedValue({ locale: 'fr' });

            expect(await service.resolveForInteraction(interaction('u1', 'en-US'))).toBe('fr');
        });

        it('[positif] utilise la langue du client Discord si aucune préférence', async () => {
            expect(await service.resolveForInteraction(interaction('u1', 'en-GB'))).toBe('en');
        });

        it('[extrême] utilise la langue par défaut si la langue Discord n\'est pas supportée', async () => {
            expect(await service.resolveForInteraction(interaction('u1', 'ja'))).toBe('fr');
        });

        it('[extrême] ignore une valeur invalide en base', async () => {
            mockDb.selectOne.mockResolvedValue({ locale: 'xx' });

            expect(await service.resolveForInteraction(interaction('u1', 'en-US'))).toBe('en');
        });

        it('[extrême] répond quand même si la base est en erreur (warn + langue Discord)', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            expect(await service.resolveForInteraction(interaction('u1', 'en-US'))).toBe('en');
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('u1'), 'i18n', { error: 'DB down' });
        });
    });

    // ─── resolveForUser() ─────────────────────────────────────────────────────

    describe('resolveForUser()', () => {
        it('[positif] retourne la préférence enregistrée', async () => {
            mockDb.selectOne.mockResolvedValue({ locale: 'en' });

            expect(await service.resolveForUser('u1')).toBe('en');
        });

        it('[extrême] retourne la langue par défaut sans préférence (langue Discord inconnue hors interaction)', async () => {
            expect(await service.resolveForUser('u1')).toBe('fr');
        });
    });

    // ─── cache ────────────────────────────────────────────────────────────────

    describe('cache', () => {
        it('[positif] ne requête la base qu\'une fois par utilisateur', async () => {
            await service.getUserLocale('u1');
            await service.getUserLocale('u1');

            expect(mockDb.selectOne).toHaveBeenCalledTimes(1);
        });

        it('[extrême] ne met pas en cache une erreur de base (nouvel essai au prochain appel)', async () => {
            mockDb.selectOne.mockRejectedValueOnce(new Error('DB down')).mockResolvedValueOnce({ locale: 'en' });

            expect(await service.getUserLocale('u1')).toBeNull();
            expect(await service.getUserLocale('u1')).toBe('en');
        });
    });

    // ─── setUserLocale() ──────────────────────────────────────────────────────

    describe('setUserLocale()', () => {
        it('[positif] enregistre la langue (upsert) et met à jour le cache', async () => {
            await service.setUserLocale('u1', 'en');

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('ON DUPLICATE KEY UPDATE'),
                ['u1', 'en']
            );
            expect(await service.getUserLocale('u1')).toBe('en');
            expect(mockDb.selectOne).not.toHaveBeenCalled();
        });

        it('[positif] null supprime la préférence (retour au mode automatique)', async () => {
            await service.setUserLocale('u1', null);

            expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM user_preferences'), ['u1']);
            expect(await service.resolveForInteraction(interaction('u1', 'en-US'))).toBe('en');
        });

        it('[extrême] propage l\'erreur si l\'écriture échoue', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.setUserLocale('u1', 'en')).rejects.toThrow('DB down');
        });
    });
});

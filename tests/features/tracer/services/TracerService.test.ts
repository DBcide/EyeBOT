import { TracerService } from '@/features/tracer/services/TracerService';
import { DatabaseService } from '@/shared/services/DatabaseService';
import { LoggerService } from '@/shared/services/LoggerService';
import { AlbionPlayer, AlbionPlayerDetailed, TracerUser } from '@/features/tracer/models/AlbionTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockPlayer: AlbionPlayer = {
    Id: 'player-abc',
    Name: 'DBcide',
    GuildId: 'guild-xyz',
    GuildName: 'Sunfall',
    AllianceId: 'alliance-xyz',
    AllianceName: 'RIOT',
    Avatar: '',
    AvatarRing: '',
    KillFame: 10000,
    DeathFame: 5000,
    FameRatio: 2.0,
    totalKills: null,
    gvgKills: null,
    gvgWon: null,
};

const mockPlayerDetailed: AlbionPlayerDetailed = {
    Id: 'player-abc',
    Name: 'DBcide',
    GuildId: 'guild-xyz',
    GuildName: 'Sunfall',
    AllianceId: 'alliance-xyz',
    AllianceName: 'RIOT',
    AllianceTag: 'RIOT',
    Avatar: '',
    AvatarRing: '',
    KillFame: 12000,
    DeathFame: 6000,
    FameRatio: 2.0,
    AverageItemPower: 1200,
    Equipment: null,
    Inventory: [],
    LifetimeStatistics: {
        PvE: { Total: 0, Royal: 0, Outlands: 0, Avalon: 0, Hellgate: 0, CorruptedDungeon: 0, Mists: 0 },
        Gathering: null,
        Crafting: null,
        CrystalLeague: 0,
        FishingFame: 0,
        FarmingFame: 0,
        Timestamp: '',
    },
};

const mockTracerUser: TracerUser = {
    id: 1,
    discord_id: 'discord-123',
    albion_id: 'player-abc',
    albion_name: 'DBcide',
    kill_fame: 10000,
    death_fame: 5000,
    guild_name: 'Sunfall',
    alliance_name: 'RIOT',
    is_verified: 0,
    is_main: 0,
    registered_at: new Date(),
    updated_at: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TracerService', () => {
    let service: TracerService;
    let mockDb: jest.Mocked<Pick<DatabaseService, 'select' | 'selectOne' | 'insert' | 'execute'>>;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        mockDb = {
            select: jest.fn(),
            selectOne: jest.fn(),
            insert: jest.fn(),
            execute: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            raw: jest.fn(),
        } as unknown as jest.Mocked<LoggerService>;

        service = new TracerService(
            mockDb as unknown as DatabaseService,
            mockLogger
        );
    });

    // ─── constructeur ─────────────────────────────────────────────────────────

    describe('constructor', () => {
        it('[positif] s\'initialise avec ses propres instances par défaut si aucune dépendance n\'est fournie', () => {
            // DatabaseService crée un pool mysql sans ouvrir de connexion → pas de throw
            expect(() => new TracerService()).not.toThrow();
        });
    });

    // ─── isUserRegistered() ───────────────────────────────────────────────────

    describe('isUserRegistered()', () => {
        it('[positif] retourne true si db.select retourne au moins un personnage', async () => {
            mockDb.select.mockResolvedValue([mockTracerUser]);

            const result = await service.isUserRegistered('discord-123');

            expect(result).toBe(true);
        });

        it('[extrême] retourne false si db.select retourne un tableau vide', async () => {
            mockDb.select.mockResolvedValue([]);

            const result = await service.isUserRegistered('discord-999');

            expect(result).toBe(false);
        });

        it('[extrême] propage l\'erreur si db.select lance une exception', async () => {
            mockDb.select.mockRejectedValue(new Error('DB down'));

            await expect(service.isUserRegistered('discord-123')).rejects.toThrow('DB down');
        });
    });

    // ─── getRegisteredUsers() ─────────────────────────────────────────────────

    describe('getRegisteredUsers()', () => {
        it('[positif] retourne tous les personnages d\'un utilisateur', async () => {
            const users = [mockTracerUser, { ...mockTracerUser, id: 2, albion_name: 'Alt' }];
            mockDb.select.mockResolvedValue(users);

            const result = await service.getRegisteredUsers('discord-123');

            expect(result).toEqual(users);
        });

        it('[extrême] retourne un tableau vide si l\'utilisateur n\'a aucun personnage', async () => {
            mockDb.select.mockResolvedValue([]);

            const result = await service.getRegisteredUsers('discord-999');

            expect(result).toEqual([]);
        });

        it('[extrême] propage l\'erreur si db.select lance une exception', async () => {
            mockDb.select.mockRejectedValue(new Error('DB down'));

            await expect(service.getRegisteredUsers('discord-123')).rejects.toThrow('DB down');
        });
    });

    // ─── getRegisteredUserByAlbionId() ────────────────────────────────────────

    describe('getRegisteredUserByAlbionId()', () => {
        it('[positif] retourne le personnage si db.selectOne retourne un résultat', async () => {
            mockDb.selectOne.mockResolvedValue(mockTracerUser);

            const result = await service.getRegisteredUserByAlbionId('player-abc');

            expect(result).toEqual(mockTracerUser);
        });

        it('[extrême] retourne null si le personnage n\'existe pas en base', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.getRegisteredUserByAlbionId('player-inexistant');

            expect(result).toBeNull();
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(service.getRegisteredUserByAlbionId('player-abc')).rejects.toThrow('DB down');
        });
    });

    // ─── isAlbionCharacterClaimed() ───────────────────────────────────────────

    describe('isAlbionCharacterClaimed()', () => {
        it('[positif] retourne le discord_id si le personnage est revendiqué', async () => {
            mockDb.selectOne.mockResolvedValue({ discord_id: 'discord-123' });

            const result = await service.isAlbionCharacterClaimed('player-abc');

            expect(result).toBe('discord-123');
        });

        it('[extrême] retourne null si aucun utilisateur ne revendique le personnage', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.isAlbionCharacterClaimed('player-libre');

            expect(result).toBeNull();
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(service.isAlbionCharacterClaimed('player-abc')).rejects.toThrow('DB down');
        });
    });

    // ─── isAlbionCharacterVerified() ──────────────────────────────────────────

    describe('isAlbionCharacterVerified()', () => {
        it('[positif] retourne true si db.selectOne retourne un enregistrement avec is_verified = 1', async () => {
            mockDb.selectOne.mockResolvedValue({ is_verified: 1 });

            const result = await service.isAlbionCharacterVerified('player-abc');

            expect(result).toBe(true);
        });

        it('[extrême] retourne false si db.selectOne retourne null (aucun enregistrement vérifié)', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.isAlbionCharacterVerified('player-non-verifie');

            expect(result).toBe(false);
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(service.isAlbionCharacterVerified('player-abc')).rejects.toThrow('DB down');
        });
    });

    // ─── isCharacterVerifiedByOther() ─────────────────────────────────────────

    describe('isCharacterVerifiedByOther()', () => {
        it('[positif] retourne le discord_id si le personnage est vérifié par un autre utilisateur', async () => {
            mockDb.selectOne.mockResolvedValue({ discord_id: 'other-user' });

            const result = await service.isCharacterVerifiedByOther('player-abc', 'discord-123');

            expect(result).toBe('other-user');
        });

        it('[extrême] retourne null si le personnage n\'est pas vérifié par un autre utilisateur', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.isCharacterVerifiedByOther('player-abc', 'discord-123');

            expect(result).toBeNull();
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(
                service.isCharacterVerifiedByOther('player-abc', 'discord-123')
            ).rejects.toThrow('DB down');
        });
    });

    // ─── getUserRegistrationForCharacter() ────────────────────────────────────

    describe('getUserRegistrationForCharacter()', () => {
        it('[positif] retourne l\'enregistrement si l\'utilisateur possède ce personnage', async () => {
            mockDb.selectOne.mockResolvedValue(mockTracerUser);

            const result = await service.getUserRegistrationForCharacter('discord-123', 'player-abc');

            expect(result).toEqual(mockTracerUser);
        });

        it('[extrême] retourne null si l\'utilisateur ne possède pas ce personnage', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.getUserRegistrationForCharacter('discord-999', 'player-abc');

            expect(result).toBeNull();
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(
                service.getUserRegistrationForCharacter('discord-123', 'player-abc')
            ).rejects.toThrow('DB down');
        });
    });

    // ─── countUnverifiedClaims() ──────────────────────────────────────────────

    describe('countUnverifiedClaims()', () => {
        it('[positif] retourne le count si des revendications non vérifiées existent', async () => {
            mockDb.selectOne.mockResolvedValue({ count: 3 });

            const result = await service.countUnverifiedClaims('player-abc');

            expect(result).toBe(3);
        });

        it('[extrême] retourne 0 si db.selectOne retourne null', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.countUnverifiedClaims('player-abc');

            expect(result).toBe(0);
        });

        it('[extrême] retourne 0 si db.selectOne retourne { count: 0 } (valeur falsy)', async () => {
            mockDb.selectOne.mockResolvedValue({ count: 0 });

            const result = await service.countUnverifiedClaims('player-abc');

            expect(result).toBe(0);
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(service.countUnverifiedClaims('player-abc')).rejects.toThrow('DB down');
        });
    });

    // ─── registerUser() ───────────────────────────────────────────────────────

    describe('registerUser()', () => {
        it('[positif] effectue un INSERT et retourne { isUpdate: false } si le personnage n\'est pas encore enregistré', async () => {
            // selectOne #1 : isCharacterVerifiedByOther → null (pas de propriétaire vérifié)
            // selectOne #2 : getUserRegistrationForCharacter → null (pas d'enregistrement existant)
            mockDb.selectOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
            mockDb.insert.mockResolvedValue(42);

            const result = await service.registerUser('discord-123', mockPlayer);

            expect(mockDb.insert).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ id: 42, isUpdate: false });
        });

        it('[positif] effectue un UPDATE et retourne { isUpdate: true } si l\'utilisateur a déjà ce personnage', async () => {
            // selectOne #1 : isCharacterVerifiedByOther → null
            // selectOne #2 : getUserRegistrationForCharacter → enregistrement existant
            mockDb.selectOne.mockResolvedValueOnce(null).mockResolvedValueOnce(mockTracerUser);
            mockDb.execute.mockResolvedValue(1);

            const result = await service.registerUser('discord-123', mockPlayer);

            expect(mockDb.execute).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ id: mockTracerUser.id, isUpdate: true });
        });

        it('[positif] conserve is_main existant lors d\'un UPDATE si setAsMain est false', async () => {
            const existingWithMain = { ...mockTracerUser, is_main: 1 };
            mockDb.selectOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existingWithMain);
            mockDb.execute.mockResolvedValue(1);

            await service.registerUser('discord-123', mockPlayer, false);

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE tracer_users'),
                expect.arrayContaining([1]) // is_main = 1 conservé
            );
        });

        it('[positif] force is_main à 1 lors d\'un UPDATE si setAsMain est true', async () => {
            const existingWithNoMain = { ...mockTracerUser, is_main: 0 };
            mockDb.selectOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existingWithNoMain);
            mockDb.execute.mockResolvedValue(1);

            await service.registerUser('discord-123', mockPlayer, true);

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE tracer_users'),
                expect.arrayContaining([1]) // is_main forcé à 1
            );
        });

        it('[positif] passe is_main = 1 lors d\'un INSERT si setAsMain est true', async () => {
            mockDb.selectOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
            mockDb.insert.mockResolvedValue(99);

            await service.registerUser('discord-123', mockPlayer, true);

            expect(mockDb.insert).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([1]) // is_main forcé à 1
            );
        });

        it('[extrême] lance une erreur CHARACTER_VERIFIED_BY_OTHER si le personnage est vérifié par un autre', async () => {
            // selectOne #1 : isCharacterVerifiedByOther → retourne un autre propriétaire
            mockDb.selectOne.mockResolvedValueOnce({ discord_id: 'other-user' });

            await expect(
                service.registerUser('discord-123', mockPlayer)
            ).rejects.toThrow('CHARACTER_VERIFIED_BY_OTHER:other-user');
        });

        it('[extrême] propage l\'erreur si db.insert lance une exception', async () => {
            mockDb.selectOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
            mockDb.insert.mockRejectedValue(new Error('Duplicate entry'));

            await expect(
                service.registerUser('discord-123', mockPlayer)
            ).rejects.toThrow('Duplicate entry');
        });
    });

    // ─── updateUser() ─────────────────────────────────────────────────────────

    describe('updateUser()', () => {
        it('[positif] appelle db.execute avec les données du AlbionPlayer', async () => {
            mockDb.execute.mockResolvedValue(1);

            await service.updateUser('player-abc', mockPlayer);

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE tracer_users'),
                [mockPlayer.Name, mockPlayer.KillFame, mockPlayer.DeathFame, mockPlayer.GuildName, mockPlayer.AllianceName, 'player-abc']
            );
        });

        it('[extrême] convertit GuildName vide en null dans la requête', async () => {
            mockDb.execute.mockResolvedValue(1);
            const playerWithoutGuild = { ...mockPlayer, GuildName: '', AllianceName: '' };

            await service.updateUser('player-abc', playerWithoutGuild);

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([null, null])
            );
        });

        it('[extrême] propage l\'erreur si db.execute lance une exception', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.updateUser('player-abc', mockPlayer)).rejects.toThrow('DB down');
        });
    });

    // ─── updateUserFromApi() ──────────────────────────────────────────────────

    describe('updateUserFromApi()', () => {
        it('[positif] appelle db.execute avec les données du AlbionPlayerDetailed', async () => {
            mockDb.execute.mockResolvedValue(1);

            await service.updateUserFromApi('player-abc', mockPlayerDetailed);

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE tracer_users'),
                [mockPlayerDetailed.Name, mockPlayerDetailed.KillFame, mockPlayerDetailed.DeathFame, mockPlayerDetailed.GuildName, mockPlayerDetailed.AllianceName, 'player-abc']
            );
        });

        it('[extrême] propage l\'erreur si db.execute lance une exception', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.updateUserFromApi('player-abc', mockPlayerDetailed)).rejects.toThrow('DB down');
        });
    });

    // ─── countUserCharacters() ────────────────────────────────────────────────

    describe('countUserCharacters()', () => {
        it('[positif] retourne le nombre de personnages d\'un utilisateur', async () => {
            mockDb.selectOne.mockResolvedValue({ count: 3 });

            const result = await service.countUserCharacters('discord-123');

            expect(result).toBe(3);
        });

        it('[extrême] retourne 0 si db.selectOne retourne null', async () => {
            mockDb.selectOne.mockResolvedValue(null);

            const result = await service.countUserCharacters('discord-999');

            expect(result).toBe(0);
        });

        it('[extrême] retourne 0 si db.selectOne retourne { count: 0 } (valeur falsy)', async () => {
            mockDb.selectOne.mockResolvedValue({ count: 0 });

            const result = await service.countUserCharacters('discord-123');

            expect(result).toBe(0);
        });

        it('[extrême] propage l\'erreur si db.selectOne lance une exception', async () => {
            mockDb.selectOne.mockRejectedValue(new Error('DB down'));

            await expect(service.countUserCharacters('discord-123')).rejects.toThrow('DB down');
        });
    });

    // ─── verifyCharacter() ────────────────────────────────────────────────────

    describe('verifyCharacter()', () => {
        it('[positif] supprime d\'abord les autres revendications (DELETE)', async () => {
            mockDb.execute.mockResolvedValue(1);

            await service.verifyCharacter('discord-123', 'player-abc');

            expect(mockDb.execute).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('DELETE FROM tracer_users'),
                ['player-abc', 'discord-123']
            );
        });

        it('[positif] marque ensuite le personnage comme vérifié (UPDATE is_verified = 1)', async () => {
            mockDb.execute.mockResolvedValue(1);

            await service.verifyCharacter('discord-123', 'player-abc');

            expect(mockDb.execute).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('is_verified = 1'),
                ['player-abc', 'discord-123']
            );
        });

        it('[positif] appelle db.execute exactement deux fois dans le bon ordre', async () => {
            mockDb.execute.mockResolvedValue(1);

            await service.verifyCharacter('discord-123', 'player-abc');

            expect(mockDb.execute).toHaveBeenCalledTimes(2);
        });

        it('[extrême] propage l\'erreur si db.execute lance une exception', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.verifyCharacter('discord-123', 'player-abc')).rejects.toThrow('DB down');
        });
    });

    // ─── getAllClaimsForCharacter() ───────────────────────────────────────────

    describe('getAllClaimsForCharacter()', () => {
        it('[positif] retourne toutes les revendications pour un personnage', async () => {
            const claims = [
                mockTracerUser,
                { ...mockTracerUser, id: 2, discord_id: 'discord-456' },
            ];
            mockDb.select.mockResolvedValue(claims);

            const result = await service.getAllClaimsForCharacter('player-abc');

            expect(result).toEqual(claims);
        });

        it('[extrême] retourne un tableau vide si aucune revendication n\'existe', async () => {
            mockDb.select.mockResolvedValue([]);

            const result = await service.getAllClaimsForCharacter('player-sans-claims');

            expect(result).toEqual([]);
        });

        it('[extrême] propage l\'erreur si db.select lance une exception', async () => {
            mockDb.select.mockRejectedValue(new Error('DB down'));

            await expect(service.getAllClaimsForCharacter('player-abc')).rejects.toThrow('DB down');
        });
    });
});

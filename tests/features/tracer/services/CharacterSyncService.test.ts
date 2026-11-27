import { CharacterSyncService } from '@/features/tracer/services/CharacterSyncService';
import { AlbionService } from '@/features/tracer/services/AlbionService';
import { TracerService } from '@/features/tracer/services/TracerService';
import { LoggerService } from '@/shared/services/LoggerService';
import { ServiceContainer } from '@/shared/services/ServiceContainer';
import { AlbionPlayerDetailed } from '@/features/tracer/models/AlbionTypes';
import { Guild } from 'discord.js';

jest.mock('@/features/tracer/utils/DiscordUtils', () => ({
    updateMemberNickname: jest.fn().mockResolvedValue(true),
}));

import { updateMemberNickname } from '@/features/tracer/utils/DiscordUtils';
const mockUpdateNickname = updateMemberNickname as jest.Mock;

const details = { Id: 'player-abc', Name: 'DBcide', GuildName: 'Sunfall' } as AlbionPlayerDetailed;
const guild = { id: 'guild-001' } as Guild;

describe('CharacterSyncService', () => {
    let service: CharacterSyncService;
    let mockAlbion: jest.Mocked<Pick<AlbionService, 'getPlayerDetailsById'>>;
    let mockTracer: jest.Mocked<Pick<TracerService, 'updateUserFromApi'>>;
    let mockLogger: LoggerService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockAlbion = { getPlayerDetailsById: jest.fn().mockResolvedValue(details) };
        mockTracer = { updateUserFromApi: jest.fn().mockResolvedValue(undefined) };
        mockLogger = { warn: jest.fn(), debug: jest.fn() } as unknown as LoggerService;

        service = new CharacterSyncService(
            mockAlbion as unknown as AlbionService,
            mockTracer as unknown as TracerService,
            mockLogger
        );
    });

    it('[positif] API → base → renommage, et retourne les données à jour', async () => {
        const result = await service.syncCharacter(guild, 'user-1', 'player-abc');

        expect(result).toBe(details);
        expect(mockAlbion.getPlayerDetailsById).toHaveBeenCalledWith('player-abc');
        expect(mockTracer.updateUserFromApi).toHaveBeenCalledWith('player-abc', details);
        expect(mockUpdateNickname).toHaveBeenCalledWith(guild, 'user-1', 'DBcide', 'Sunfall', mockLogger);
    });

    it('[extrême] retourne null sans toucher à la base ni au pseudo si le personnage n\'existe plus (404)', async () => {
        mockAlbion.getPlayerDetailsById.mockResolvedValue(null);

        expect(await service.syncCharacter(guild, 'user-1', 'player-abc')).toBeNull();
        expect(mockTracer.updateUserFromApi).not.toHaveBeenCalled();
        expect(mockUpdateNickname).not.toHaveBeenCalled();
    });

    it('[extrême] propage une erreur API sans la loguer (loguée une seule fois par l\'appelant)', async () => {
        mockAlbion.getPlayerDetailsById.mockRejectedValue(new Error('Request timeout'));

        await expect(service.syncCharacter(guild, 'user-1', 'player-abc')).rejects.toThrow('Request timeout');
        expect(mockTracer.updateUserFromApi).not.toHaveBeenCalled();
    });

    it('[extrême] propage une erreur de base sans renommer le membre', async () => {
        mockTracer.updateUserFromApi.mockRejectedValue(new Error('DB down'));

        await expect(service.syncCharacter(guild, 'user-1', 'player-abc')).rejects.toThrow('DB down');
        expect(mockUpdateNickname).not.toHaveBeenCalled();
    });

    it('[positif] sans dépendance injectée, utilise les services partagés (un seul pool MySQL)', () => {
        const defaultService = new CharacterSyncService() as any;
        const container = ServiceContainer.getInstance();

        expect(defaultService.logger).toBe(container.logger);
        expect(defaultService.tracerService.db).toBe(container.database);
    });
});

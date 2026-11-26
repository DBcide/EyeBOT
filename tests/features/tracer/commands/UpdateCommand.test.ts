import UpdateCommand from '@/features/tracer/commands/UpdateCommand';
import { AlbionService } from '@/features/tracer/services/AlbionService';
import { TracerService } from '@/features/tracer/services/TracerService';
import { LoggerService } from '@/shared/services/LoggerService';
import { TracerUser, AlbionPlayerDetailed } from '@/features/tracer/models/AlbionTypes';
import { ComponentType } from 'discord.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-discord-123';

const mockCharacter: TracerUser = {
    id: 1,
    discord_id: USER_ID,
    albion_id: 'player-abc',
    albion_name: 'DBcide',
    kill_fame: 1_500_000,
    death_fame: 500_000,
    guild_name: 'Sunfall',
    alliance_name: 'RIOT',
    is_verified: 1,
    is_main: 1,
    registered_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
};

const mockCharacter2: TracerUser = {
    ...mockCharacter,
    id: 2,
    albion_id: 'player-xyz',
    albion_name: 'AltDBcide',
    kill_fame: 250_000,
    guild_name: null,
    alliance_name: null,
    is_verified: 0,
    is_main: 0,
};

const mockPlayerDetails: AlbionPlayerDetailed = {
    Name: 'DBcide',
    Id: 'player-abc',
    GuildName: 'Sunfall',
    GuildId: 'guild-001',
    AllianceName: 'RIOT',
    AllianceId: 'alliance-001',
    AllianceTag: 'RIOT',
    Avatar: '',
    AvatarRing: '',
    DeathFame: 500_000,
    KillFame: 1_600_000,
    FameRatio: 3.2,
    LifetimeStatistics: {
        PvE: { Total: 0, Royal: 0, Outlands: 0, Avalon: 0, Hellgate: 0, CorruptedDungeon: 0, Mists: 0 },
        Gathering: {},
        Crafting: {},
        CrystalLeague: 0,
        FishingFame: 0,
        FarmingFame: 0,
        Timestamp: '2026-01-01T00:00:00.000Z',
    },
    AverageItemPower: 0,
    Equipment: {},
    Inventory: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCollector() {
    const handlers: Record<string, Function[]> = {};
    return {
        on: jest.fn((event: string, handler: Function) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
        }),
        emit: (event: string, ...args: any[]) => {
            (handlers[event] ?? []).forEach((h) => h(...args));
        },
    };
}

function createMockInteraction(userId = USER_ID) {
    const collector = makeCollector();
    const mockResponse = {
        createMessageComponentCollector: jest.fn().mockReturnValue(collector),
        _collector: collector,
    };

    return {
        user: { id: userId, tag: 'DBcide#0001' },
        guild: { id: 'guild-001', members: { cache: new Map() } },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(mockResponse),
        _mockResponse: mockResponse,
        _collector: collector,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UpdateCommand', () => {
    let command: UpdateCommand;
    let mockAlbionService: jest.Mocked<Pick<AlbionService, 'getPlayerDetailsById' | 'formatFame'>>;
    let mockTracerService: jest.Mocked<Pick<TracerService, 'getRegisteredUsers' | 'updateUserFromApi'>>;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        mockAlbionService = {
            getPlayerDetailsById: jest.fn(),
            formatFame: jest.fn().mockImplementation((fame: number) => `${fame}`),
        };

        mockTracerService = {
            getRegisteredUsers: jest.fn(),
            updateUserFromApi: jest.fn().mockResolvedValue(undefined),
        };

        mockLogger = {
            info: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            raw: jest.fn(),
        } as unknown as jest.Mocked<LoggerService>;

        command = new UpdateCommand(
            mockAlbionService as unknown as AlbionService,
            mockTracerService as unknown as TracerService,
            mockLogger
        );
    });

    // ─── buildCommand() ───────────────────────────────────────────────────────

    describe('buildCommand()', () => {
        it('[positif] retourne un builder avec le nom "update" et aucune option', () => {
            const json = command.buildCommand().toJSON();

            expect(json.name).toBe('update');
            expect(json.options ?? []).toHaveLength(0);
        });
    });

    // ─── Cas 1 : aucun personnage ─────────────────────────────────────────────

    describe('cas 0 personnage', () => {
        it('[extrême] editReply avec hint /register si aucun personnage enregistré', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([]);

            await command.execute(interaction as any);

            expect(interaction.deferReply).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('/register'),
            }));
        });
    });

    // ─── Cas 2 : un seul personnage ───────────────────────────────────────────

    describe('cas 1 personnage', () => {
        it('[positif] appelle updateCharacter directement (succès API)', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(mockPlayerDetails);

            await command.execute(interaction as any);

            expect(mockAlbionService.getPlayerDetailsById).toHaveBeenCalledWith('player-abc');
            expect(mockTracerService.updateUserFromApi).toHaveBeenCalledWith('player-abc', mockPlayerDetails);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
            }));
        });

        it('[extrême] editReply erreur si l\'API Albion retourne null', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(null);

            await command.execute(interaction as any);

            expect(mockTracerService.updateUserFromApi).not.toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('DBcide'),
            }));
        });

        it('[extrême] editReply message d\'erreur si l\'API Albion lance une exception', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockAlbionService.getPlayerDetailsById.mockRejectedValue(new Error('API down'));

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.any(String),
            }));
        });

        it('[extrême] editReply erreur générique si tracerService.getRegisteredUsers lance une exception', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockRejectedValue(new Error('DB down'));

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('erreur'),
            }));
        });
    });

    // ─── Cas 3 : plusieurs personnages → menu de sélection ───────────────────

    describe('cas multiple personnages', () => {
        it('[positif] editReply avec un embed + menu de sélection', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, mockCharacter2]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                components: expect.any(Array),
            }));
            expect(interaction._mockResponse.createMessageComponentCollector).toHaveBeenCalledWith(
                expect.objectContaining({ componentType: ComponentType.StringSelect, time: 60_000 })
            );
        });

        it('[positif] collector.collect → met à jour le personnage sélectionné', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, mockCharacter2]);
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(mockPlayerDetails);

            await command.execute(interaction as any);

            const selectInteraction = {
                user: { id: USER_ID },
                values: ['player-abc'],
                deferUpdate: jest.fn().mockResolvedValue(undefined),
                reply: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            };

            await interaction._collector.emit('collect', selectInteraction);

            expect(selectInteraction.deferUpdate).toHaveBeenCalledTimes(1);
            expect(mockAlbionService.getPlayerDetailsById).toHaveBeenCalledWith('player-abc');
        });

        it('[extrême] collector.collect avec mauvais utilisateur → reply éphémère d\'erreur', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, mockCharacter2]);

            await command.execute(interaction as any);

            const selectInteraction = {
                user: { id: 'autre-user-999' },
                values: ['player-abc'],
                deferUpdate: jest.fn().mockResolvedValue(undefined),
                reply: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            };

            await interaction._collector.emit('collect', selectInteraction);

            expect(selectInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                ephemeral: true,
            }));
            expect(selectInteraction.deferUpdate).not.toHaveBeenCalled();
            expect(mockAlbionService.getPlayerDetailsById).not.toHaveBeenCalled();
        });

        it('[extrême] collector.collect avec personnage introuvable → update avec message d\'erreur', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, mockCharacter2]);

            await command.execute(interaction as any);

            const selectInteraction = {
                user: { id: USER_ID },
                values: ['id-inexistant'],
                deferUpdate: jest.fn().mockResolvedValue(undefined),
                reply: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
            };

            await interaction._collector.emit('collect', selectInteraction);

            expect(selectInteraction.update).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('introuvable'),
                embeds: [],
                components: [],
            }));
            expect(selectInteraction.deferUpdate).not.toHaveBeenCalled();
        });

        it('[extrême] collector.end sans collecte → editReply message de timeout', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, mockCharacter2]);

            await command.execute(interaction as any);

            // collected.size === 0 → timeout
            const collected = { size: 0 };
            await interaction._collector.emit('end', collected);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Temps écoulé'),
                embeds: [],
                components: [],
            }));
        });

        it('[positif] collector.end avec collecte → n\'envoie pas de message de timeout', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, mockCharacter2]);
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(mockPlayerDetails);

            await command.execute(interaction as any);

            // Reset editReply call count after initial menu display
            (interaction.editReply as jest.Mock).mockClear();

            const collected = { size: 1 };
            await interaction._collector.emit('end', collected);

            // editReply ne doit pas avoir été appelé avec un message de timeout
            expect(interaction.editReply).not.toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Temps écoulé'),
            }));
        });
    });
});

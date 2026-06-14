import UpdateAllCommand from '@/features/tracer/commands/UpdateAllCommand';
import { AlbionService } from '@/features/tracer/services/AlbionService';
import { TracerService } from '@/features/tracer/services/TracerService';
import { LoggerService } from '@/shared/services/LoggerService';
import { TracerUser, AlbionPlayerDetailed } from '@/features/tracer/models/AlbionTypes';
import { PermissionFlagsBits, MessageFlagsBitField } from 'discord.js';

// ─── Mock updateMemberNickname ─────────────────────────────────────────────────

jest.mock('@/features/tracer/utils/DiscordUtils', () => ({
    updateMemberNickname: jest.fn().mockResolvedValue(true),
}));

import { updateMemberNickname } from '@/features/tracer/utils/DiscordUtils';
const mockUpdateMemberNickname = updateMemberNickname as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeTracerUser = (overrides: Partial<TracerUser> = {}): TracerUser => ({
    id: 1,
    discord_id: 'user-111',
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
    ...overrides,
});

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

function makeMember(userId: string, tag: string, isBot = false) {
    return {
        id: userId,
        user: { id: userId, tag, bot: isBot },
        guild: { id: 'guild-001', members: { cache: new Map() } },
    };
}

function createMockInteraction({
    hasPermission = true,
    hasGuild = true,
    members = new Map<string, any>(),
} = {}) {
    return {
        user: { id: 'admin-001', tag: 'Admin#0001' },
        guild: hasGuild
            ? {
                  id: 'guild-001',
                  name: 'TestGuild',
                  members: { fetch: jest.fn().mockResolvedValue(members) },
              }
            : null,
        memberPermissions: {
            has: jest.fn().mockReturnValue(hasPermission),
        },
        reply: jest.fn().mockResolvedValue(undefined),
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UpdateAllCommand', () => {
    let command: UpdateAllCommand;
    let mockAlbionService: jest.Mocked<Pick<AlbionService, 'getPlayerDetailsById'>>;
    let mockTracerService: jest.Mocked<Pick<TracerService, 'getAllUsers' | 'updateUserFromApi'>>;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockAlbionService = {
            getPlayerDetailsById: jest.fn().mockResolvedValue(mockPlayerDetails),
        };

        mockTracerService = {
            getAllUsers: jest.fn().mockResolvedValue([]),
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

        command = new UpdateAllCommand(
            mockAlbionService as unknown as AlbionService,
            mockTracerService as unknown as TracerService,
            mockLogger
        );
    });

    // ─── buildCommand() ───────────────────────────────────────────────────────

    describe('buildCommand()', () => {
        it('[positif] retourne un builder avec le nom "updateall"', () => {
            const json = command.buildCommand().toJSON();

            expect(json.name).toBe('updateall');
            expect(json.default_member_permissions).toBeDefined();
        });
    });

    // ─── Gardes de permission ─────────────────────────────────────────────────

    describe('gardes', () => {
        it('[extrême] reply éphémère si l\'utilisateur n\'a pas ManageNicknames', async () => {
            const interaction = createMockInteraction({ hasPermission: false });

            await command.execute(interaction as any);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('permission'),
                flags: MessageFlagsBitField.Flags.Ephemeral,
            }));
            expect(interaction.deferReply).not.toHaveBeenCalled();
        });

        it('[extrême] reply éphémère si la commande est utilisée hors d\'un serveur', async () => {
            const interaction = createMockInteraction({ hasGuild: false });

            await command.execute(interaction as any);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('serveur'),
                flags: MessageFlagsBitField.Flags.Ephemeral,
            }));
            expect(interaction.deferReply).not.toHaveBeenCalled();
        });
    });

    // ─── Aucun membre éligible ────────────────────────────────────────────────

    describe('aucun membre éligible', () => {
        it('[extrême] editReply si aucun membre du serveur n\'a de compte enregistré', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            // La DB ne contient aucun utilisateur enregistré
            mockTracerService.getAllUsers.mockResolvedValue([]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Aucun membre'),
            }));
            expect(mockAlbionService.getPlayerDetailsById).not.toHaveBeenCalled();
        });

        it('[extrême] ignore les bots lors du filtrage des membres', async () => {
            const botMember = makeMember('bot-001', 'TestBot#0000', true);
            const members = new Map([['bot-001', botMember]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue([
                makeTracerUser({ discord_id: 'bot-001' }),
            ]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Aucun membre'),
            }));
        });
    });

    // ─── Sélection du personnage principal ────────────────────────────────────

    describe('sélection du personnage principal', () => {
        it('[positif] utilise le personnage is_main=1 si plusieurs personnages pour un même utilisateur', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            const mainChar = makeTracerUser({ albion_id: 'player-main', albion_name: 'DBcide', is_main: 1 });
            const altChar = makeTracerUser({ id: 2, albion_id: 'player-alt', albion_name: 'AltDBcide', is_main: 0 });
            mockTracerService.getAllUsers.mockResolvedValue([mainChar, altChar]);

            await command.execute(interaction as any);

            expect(mockAlbionService.getPlayerDetailsById).toHaveBeenCalledWith('player-main');
            expect(mockAlbionService.getPlayerDetailsById).not.toHaveBeenCalledWith('player-alt');
        });

        it('[extrême] utilise le premier personnage si aucun n\'est is_main=1', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            const char1 = makeTracerUser({ albion_id: 'player-first', albion_name: 'First', is_main: 0 });
            const char2 = makeTracerUser({ id: 2, albion_id: 'player-second', albion_name: 'Second', is_main: 0 });
            mockTracerService.getAllUsers.mockResolvedValue([char1, char2]);

            await command.execute(interaction as any);

            expect(mockAlbionService.getPlayerDetailsById).toHaveBeenCalledWith('player-first');
        });
    });

    // ─── Traitement des mises à jour ──────────────────────────────────────────

    describe('traitement des mises à jour', () => {
        it('[positif] appelle updateUserFromApi et updateMemberNickname pour chaque membre', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue([makeTracerUser()]);

            await command.execute(interaction as any);

            expect(mockTracerService.updateUserFromApi).toHaveBeenCalledWith('player-abc', mockPlayerDetails);
            expect(mockUpdateMemberNickname).toHaveBeenCalledTimes(1);
        });

        it('[extrême] compte le membre comme "ignoré" si l\'API retourne null', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue([makeTracerUser()]);
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(null);

            await command.execute(interaction as any);

            expect(mockTracerService.updateUserFromApi).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('DBcide'));

            // Le résumé final doit mentionner 1 ignoré
            const calls = (interaction.editReply as jest.Mock).mock.calls;
            const lastCall = calls[calls.length - 1][0];
            expect(lastCall.embeds[0].data.description).toContain('1');
        });

        it('[extrême] compte le membre comme "échec" si l\'API lance une exception', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue([makeTracerUser()]);
            mockAlbionService.getPlayerDetailsById.mockRejectedValue(new Error('timeout'));

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);

            // Le résumé final doit avoir un champ "Détails des échecs"
            const calls = (interaction.editReply as jest.Mock).mock.calls;
            const lastCall = calls[calls.length - 1][0];
            const fields = lastCall.embeds[0].data.fields;
            expect(fields).toBeDefined();
            expect(fields[0].name).toContain('Détails des échecs');
        });
    });

    // ─── Résumé final ─────────────────────────────────────────────────────────

    describe('résumé final', () => {
        it('[positif] editReply embed vert (succès) quand aucun échec', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue([makeTracerUser()]);

            await command.execute(interaction as any);

            const calls = (interaction.editReply as jest.Mock).mock.calls;
            const lastCall = calls[calls.length - 1][0];
            expect(lastCall.embeds[0].data.color).toBe(0x51CF66);
        });

        it('[extrême] editReply embed orange (avertissement) quand il y a des échecs', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue([makeTracerUser()]);
            mockAlbionService.getPlayerDetailsById.mockRejectedValue(new Error('fail'));

            await command.execute(interaction as any);

            const calls = (interaction.editReply as jest.Mock).mock.calls;
            const lastCall = calls[calls.length - 1][0];
            expect(lastCall.embeds[0].data.color).toBe(0xF39C12);
        });

        it('[extrême] tronque les détails d\'échecs à 10 si plus de 10 échecs', async () => {
            // Créer 12 membres avec échec API
            const members = new Map<string, any>();
            const users: TracerUser[] = [];
            for (let i = 0; i < 12; i++) {
                const id = `user-${i}`;
                members.set(id, makeMember(id, `User${i}#000${i}`));
                users.push(makeTracerUser({ id: i + 1, discord_id: id, albion_id: `player-${i}`, albion_name: `Char${i}` }));
            }
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockResolvedValue(users);
            mockAlbionService.getPlayerDetailsById.mockRejectedValue(new Error('fail'));

            await command.execute(interaction as any);

            const calls = (interaction.editReply as jest.Mock).mock.calls;
            const lastCall = calls[calls.length - 1][0];
            const errorField = lastCall.embeds[0].data.fields[0];
            // Les détails doivent mentionner "et X autres"
            expect(errorField.value).toContain('autres');
        });
    });

    // ─── Gestion d'erreur globale ─────────────────────────────────────────────

    describe('gestion d\'erreur globale', () => {
        it('[extrême] editReply message critique si getAllUsers lance une exception', async () => {
            const member = makeMember('user-111', 'DBcide#0001');
            const members = new Map([['user-111', member]]);
            const interaction = createMockInteraction({ members });

            mockTracerService.getAllUsers.mockRejectedValue(new Error('DB down'));

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('erreur critique'),
            }));
        });
    });
});

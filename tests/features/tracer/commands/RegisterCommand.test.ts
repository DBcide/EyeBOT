import RegisterCommand from '@/features/tracer/commands/RegisterCommand';
import { AlbionService } from '@/features/tracer/services/AlbionService';
import { TracerService } from '@/features/tracer/services/TracerService';
import { LoggerService } from '@/shared/services/LoggerService';
import { AlbionPlayer, TracerUser } from '@/features/tracer/models/AlbionTypes';
import { ComponentType } from 'discord.js';

// ─── Mocks modules ────────────────────────────────────────────────────────────

jest.mock('@/features/tracer/utils/DiscordUtils', () => ({
    updateMemberNickname: jest.fn().mockResolvedValue(true),
}));

import { updateMemberNickname } from '@/features/tracer/utils/DiscordUtils';
const mockUpdateNickname = updateMemberNickname as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-discord-123';

const mockPlayer: AlbionPlayer = {
    Id: 'player-abc',
    Name: 'DBcide',
    GuildId: 'guild-001',
    GuildName: 'Sunfall',
    AllianceId: 'alliance-001',
    AllianceName: 'RIOT',
    Avatar: '',
    AvatarRing: '',
    KillFame: 1_500_000,
    DeathFame: 500_000,
    FameRatio: 3.0,
    totalKills: null,
    gvgKills: null,
    gvgWon: null,
};

const mockPlayer2: AlbionPlayer = {
    ...mockPlayer,
    Id: 'player-xyz',
    Name: 'AltDBcide',
};

const mockTracerUser: TracerUser = {
    id: 1,
    discord_id: USER_ID,
    albion_id: 'player-abc',
    albion_name: 'DBcide',
    kill_fame: 1_500_000,
    death_fame: 500_000,
    guild_name: 'Sunfall',
    alliance_name: 'RIOT',
    is_verified: 0,
    is_main: 1,
    registered_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
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

function createMockInteraction(pseudo = 'DBcide', userId = USER_ID) {
    const collector = makeCollector();
    const mockResponse = {
        createMessageComponentCollector: jest.fn().mockReturnValue(collector),
    };

    return {
        user: {
            id: userId,
            tag: 'DBcide#0001',
            send: jest.fn().mockResolvedValue(undefined),
        },
        options: {
            getString: jest.fn().mockImplementation((name: string) => {
                if (name === 'pseudo') return pseudo;
                return null;
            }),
        },
        guild: { id: 'guild-001', members: { cache: new Map() } },
        channel: {
            isSendable: jest.fn().mockReturnValue(true),
            send: jest.fn().mockResolvedValue(undefined),
        },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(mockResponse),
        _collector: collector,
        _mockResponse: mockResponse,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegisterCommand', () => {
    let command: RegisterCommand;
    let mockAlbionService: jest.Mocked<Pick<AlbionService, 'searchPlayer' | 'formatFame'>>;
    let mockTracerService: jest.Mocked<Pick<
        TracerService,
        | 'isCharacterVerifiedByOther'
        | 'getUserRegistrationForCharacter'
        | 'countUnverifiedClaims'
        | 'getAllClaimsForCharacter'
        | 'registerUser'
        | 'getRegisteredUsers'
        | 'isAlbionCharacterVerified'
    >>;
    let mockLogger: jest.Mocked<LoggerService>;

    // Helper : configure le chemin "enregistrement simple réussi"
    function setupHappyPath() {
        mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
        mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(null);
        mockTracerService.countUnverifiedClaims.mockResolvedValue(0);
        mockTracerService.registerUser.mockResolvedValue({ id: 1, isUpdate: false });
        mockTracerService.getRegisteredUsers.mockResolvedValue([mockTracerUser]);
    }

    beforeEach(() => {
        jest.clearAllMocks();

        mockAlbionService = {
            searchPlayer: jest.fn(),
            formatFame: jest.fn().mockReturnValue('1.50M'),
        };

        mockTracerService = {
            isCharacterVerifiedByOther: jest.fn(),
            getUserRegistrationForCharacter: jest.fn(),
            countUnverifiedClaims: jest.fn(),
            getAllClaimsForCharacter: jest.fn(),
            registerUser: jest.fn(),
            getRegisteredUsers: jest.fn(),
            isAlbionCharacterVerified: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            raw: jest.fn(),
        } as unknown as jest.Mocked<LoggerService>;

        command = new RegisterCommand(
            mockAlbionService as unknown as AlbionService,
            mockTracerService as unknown as TracerService,
            mockLogger
        );
    });

    // ─── buildCommand() ───────────────────────────────────────────────────────

    describe('buildCommand()', () => {
        it('[positif] retourne un builder avec le nom "register" et 1 option "pseudo" requise', () => {
            const json = command.buildCommand().toJSON();

            expect(json.name).toBe('register');
            expect(json.options).toHaveLength(1);
            expect(json.options![0].name).toBe('pseudo');
        });
    });

    // ─── Recherche du joueur ──────────────────────────────────────────────────

    describe('recherche du joueur', () => {
        it('[extrême] editReply si aucun joueur trouvé sur l\'API Albion', async () => {
            const interaction = createMockInteraction('Inconnu');
            mockAlbionService.searchPlayer.mockResolvedValue([]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Inconnu'),
            }));
        });

        it('[positif] appelle handlePlayerRegistration directement si 1 seul joueur trouvé', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            setupHappyPath();

            await command.execute(interaction as any);

            expect(mockTracerService.isCharacterVerifiedByOther).toHaveBeenCalledWith('player-abc', USER_ID);
        });

        it('[positif] affiche un menu de sélection si plusieurs joueurs trouvés', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                components: expect.any(Array),
            }));
            expect(interaction._mockResponse.createMessageComponentCollector).toHaveBeenCalledWith(
                expect.objectContaining({ componentType: ComponentType.StringSelect, time: 60_000 })
            );
        });

        it('[extrême] editReply getAlbionApiErrorMessage si l\'API lance une exception', async () => {
            const interaction = createMockInteraction();
            const err = new Error('Network error');
            mockAlbionService.searchPlayer.mockRejectedValue(err);

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.any(String),
            }));
        });
    });

    // ─── handlePlayerRegistration() ───────────────────────────────────────────

    describe('handlePlayerRegistration()', () => {
        it('[extrême] editReply embed "déjà vérifié" si le personnage appartient à quelqu\'un d\'autre', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue('autre-user-999');

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
            }));
            expect(mockTracerService.registerUser).not.toHaveBeenCalled();
        });

        it('[extrême] appelle handleAlreadyRegistered si l\'utilisateur a déjà ce personnage', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(mockTracerUser);
            mockTracerService.isAlbionCharacterVerified.mockResolvedValue(false);

            await command.execute(interaction as any);

            expect(mockTracerService.isAlbionCharacterVerified).toHaveBeenCalledWith('player-abc');
            expect(mockTracerService.registerUser).not.toHaveBeenCalled();
        });

        it('[extrême] appelle registerPlayerWithWarning si d\'autres revendications non vérifiées existent', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(null);
            mockTracerService.countUnverifiedClaims.mockResolvedValue(1);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([
                { ...mockTracerUser, discord_id: 'autre-user-888' },
            ]);
            mockTracerService.registerUser.mockResolvedValue({ id: 1, isUpdate: false });
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockTracerUser]);

            await command.execute(interaction as any);

            expect(mockTracerService.getAllClaimsForCharacter).toHaveBeenCalledWith('player-abc');
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('avertissement'),
            }));
        });
    });

    // ─── handleAlreadyRegistered() ────────────────────────────────────────────

    describe('handleAlreadyRegistered()', () => {
        it('[positif] editReply embed vert si le personnage est vérifié', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(mockTracerUser);
            mockTracerService.isAlbionCharacterVerified.mockResolvedValue(true);

            await command.execute(interaction as any);

            const call = (interaction.editReply as jest.Mock).mock.calls[0][0];
            expect(call.embeds[0].data.color).toBe(0x2ECC71);
            expect(call.embeds[0].data.fields).toBeUndefined();
        });

        it('[extrême] editReply embed rouge + champ "Conseil" si le personnage n\'est pas vérifié', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(mockTracerUser);
            mockTracerService.isAlbionCharacterVerified.mockResolvedValue(false);

            await command.execute(interaction as any);

            const call = (interaction.editReply as jest.Mock).mock.calls[0][0];
            expect(call.embeds[0].data.color).toBe(0xFF6B6B);
            expect(call.embeds[0].data.fields).toHaveLength(1);
            expect(call.embeds[0].data.fields[0].name).toContain('Conseil');
        });
    });

    // ─── registerPlayer() ─────────────────────────────────────────────────────

    describe('registerPlayer()', () => {
        it('[positif] appelle registerUser, updateMemberNickname, editReply succès, user.send et channel.send', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            setupHappyPath();

            await command.execute(interaction as any);

            expect(mockTracerService.registerUser).toHaveBeenCalledWith(USER_ID, mockPlayer);
            expect(mockUpdateNickname).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Enregistrement réussi'),
            }));
            expect(interaction.user.send).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
            }));
            expect(interaction.channel.send).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
            }));
        });

        it('[extrême] logger.warn si user.send échoue mais la commande se termine normalement', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            setupHappyPath();
            interaction.user.send.mockRejectedValue(new Error('DMs fermés'));

            await command.execute(interaction as any);

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('MP'));
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Enregistrement réussi'),
            }));
        });

        it('[extrême] pas de channel.send si le channel n\'est pas sendable', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            setupHappyPath();
            interaction.channel.isSendable.mockReturnValue(false);

            await command.execute(interaction as any);

            expect(interaction.channel.send).not.toHaveBeenCalled();
        });

        it('[extrême] editReply embed "déjà vérifié" si registerUser lance CHARACTER_VERIFIED_BY_OTHER', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(null);
            mockTracerService.countUnverifiedClaims.mockResolvedValue(0);
            mockTracerService.registerUser.mockRejectedValue(
                new Error('CHARACTER_VERIFIED_BY_OTHER:owner-999')
            );

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                components: [],
            }));
        });

        it('[extrême] editReply générique si registerUser lance une erreur inconnue', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(null);
            mockTracerService.countUnverifiedClaims.mockResolvedValue(0);
            mockTracerService.registerUser.mockRejectedValue(new Error('DB error'));

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Erreur'),
                embeds: [],
                components: [],
            }));
        });
    });

    // ─── registerPlayerWithWarning() ──────────────────────────────────────────

    describe('registerPlayerWithWarning()', () => {
        function setupWarningPath() {
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(null);
            mockTracerService.countUnverifiedClaims.mockResolvedValue(1);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([
                { ...mockTracerUser, discord_id: 'autre-user-888' },
            ]);
            mockTracerService.registerUser.mockResolvedValue({ id: 1, isUpdate: false });
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockTracerUser]);
        }

        it('[extrême] editReply embed "déjà vérifié" si registerUser lance CHARACTER_VERIFIED_BY_OTHER', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(null);
            mockTracerService.countUnverifiedClaims.mockResolvedValue(1);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([
                { ...mockTracerUser, discord_id: 'autre-user-888' },
            ]);
            mockTracerService.registerUser.mockRejectedValue(
                new Error('CHARACTER_VERIFIED_BY_OTHER:owner-999')
            );

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array),
                components: [],
            }));
        });

        it('[extrême] editReply générique si registerUser lance une erreur inconnue', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            setupWarningPath();
            mockTracerService.registerUser.mockRejectedValue(new Error('DB crash'));

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Erreur'),
                embeds: [],
                components: [],
            }));
        });
    });

    // ─── showPlayerSelection() — collector ────────────────────────────────────

    describe('showPlayerSelection() — collector', () => {
        it('[positif] collect bon utilisateur → deferUpdate + handlePlayerRegistration', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);
            setupHappyPath();

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
            expect(mockTracerService.isCharacterVerifiedByOther).toHaveBeenCalledWith('player-abc', USER_ID);
        });

        it('[extrême] collect mauvais utilisateur → reply éphémère, pas de deferUpdate', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);

            await command.execute(interaction as any);

            const selectInteraction = {
                user: { id: 'intrus-999' },
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
        });

        it('[extrême] collect avec ID de joueur introuvable → update "introuvable"', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);

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

        it('[extrême] end sans collecte → editReply "Temps écoulé"', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);

            await command.execute(interaction as any);

            await interaction._collector.emit('end', { size: 0 });

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Temps écoulé'),
                embeds: [],
                components: [],
            }));
        });

        it('[positif] end avec collecte → pas de message de timeout', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);

            await command.execute(interaction as any);

            (interaction.editReply as jest.Mock).mockClear();
            await interaction._collector.emit('end', { size: 1 });

            expect(interaction.editReply).not.toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Temps écoulé'),
            }));
        });
    });
});

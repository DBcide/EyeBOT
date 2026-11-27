import RegisterCommand from '@/features/tracer/commands/RegisterCommand';
import { AlbionService } from '@/features/tracer/services/AlbionService';
import { TracerService } from '@/features/tracer/services/TracerService';
import { LoggerService } from '@/shared/services/LoggerService';
import { AlbionPlayer, TracerUser } from '@/features/tracer/models/AlbionTypes';
import { ComponentType, MessageFlagsBitField } from 'discord.js';

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
        // Attend les handlers asynchrones (le code en fait des await avant de répondre)
        emit: async (event: string, ...args: any[]) => {
            await Promise.all((handlers[event] ?? []).map((h) => h(...args)));
        },
        // Appelé par la commande après la première sélection valide (évite une double sélection)
        stop: jest.fn(),
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
    let mockAlbionService: jest.Mocked<Pick<AlbionService, 'searchPlayer' | 'formatFame' | 'getPlayerDetailsById'>>;
    let mockTracerService: jest.Mocked<Pick<
        TracerService,
        | 'isCharacterVerifiedByOther'
        | 'getUserRegistrationForCharacter'
        | 'countUnverifiedClaims'
        | 'getAllClaimsForCharacter'
        | 'registerUser'
        | 'getRegisteredUsers'
        | 'isAlbionCharacterVerified'
        | 'updateUserFromApi'
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
            getPlayerDetailsById: jest.fn(),
        };

        mockTracerService = {
            isCharacterVerifiedByOther: jest.fn(),
            getUserRegistrationForCharacter: jest.fn(),
            countUnverifiedClaims: jest.fn(),
            getAllClaimsForCharacter: jest.fn(),
            registerUser: jest.fn(),
            getRegisteredUsers: jest.fn(),
            isAlbionCharacterVerified: jest.fn(),
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

        it("[extrême] met à jour le personnage (flux /update) si l'utilisateur l'a déjà enregistré", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(mockTracerUser);
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(mockPlayer as any);

            await command.execute(interaction as any);

            expect(mockAlbionService.getPlayerDetailsById).toHaveBeenCalledWith('player-abc');
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

    // ─── Personnage déjà lié au compte ────────────────────────────────────────
    // Un utilisateur qui revient sur un serveur (ou en rejoint un autre utilisant le bot)
    // refait /register : son personnage est mis à jour et il est renommé sur ce serveur.

    describe('personnage déjà lié au compte', () => {
        beforeEach(() => {
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            mockTracerService.isCharacterVerifiedByOther.mockResolvedValue(null);
            mockTracerService.getUserRegistrationForCharacter.mockResolvedValue(mockTracerUser);
        });

        it('[positif] rafraîchit les stats, renomme le membre et affiche "Personnage mis à jour"', async () => {
            const interaction = createMockInteraction();
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(mockPlayer as any);

            await command.execute(interaction as any);

            expect(mockTracerService.updateUserFromApi).toHaveBeenCalledWith('player-abc', mockPlayer);
            expect(mockUpdateNickname).toHaveBeenCalledWith(interaction.guild, USER_ID, 'DBcide', 'Sunfall', mockLogger);
            const calls = (interaction.editReply as jest.Mock).mock.calls;
            const call = calls[calls.length - 1][0];
            expect(call.embeds[0].data.title).toContain('Personnage mis à jour');
            expect(call.embeds[0].data.color).toBe(0x51CF66);
            // Pas de nouvel enregistrement ni de MP / message public
            expect(mockTracerService.registerUser).not.toHaveBeenCalled();
            expect(interaction.user.send).not.toHaveBeenCalled();
            expect(interaction.channel.send).not.toHaveBeenCalled();
        });

        it("[extrême] editReply 'Impossible de récupérer' si le personnage n'existe plus sur l'API", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.getPlayerDetailsById.mockResolvedValue(null);

            await command.execute(interaction as any);

            expect(mockTracerService.updateUserFromApi).not.toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Impossible de récupérer'),
            }));
        });

        it("[extrême] editReply message d'erreur API et un seul log si l'API échoue", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.getPlayerDetailsById.mockRejectedValue(new Error('Request timeout'));

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('trop de temps'),
            }));
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

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('MP'), 'tracer');
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
                flags: MessageFlagsBitField.Flags.Ephemeral,
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

            await interaction._collector.emit('end', { size: 0 }, 'time');

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
            await interaction._collector.emit('end', { size: 1 }, 'selected');

            expect(interaction.editReply).not.toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Temps écoulé'),
            }));
        });

        it("[extrême] une erreur pendant la sélection est loguée et affichée (pas de promesse rejetée)", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);
            await command.execute(interaction as any);
            mockTracerService.isCharacterVerifiedByOther.mockRejectedValue(new Error('Request timeout'));

            const selectInteraction = {
                user: { id: USER_ID },
                values: ['player-abc'],
                deferUpdate: jest.fn().mockResolvedValue(undefined),
                reply: jest.fn(),
                update: jest.fn(),
            };
            await expect(interaction._collector.emit('collect', selectInteraction)).resolves.toBeUndefined();

            expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), 'tracer', expect.any(Error));
            expect(interaction.editReply).toHaveBeenLastCalledWith(expect.objectContaining({
                content: expect.stringContaining('trop de temps'),
                components: [],
            }));
        });

        it("[extrême] arrête le collector dès la première sélection valide (pas de double enregistrement)", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);
            await command.execute(interaction as any);
            setupHappyPath();

            await interaction._collector.emit('collect', {
                user: { id: USER_ID },
                values: ['player-abc'],
                deferUpdate: jest.fn().mockResolvedValue(undefined),
                reply: jest.fn(),
                update: jest.fn(),
            });

            expect(interaction._collector.stop).toHaveBeenCalledWith('selected');
        });

        it("[extrême] si la réponse de timeout échoue (interaction expirée), un simple warn est logué", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer, mockPlayer2]);
            await command.execute(interaction as any);
            interaction.editReply.mockRejectedValue(new Error('Unknown interaction'));

            await expect(interaction._collector.emit('end', { size: 0 }, 'time')).resolves.toBeUndefined();

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(String), 'tracer', { error: 'Unknown interaction' });
        });
    });

    // ─── Robustesse des messages après enregistrement ─────────────────────────

    describe('messages après un enregistrement réussi', () => {
        it("[extrême] un message public impossible (permissions du salon) n'affiche pas d'erreur à l'utilisateur", async () => {
            const interaction = createMockInteraction();
            mockAlbionService.searchPlayer.mockResolvedValue([mockPlayer]);
            setupHappyPath();
            interaction.channel.send.mockRejectedValue(new Error('Missing Permissions'));

            await command.execute(interaction as any);

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('message public'), 'tracer');
            expect(interaction.editReply).not.toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Erreur lors de l'),
            }));
        });

        it("[positif] répond en anglais si le client Discord de l'utilisateur est en anglais", async () => {
            const interaction = { ...createMockInteraction(), locale: 'en-US' };
            mockAlbionService.searchPlayer.mockResolvedValue([]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: '❌ No player named "DBcide" was found on Albion Online.',
            });
        });
    });
});

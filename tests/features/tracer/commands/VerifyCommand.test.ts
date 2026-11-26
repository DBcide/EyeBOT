import VerifyCommand from '@/features/tracer/commands/VerifyCommand';
import { TracerService } from '@/features/tracer/services/TracerService';
import { LoggerService } from '@/shared/services/LoggerService';
import { TracerUser } from '@/features/tracer/models/AlbionTypes';
import { MessageFlagsBitField } from 'discord.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_ID = '506045516421791744';
const TARGET_USER_ID = 'discord-target-123';

const mockCharacter: TracerUser = {
    id: 1,
    discord_id: TARGET_USER_ID,
    albion_id: 'player-abc',
    albion_name: 'DBcide',
    kill_fame: 10000,
    death_fame: 5000,
    guild_name: 'Sunfall',
    alliance_name: 'RIOT',
    is_verified: 0,
    is_main: 1,
    registered_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockInteraction(userId = OWNER_ID, characterName = 'DBcide') {
    const mockTargetUser = {
        send: jest.fn().mockResolvedValue(undefined),
    };

    return {
        user: {
            id: userId,
            tag: 'DBcide#0001',
            displayAvatarURL: jest.fn().mockReturnValue('https://cdn.discordapp.com/avatars/123/abc.png'),
        },
        options: {
            getString: jest.fn().mockImplementation((name: string) => {
                if (name === 'discord_id') return TARGET_USER_ID;
                if (name === 'personnage') return characterName;
                return null;
            }),
        },
        reply: jest.fn().mockResolvedValue(undefined),
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        client: {
            users: {
                fetch: jest.fn().mockResolvedValue(mockTargetUser),
            },
        },
        _mockTargetUser: mockTargetUser, // exposé pour les assertions
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VerifyCommand', () => {
    let command: VerifyCommand;
    let mockTracerService: jest.Mocked<Pick<TracerService, 'getRegisteredUsers' | 'getAllClaimsForCharacter' | 'verifyCharacter'>>;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        mockTracerService = {
            getRegisteredUsers: jest.fn(),
            getAllClaimsForCharacter: jest.fn(),
            verifyCharacter: jest.fn().mockResolvedValue(undefined),
        };

        mockLogger = {
            info: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            raw: jest.fn(),
        } as unknown as jest.Mocked<LoggerService>;

        command = new VerifyCommand(
            mockTracerService as unknown as TracerService,
            mockLogger
        );
    });

    // ─── buildCommand() ───────────────────────────────────────────────────────

    describe('buildCommand()', () => {
        it('[positif] retourne un builder avec le nom "verify" et 2 options requises', () => {
            const json = command.buildCommand().toJSON();

            expect(json.name).toBe('verify');
            expect(json.options).toHaveLength(2);
            expect(json.options![0].name).toBe('discord_id');
            expect(json.options![1].name).toBe('personnage');
        });
    });

    // ─── Garde propriétaire ───────────────────────────────────────────────────

    describe('garde propriétaire', () => {
        it('[positif] accepte la commande si l\'utilisateur est le propriétaire du bot', async () => {
            const interaction = createMockInteraction(OWNER_ID);
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter]);

            await command.execute(interaction as any);

            expect(interaction.reply).not.toHaveBeenCalled();
            expect(interaction.deferReply).toHaveBeenCalledTimes(1);
        });

        it('[extrême] bloque si l\'utilisateur n\'est pas le propriétaire du bot', async () => {
            const interaction = createMockInteraction('autre-user-000');

            await command.execute(interaction as any);

            expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('permission'),
                flags: MessageFlagsBitField.Flags.Ephemeral,
            }));
            expect(interaction.deferReply).not.toHaveBeenCalled();
        });
    });

    // ─── Validation des personnages ───────────────────────────────────────────

    describe('validation des personnages', () => {
        it('[extrême] editReply erreur si l\'utilisateur cible n\'a aucun personnage enregistré', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining(TARGET_USER_ID),
            }));
            expect(mockTracerService.verifyCharacter).not.toHaveBeenCalled();
        });

        it('[extrême] editReply erreur si le personnage demandé n\'est pas lié à l\'utilisateur cible', async () => {
            const interaction = createMockInteraction(OWNER_ID, 'PersonnageInexistant');
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('PersonnageInexistant'),
            }));
            expect(mockTracerService.verifyCharacter).not.toHaveBeenCalled();
        });

        it('[positif] trouve le personnage de façon insensible à la casse', async () => {
            const interaction = createMockInteraction(OWNER_ID, 'dbcide'); // minuscules
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter]);

            await command.execute(interaction as any);

            expect(mockTracerService.verifyCharacter).toHaveBeenCalledWith(TARGET_USER_ID, 'player-abc');
        });

        it('[extrême] editReply avertissement si le personnage est déjà vérifié', async () => {
            const interaction = createMockInteraction();
            const verifiedCharacter = { ...mockCharacter, is_verified: 1 };
            mockTracerService.getRegisteredUsers.mockResolvedValue([verifiedCharacter]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('déjà vérifié'),
            }));
            expect(mockTracerService.verifyCharacter).not.toHaveBeenCalled();
        });

        it('[extrême] editReply liste les personnages disponibles si le personnage demandé est introuvable', async () => {
            const interaction = createMockInteraction(OWNER_ID, 'PersonnageInexistant');
            const altChar = { ...mockCharacter, albion_name: 'AltDBcide' };
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter, altChar]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('DBcide'),
            }));
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('AltDBcide'),
            }));
        });
    });

    // ─── Vérification réussie ─────────────────────────────────────────────────

    describe('vérification réussie', () => {
        it('[positif] appelle verifyCharacter avec les bons paramètres', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter]);

            await command.execute(interaction as any);

            expect(mockTracerService.verifyCharacter).toHaveBeenCalledWith(TARGET_USER_ID, 'player-abc');
        });

        it('[positif] editReply avec un embed de confirmation sans champ si aucune revendication en doublon', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            // getAllClaimsForCharacter retourne uniquement le claim de l'utilisateur cible → pas de doublons
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter]);

            await command.execute(interaction as any);

            expect(interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('[positif] l\'embed de confirmation contient un champ si des revendications en doublon sont supprimées', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            const duplicateClaim = { ...mockCharacter, id: 2, discord_id: 'autre-user-999' };
            // getAllClaimsForCharacter retourne le claim cible + un doublon
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter, duplicateClaim]);

            await command.execute(interaction as any);

            const editReplyCall = (interaction.editReply as jest.Mock).mock.calls[0][0];
            const embedFields = editReplyCall.embeds[0].data.fields;
            expect(embedFields).toBeDefined();
            expect(embedFields.length).toBeGreaterThan(0);
            expect(embedFields[0].name).toContain('Revendications supprimées');
        });

        it('[positif] envoie un DM de notification à l\'utilisateur vérifié', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter]);

            await command.execute(interaction as any);

            expect(interaction.client.users.fetch).toHaveBeenCalledWith(TARGET_USER_ID);
            expect(interaction._mockTargetUser.send).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });

        it('[extrême] log un avertissement si le DM échoue mais la commande se termine normalement', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockResolvedValue([mockCharacter]);
            mockTracerService.getAllClaimsForCharacter.mockResolvedValue([mockCharacter]);
            interaction._mockTargetUser.send.mockRejectedValue(new Error('DMs fermés'));

            await command.execute(interaction as any);

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining(TARGET_USER_ID));
            // La commande s'est quand même terminée avec succès
            expect(interaction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({ embeds: expect.any(Array) })
            );
        });
    });

    // ─── Gestion d'erreur globale ─────────────────────────────────────────────

    describe('gestion d\'erreur globale', () => {
        it('[extrême] editReply message d\'erreur générique si tracerService lance une exception', async () => {
            const interaction = createMockInteraction();
            mockTracerService.getRegisteredUsers.mockRejectedValue(new Error('DB down'));

            await command.execute(interaction as any);

            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('erreur'),
            }));
        });
    });
});

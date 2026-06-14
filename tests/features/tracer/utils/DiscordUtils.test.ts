import { updateMemberNickname } from '@/features/tracer/utils/DiscordUtils';
import { Guild } from 'discord.js';
import { LoggerService } from '@/shared/services/LoggerService';

describe('updateMemberNickname', () => {
    let mockMember: { setNickname: jest.Mock };
    let mockGuild: Pick<Guild, 'members'>;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        mockMember = {
            setNickname: jest.fn().mockResolvedValue(undefined),
        };

        mockGuild = {
            members: {
                fetch: jest.fn().mockResolvedValue(mockMember),
            } as unknown as Guild['members'],
        };

        mockLogger = {
            info: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            raw: jest.fn(),
        } as unknown as jest.Mocked<LoggerService>;
    });

    // ─── Guard guild null ─────────────────────────────────────────────────────

    it('[extrême] retourne false immédiatement si guild est null', async () => {
        const result = await updateMemberNickname(null, '123456', 'DBcide', 'Sunfall');

        expect(result).toBe(false);
        expect((mockGuild.members.fetch as jest.Mock)).not.toHaveBeenCalled();
    });

    // ─── Cas positifs ─────────────────────────────────────────────────────────

    it('[positif] retourne true si le renommage réussit', async () => {
        const result = await updateMemberNickname(
            mockGuild as Guild, '123456', 'DBcide', 'Sunfall', mockLogger
        );

        expect(result).toBe(true);
    });

    it('[positif] appelle setNickname avec le format "[TAG] NomPersonnage"', async () => {
        await updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', 'La Grande Guilde', mockLogger);

        expect(mockMember.setNickname).toHaveBeenCalledWith('[LGG] DBcide');
    });

    it('[positif] utilise "[]" comme tag si guildName est null', async () => {
        await updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', null, mockLogger);

        expect(mockMember.setNickname).toHaveBeenCalledWith('[] DBcide');
    });

    it('[positif] utilise "[]" comme tag si guildName est absent', async () => {
        await updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', undefined, mockLogger);

        expect(mockMember.setNickname).toHaveBeenCalledWith('[] DBcide');
    });

    // ─── Erreurs ──────────────────────────────────────────────────────────────

    it('[extrême] retourne false si guild.members.fetch lance une erreur', async () => {
        (mockGuild.members.fetch as jest.Mock).mockRejectedValue(new Error('Membre introuvable'));

        const result = await updateMemberNickname(
            mockGuild as Guild, '999999', 'DBcide', 'Sunfall', mockLogger
        );

        expect(result).toBe(false);
    });

    it('[extrême] retourne false si member.setNickname lance une erreur', async () => {
        mockMember.setNickname.mockRejectedValue(new Error('Permissions insuffisantes'));

        const result = await updateMemberNickname(
            mockGuild as Guild, '123456', 'DBcide', 'Sunfall', mockLogger
        );

        expect(result).toBe(false);
    });

    it('[extrême] appelle logger.warn si le renommage échoue et qu\'un logger est fourni', async () => {
        mockMember.setNickname.mockRejectedValue(new Error('Permissions insuffisantes'));

        await updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', 'Sunfall', mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('123456'));
    });

    it('[extrême] appelle logger.debug avec le message si l\'erreur est une instance Error', async () => {
        const err = new Error('Permissions insuffisantes');
        mockMember.setNickname.mockRejectedValue(err);

        await updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', 'Sunfall', mockLogger);

        expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining(err.message));
    });

    it('[extrême] n\'appelle pas logger.debug si l\'erreur n\'est pas une instance Error', async () => {
        mockMember.setNickname.mockRejectedValue('string error');

        await updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', 'Sunfall', mockLogger);

        expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('[extrême] ne plante pas si aucun logger n\'est fourni lors d\'une erreur', async () => {
        mockMember.setNickname.mockRejectedValue(new Error('Permissions insuffisantes'));

        await expect(
            updateMemberNickname(mockGuild as Guild, '123456', 'DBcide', 'Sunfall')
        ).resolves.toBe(false);
    });
});

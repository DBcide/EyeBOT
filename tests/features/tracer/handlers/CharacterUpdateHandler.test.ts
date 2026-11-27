import { CharacterUpdateHandler } from '@/features/tracer/handlers/CharacterUpdateHandler';
import { CharacterSyncService } from '@/features/tracer/services/CharacterSyncService';
import { LoggerService } from '@/shared/services/LoggerService';
import { ServiceContainer } from '@/shared/services/ServiceContainer';
import { tracerTranslations } from '@/features/tracer/translations';
import { AlbionPlayerDetailed, TracerUser } from '@/features/tracer/models/AlbionTypes';

const character = { albion_id: 'player-abc', albion_name: 'DBcide' } as TracerUser;
const details = {
    Id: 'player-abc', Name: 'DBcide', KillFame: 1_600_000, DeathFame: 500_000, GuildName: 'Sunfall', AllianceName: 'RIOT',
} as AlbionPlayerDetailed;

function createInteraction() {
    return {
        user: { id: 'user-1', tag: 'DBcide#0001' },
        guild: { id: 'guild-001' },
        editReply: jest.fn().mockResolvedValue(undefined),
    };
}

describe('CharacterUpdateHandler', () => {
    let handler: CharacterUpdateHandler;
    let mockSync: jest.Mocked<Pick<CharacterSyncService, 'syncCharacter'>>;
    let mockLogger: jest.Mocked<LoggerService>;

    beforeEach(() => {
        mockSync = { syncCharacter: jest.fn().mockResolvedValue(details) };
        mockLogger = { debug: jest.fn(), success: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<LoggerService>;
        handler = new CharacterUpdateHandler(mockSync as unknown as CharacterSyncService, mockLogger);
    });

    it('[positif] synchronise puis affiche l\'embed "Personnage mis à jour"', async () => {
        const interaction = createInteraction();

        await handler.updateAndReply(interaction as any, tracerTranslations.forLocale('fr'), character);

        expect(mockSync.syncCharacter).toHaveBeenCalledWith(interaction.guild, 'user-1', 'player-abc');
        const reply = interaction.editReply.mock.calls[0][0];
        expect(reply.content).toBeNull();
        expect(reply.components).toEqual([]);
        expect(reply.embeds[0].data.title).toBe('\u{2705} Personnage mis à jour');
        expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('DBcide'), 'tracer');
    });

    it('[positif] répond dans la langue fournie', async () => {
        const interaction = createInteraction();

        await handler.updateAndReply(interaction as any, tracerTranslations.forLocale('en'), character);

        expect(interaction.editReply.mock.calls[0][0].embeds[0].data.title).toBe('\u{2705} Character updated');
    });

    it('[extrême] personnage introuvable sur l\'API → message dédié, pas d\'erreur loguée', async () => {
        const interaction = createInteraction();
        mockSync.syncCharacter.mockResolvedValue(null);

        await handler.updateAndReply(interaction as any, tracerTranslations.forLocale('fr'), character);

        expect(interaction.editReply).toHaveBeenCalledWith({
            content: '\u{274C} Impossible de récupérer les informations du personnage "DBcide" depuis l\'API Albion.',
            embeds: [],
            components: [],
        });
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('[extrême] erreur de synchro → message traduit et une seule erreur loguée', async () => {
        const interaction = createInteraction();
        const error = new Error('rate limit');
        mockSync.syncCharacter.mockRejectedValue(error);

        await handler.updateAndReply(interaction as any, tracerTranslations.forLocale('fr'), character);

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), 'tracer', error);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('Trop de requêtes'),
        }));
    });

    it('[positif] sans dépendance injectée, utilise le logger partagé', () => {
        expect((new CharacterUpdateHandler() as any).logger).toBe(ServiceContainer.getInstance().logger);
    });
});

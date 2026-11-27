import { buildVerificationReportEmbed, buildVerificationNotificationEmbed } from '@/features/tracer/embeds';
import { tracerI18n } from '@/features/tracer/i18n';
import { TracerUser } from '@/features/tracer/models/AlbionTypes';

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');
const fr = tracerI18n.for('fr');
const en = tracerI18n.for('en');

const character: TracerUser = {
    id: 1,
    discord_id: 'target-1',
    albion_id: 'player-abc',
    albion_name: 'DBcide',
    kill_fame: 1_500_000,
    death_fame: 500_000,
    guild_name: 'Sunfall',
    alliance_name: 'RIOT',
    is_verified: 0,
    is_main: 1,
    registered_at: FIXED_DATE,
    updated_at: FIXED_DATE,
};
const admin = { tag: 'Admin#0001', avatarURL: 'https://cdn.example/avatar.png' };

describe('VerifyEmbeds', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_DATE);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    describe('buildVerificationReportEmbed()', () => {
        it('[snapshot] rapport avec revendications supprimées', () => {
            const removed = [
                { ...character, discord_id: '111' },
                { ...character, discord_id: '222' },
            ];
            expect(buildVerificationReportEmbed(fr, 'target-1', character, removed, admin).toJSON()).toMatchSnapshot();
        });

        it('[positif] sans revendication supprimée → pas de champ', () => {
            const embed = buildVerificationReportEmbed(fr, 'target-1', character, [], admin).toJSON();

            expect(embed.fields ?? []).toHaveLength(0);
            expect(embed.footer).toEqual({ text: 'Vérifié par Admin#0001', icon_url: admin.avatarURL });
        });

        it('[extrême] sans guilde ni alliance → "Aucune"', () => {
            const noGuild = { ...character, guild_name: null, alliance_name: null };
            const description = buildVerificationReportEmbed(fr, 'target-1', noGuild, [], admin).toJSON().description!;

            expect(description).toContain('**Guilde :** Aucune');
            expect(description).toContain('**Alliance :** Aucune');
        });

        it('[positif] la date de revendication est une balise Discord (affichée dans la langue du lecteur)', () => {
            const value = buildVerificationReportEmbed(fr, 'target-1', character, [{ ...character, discord_id: '111' }], admin)
                .toJSON().fields![0].value;

            expect(value).toBe('• <@111> (enregistré le <t:1767225600:d>)');
        });

        it('[extrême] tronque la liste à 1024 caractères si beaucoup de revendications', () => {
            const removed = Array.from({ length: 60 }, (_, i) => ({ ...character, discord_id: `1234567890123456${i}` }));
            const field = buildVerificationReportEmbed(fr, 'target-1', character, removed, admin).toJSON().fields![0];

            expect(field.name).toContain('(60)');
            expect(field.value.length).toBeLessThanOrEqual(1024);
        });
    });

    describe('buildVerificationNotificationEmbed()', () => {
        it('[snapshot] notification envoyée en MP au propriétaire', () => {
            expect(buildVerificationNotificationEmbed(fr, character).toJSON()).toMatchSnapshot();
        });

        it('[positif] traduite dans la langue du destinataire', () => {
            const embed = buildVerificationNotificationEmbed(en, { ...character, guild_name: null }).toJSON();

            expect(embed.title).toBe('🔒 Character verified!');
            expect(embed.fields![0].value).toContain('**Guild:** None');
        });
    });
});

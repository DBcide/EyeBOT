import {
    buildCharacterSelectionEmbed,
    buildCharacterUpdatedEmbed,
    buildUpdateAllStartEmbed,
    buildUpdateAllProgressEmbed,
    buildUpdateAllSummaryEmbed,
} from '@/features/tracer/embeds';
import { tracerI18n } from '@/features/tracer/i18n';
import { EmbedColors } from '@/shared/embeds/EmbedColors';

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');
const fr = tracerI18n.for('fr');
const hex = (color: string) => parseInt(color.slice(1), 16);

describe('UpdateEmbeds', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_DATE);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    describe('buildCharacterSelectionEmbed()', () => {
        it('[snapshot] liste des personnages + avertissement de renommage', () => {
            const embed = buildCharacterSelectionEmbed(fr, [
                { name: 'DBcide', killFame: 1_500_000 },
                { name: 'AltDBcide', killFame: 250_000 },
            ]);
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    describe('buildCharacterUpdatedEmbed()', () => {
        it('[snapshot] stats à jour avec guilde et alliance', () => {
            const embed = buildCharacterUpdatedEmbed(fr, {
                name: 'DBcide', killFame: 1_600_000, deathFame: 500_000, guildName: 'Sunfall', allianceName: 'RIOT',
            });
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[extrême] sans guilde, alliance ni death fame → "Aucune" et 0', () => {
            const description = buildCharacterUpdatedEmbed(fr, { name: 'DBcide', killFame: 0 }).toJSON().description!;

            expect(description).toContain('**Death Fame :** 0');
            expect(description).toContain('**Guilde :** Aucune');
            expect(description).toContain('**Alliance :** Aucune');
        });
    });

    describe('/updateall', () => {
        it('[snapshot] progression initiale', () => {
            expect(buildUpdateAllStartEmbed(fr, 12).toJSON()).toMatchSnapshot();
        });

        it('[snapshot] progression après un batch', () => {
            const embed = buildUpdateAllProgressEmbed(fr, {
                total: 12, processed: 5, success: 3, skipped: 1, failures: 1, batch: 1, totalBatches: 3,
            });
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[positif] résumé vert et sans champ d\'échecs si tout a réussi', () => {
            const embed = buildUpdateAllSummaryEmbed(fr, { success: 4, failures: 0, skipped: 1, details: [] }).toJSON();

            expect(embed.color).toBe(hex(EmbedColors.Success));
            expect(embed.description).toContain('**Total de membres traités :** 5');
            expect(embed.fields ?? []).toHaveLength(0);
        });

        it('[extrême] résumé orange avec la liste des échecs', () => {
            const embed = buildUpdateAllSummaryEmbed(fr, {
                success: 0, failures: 2, skipped: 0, details: ['A (x): timeout', 'B (y): rate limit'],
            }).toJSON();

            expect(embed.color).toBe(hex(EmbedColors.Warning));
            expect(embed.fields![0].value).toBe('1. A (x): timeout\n2. B (y): rate limit');
        });

        it('[extrême] n\'affiche que 10 échecs, mentionne les autres et respecte la limite de 1024 caractères', () => {
            const details = Array.from({ length: 15 }, (_, i) => `Membre${i} (Perso${i}): ${'erreur '.repeat(30)}`);
            const value = buildUpdateAllSummaryEmbed(fr, { success: 0, failures: 15, skipped: 0, details })
                .toJSON().fields![0].value;

            expect(value).toContain('1. Membre0');
            expect(value).not.toContain('Membre10');
            expect(value.length).toBeLessThanOrEqual(1024);
        });

        it('[extrême] la mention "... et N autres" apparaît quand la liste tient dans la limite', () => {
            const details = Array.from({ length: 12 }, (_, i) => `M${i}: x`);
            const value = buildUpdateAllSummaryEmbed(fr, { success: 0, failures: 12, skipped: 0, details })
                .toJSON().fields![0].value;

            expect(value).toContain('... et 2 autres');
        });
    });
});

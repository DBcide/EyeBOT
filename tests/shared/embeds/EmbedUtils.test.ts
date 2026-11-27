import { truncateField, discordDate, EMBED_FIELD_MAX_LENGTH } from '@/shared/embeds/EmbedUtils';

describe('EmbedUtils', () => {
    describe('truncateField()', () => {
        it('[positif] laisse intact un texte sous la limite Discord (1024)', () => {
            expect(truncateField('court')).toBe('court');
        });

        it('[extrême] laisse intact un texte exactement à la limite', () => {
            const text = 'a'.repeat(EMBED_FIELD_MAX_LENGTH);
            expect(truncateField(text)).toBe(text);
        });

        it('[extrême] coupe un texte trop long et termine par "..." sans dépasser la limite', () => {
            const result = truncateField('a'.repeat(EMBED_FIELD_MAX_LENGTH + 50));

            expect(result).toHaveLength(EMBED_FIELD_MAX_LENGTH);
            expect(result.endsWith('...')).toBe(true);
        });

        it('[positif] accepte une limite personnalisée', () => {
            expect(truncateField('abcdefghij', 6)).toBe('abc...');
        });
    });

    describe('discordDate()', () => {
        it.each([
            ['Date', new Date('2026-01-01T00:00:00.000Z')],
            ['chaîne ISO', '2026-01-01T00:00:00.000Z'],
            ['timestamp en ms', Date.parse('2026-01-01T00:00:00.000Z')],
        ])('[positif] %s → balise Discord <t:secondes:d>', (_label, date) => {
            expect(discordDate(date)).toBe('<t:1767225600:d>');
        });
    });
});

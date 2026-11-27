import { buildGuildTag } from '@/features/tracer/utils/GuildUtils';

describe('buildGuildTag', () => {

    // ─── Valeurs vides / invalides ────────────────────────────────────────────

    describe('valeurs vides / invalides', () => {
        it('[extrême] retourne "[]" si guildName est undefined', () => {
            expect(buildGuildTag(undefined)).toBe('[]');
        });

        it('[extrême] retourne "[]" si guildName est null', () => {
            expect(buildGuildTag(null)).toBe('[]');
        });

        it('[extrême] retourne "[]" si guildName est une chaîne vide', () => {
            expect(buildGuildTag('')).toBe('[]');
        });

        it('[extrême] retourne "[]" si guildName ne contient que des espaces', () => {
            expect(buildGuildTag('   ')).toBe('[]');
        });
    });

    // ─── Acronyme (plusieurs majuscules) ─────────────────────────────────────

    describe('nom avec plusieurs majuscules → acronyme', () => {
        it('[positif] extrait les initiales majuscules ("La Grande Guilde" → "[LGG]")', () => {
            expect(buildGuildTag('La Grande Guilde')).toBe('[LGG]');
        });

        it('[positif] fonctionne sans espaces ("SunFall" → "[SF]")', () => {
            expect(buildGuildTag('SunFall')).toBe('[SF]');
        });

        it('[extrême] limite le tag à 5 majuscules maximum ("ABCDEF" → "[ABCDE]")', () => {
            expect(buildGuildTag('ABCDEF')).toBe('[ABCDE]');
        });

        it('[extrême] retourne exactement 2 majuscules si le nom n\'en a que 2 ("La Guilde" → "[LG]")', () => {
            expect(buildGuildTag('La Guilde')).toBe('[LG]');
        });
    });

    // ─── Troncature (0 ou 1 seule majuscule) ─────────────────────────────────

    describe('nom avec 0 ou 1 majuscule → troncature sur 5 caractères', () => {
        it('[positif] retourne les 5 premiers chars sans espaces ("Sunfall" → "[Sunfa]")', () => {
            expect(buildGuildTag('Sunfall')).toBe('[Sunfa]');
        });

        it('[positif] fonctionne sur un nom tout en minuscules ("sunfall" → "[sunfa]")', () => {
            expect(buildGuildTag('sunfall')).toBe('[sunfa]');
        });

        it('[extrême] retourne tous les caractères si le nom fait moins de 5 chars ("Hi" → "[Hi]")', () => {
            expect(buildGuildTag('Hi')).toBe('[Hi]');
        });

        it('[extrême] supprime les espaces avant de tronquer ("sun fall" → "[sunfa]")', () => {
            expect(buildGuildTag('sun fall')).toBe('[sunfa]');
        });
    });
});

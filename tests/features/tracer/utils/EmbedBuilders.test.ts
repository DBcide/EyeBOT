import {
    buildCharactersSummaryEmbed,
    buildVerificationInstructionsEmbed,
    buildVerificationWarningEmbed,
    buildCharacterAlreadyVerifiedEmbed,
    buildRegistrationSuccessEmbed,
    buildRegistrationWithWarningEmbed,
} from '@/features/tracer/utils/EmbedBuilders';
import { AlbionService } from '@/features/tracer/services/AlbionService';

// Date fixe pour que les embeds avec .setTimestamp() soient déterministes
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

describe('EmbedBuilders', () => {
    let albionService: AlbionService;

    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_DATE);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        albionService = new AlbionService();
    });

    // ─── buildCharactersSummaryEmbed() ────────────────────────────────────────

    describe('buildCharactersSummaryEmbed()', () => {
        it('[snapshot] liste vide → affiche "Aucun personnage enregistré."', () => {
            const embed = buildCharactersSummaryEmbed([], albionService);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] un personnage non vérifié', () => {
            const embed = buildCharactersSummaryEmbed(
                [{ albion_name: 'DBcide', kill_fame: 1_500_000, is_verified: 0 }],
                albionService
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] un personnage vérifié → affiche 🔒', () => {
            const embed = buildCharactersSummaryEmbed(
                [{ albion_name: 'DBcide', kill_fame: 1_500_000, is_verified: 1 }],
                albionService
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] plusieurs personnages → numérotés et séparés', () => {
            const embed = buildCharactersSummaryEmbed(
                [
                    { albion_name: 'DBcide', kill_fame: 1_500_000, is_verified: 1 },
                    { albion_name: 'AltDBcide', kill_fame: 250_000, is_verified: 0 },
                    { albion_name: 'CraftDBcide', kill_fame: 0, is_verified: 0 },
                ],
                albionService
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildVerificationInstructionsEmbed() ─────────────────────────────────

    describe('buildVerificationInstructionsEmbed()', () => {
        it('[snapshot] embed d\'instructions avec nom de personnage et discord ID', () => {
            const embed = buildVerificationInstructionsEmbed('DBcide', '506045516421791744');
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildVerificationWarningEmbed() ──────────────────────────────────────

    describe('buildVerificationWarningEmbed()', () => {
        it('[snapshot] embed d\'avertissement avec discord ID', () => {
            const embed = buildVerificationWarningEmbed('506045516421791744');
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildCharacterAlreadyVerifiedEmbed() ─────────────────────────────────

    describe('buildCharacterAlreadyVerifiedEmbed()', () => {
        it('[snapshot] sans paramètres optionnels → pas de champs additionnels', () => {
            const embed = buildCharacterAlreadyVerifiedEmbed('506045516421791744');
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] avec tous les paramètres optionnels', () => {
            const embed = buildCharacterAlreadyVerifiedEmbed(
                '506045516421791744',
                'DBcide',
                '1.50M',
                'Sunfall'
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] avec playerName mais sans guildName → affiche "Aucune"', () => {
            const embed = buildCharacterAlreadyVerifiedEmbed(
                '506045516421791744',
                'DBcide',
                '1.50M',
                undefined
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildRegistrationSuccessEmbed() ──────────────────────────────────────

    describe('buildRegistrationSuccessEmbed()', () => {
        it('[snapshot] avec guilde et alliance', () => {
            const embed = buildRegistrationSuccessEmbed(
                '506045516421791744',
                'DBcide',
                '1.50M',
                'Sunfall',
                'RIOT'
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] sans guilde ni alliance → affiche "Aucune"', () => {
            const embed = buildRegistrationSuccessEmbed(
                '506045516421791744',
                'DBcide',
                '1.50M',
                null,
                null
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildRegistrationWithWarningEmbed() ──────────────────────────────────

    describe('buildRegistrationWithWarningEmbed()', () => {
        it('[snapshot] avec revendications multiples', () => {
            const embed = buildRegistrationWithWarningEmbed(
                '506045516421791744',
                'DBcide',
                '1.50M',
                'Sunfall',
                'RIOT',
                '<@111111111111111111>, <@222222222222222222>',
                2
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] sans guilde ni alliance → affiche "Aucune"', () => {
            const embed = buildRegistrationWithWarningEmbed(
                '506045516421791744',
                'DBcide',
                '1.50M',
                null,
                null,
                '<@111111111111111111>',
                1
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });
});

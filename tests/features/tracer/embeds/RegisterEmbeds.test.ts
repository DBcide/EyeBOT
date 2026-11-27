import {
    buildCharactersSummaryEmbed,
    buildVerificationInstructionsEmbed,
    buildVerificationWarningEmbed,
    buildCharacterAlreadyVerifiedEmbed,
    buildRegistrationSuccessEmbed,
    buildRegistrationWithWarningEmbed,
    buildPlayerSelectionEmbed,
    CharacterView,
} from '@/features/tracer/embeds';
import { tracerI18n } from '@/features/tracer/i18n';

// Date fixe pour que les embeds avec .setTimestamp() soient déterministes
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

const fr = tracerI18n.for('fr');
const en = tracerI18n.for('en');

const DBCIDE: CharacterView = { name: 'DBcide', killFame: 1_500_000, guildName: 'Sunfall', allianceName: 'RIOT' };
const DBCIDE_NO_GUILD: CharacterView = { name: 'DBcide', killFame: 1_500_000, guildName: null, allianceName: null };

describe('RegisterEmbeds', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_DATE);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    // ─── buildCharactersSummaryEmbed() ────────────────────────────────────────

    describe('buildCharactersSummaryEmbed()', () => {
        it('[snapshot] liste vide → affiche "Aucun personnage enregistré."', () => {
            const embed = buildCharactersSummaryEmbed(fr, []);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] un personnage non vérifié', () => {
            const embed = buildCharactersSummaryEmbed(fr, [{ ...DBCIDE, isVerified: false }]);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] un personnage vérifié → affiche 🔒', () => {
            const embed = buildCharactersSummaryEmbed(fr, [{ ...DBCIDE, isVerified: true }]);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] plusieurs personnages → numérotés et séparés', () => {
            const embed = buildCharactersSummaryEmbed(fr, [
                { name: 'DBcide', killFame: 1_500_000, isVerified: true },
                { name: 'AltDBcide', killFame: 250_000, isVerified: false },
                { name: 'CraftDBcide', killFame: 0, isVerified: false },
            ]);
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildVerificationInstructionsEmbed() ─────────────────────────────────

    describe('buildVerificationInstructionsEmbed()', () => {
        it('[snapshot] embed d\'instructions avec nom de personnage et discord ID', () => {
            const embed = buildVerificationInstructionsEmbed(fr, 'DBcide', '506045516421791744');
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildVerificationWarningEmbed() ──────────────────────────────────────

    describe('buildVerificationWarningEmbed()', () => {
        it('[snapshot] embed d\'avertissement avec discord ID', () => {
            const embed = buildVerificationWarningEmbed(fr, '506045516421791744');
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildCharacterAlreadyVerifiedEmbed() ─────────────────────────────────

    describe('buildCharacterAlreadyVerifiedEmbed()', () => {
        it('[snapshot] sans paramètres optionnels → pas de champs additionnels', () => {
            const embed = buildCharacterAlreadyVerifiedEmbed(fr, '506045516421791744');
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] avec tous les paramètres optionnels', () => {
            const embed = buildCharacterAlreadyVerifiedEmbed(fr, '506045516421791744', DBCIDE);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] avec playerName mais sans guildName → affiche "Aucune"', () => {
            const embed = buildCharacterAlreadyVerifiedEmbed(fr, '506045516421791744', DBCIDE_NO_GUILD);
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildRegistrationSuccessEmbed() ──────────────────────────────────────

    describe('buildRegistrationSuccessEmbed()', () => {
        it('[snapshot] avec guilde et alliance', () => {
            const embed = buildRegistrationSuccessEmbed(fr, '506045516421791744', DBCIDE);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] sans guilde ni alliance → affiche "Aucune"', () => {
            const embed = buildRegistrationSuccessEmbed(fr, '506045516421791744', DBCIDE_NO_GUILD);
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildRegistrationWithWarningEmbed() ──────────────────────────────────

    describe('buildRegistrationWithWarningEmbed()', () => {
        it('[snapshot] avec revendications multiples', () => {
            const embed = buildRegistrationWithWarningEmbed(
                fr, '506045516421791744', DBCIDE, ['111111111111111111', '222222222222222222']
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[snapshot] sans guilde ni alliance → affiche "Aucune"', () => {
            const embed = buildRegistrationWithWarningEmbed(
                fr, '506045516421791744', DBCIDE_NO_GUILD, ['111111111111111111']
            );
            expect(embed.toJSON()).toMatchSnapshot();
        });
    });

    // ─── buildPlayerSelectionEmbed() ──────────────────────────────────────────

    describe('buildPlayerSelectionEmbed()', () => {
        it('[snapshot] liste numérotée des joueurs trouvés', () => {
            const embed = buildPlayerSelectionEmbed(fr, [DBCIDE, { name: 'DBcide2', killFame: 999 }]);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[extrême] n\'affiche que 25 joueurs (limite du menu Discord)', () => {
            const players = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, killFame: i }));
            const description = buildPlayerSelectionEmbed(fr, players).toJSON().description!;

            expect(description).toContain('**25.** P24');
            expect(description).not.toContain('**26.**');
        });
    });

    // ─── Traduction ───────────────────────────────────────────────────────────

    describe('traduction', () => {
        it('[snapshot] embed d\'enregistrement en anglais', () => {
            const embed = buildRegistrationSuccessEmbed(en, '506045516421791744', DBCIDE_NO_GUILD);
            expect(embed.toJSON()).toMatchSnapshot();
        });

        it('[positif] la langue change le texte mais pas la couleur', () => {
            const frEmbed = buildCharacterAlreadyVerifiedEmbed(fr, '1').toJSON();
            const enEmbed = buildCharacterAlreadyVerifiedEmbed(en, '1').toJSON();

            expect(enEmbed.title).toBe('❌ Character already verified');
            expect(enEmbed.title).not.toBe(frEmbed.title);
            expect(enEmbed.color).toBe(frEmbed.color);
        });
    });
});

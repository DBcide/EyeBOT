import { Locale as DiscordLocale } from 'discord.js';
import {
    TranslationCatalog,
    commonTranslations,
    createFeatureTranslations,
    fromDiscordLocale,
    isSupportedLocale,
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
} from '@/shared/i18n';
import { ServiceContainer } from '@/shared/services/ServiceContainer';

// Catalogue de test : l'anglais est volontairement incomplet (clé "onlyFr" absente)
// pour vérifier le repli sur la langue par défaut
const catalogs = {
    fr: {
        greeting: 'Bonjour {name}',
        lines: ['Ligne 1', 'Ligne 2 : {value}'],
        nested: { deep: { key: 'Profond' } },
        onlyFr: 'Seulement en français',
    },
    en: {
        greeting: 'Hello {name}',
        lines: ['Line 1', 'Line 2: {value}'],
        nested: { deep: { key: 'Deep' } },
    },
} as any;

describe('TranslationCatalog', () => {
    const i18n = new TranslationCatalog<typeof catalogs.fr>(catalogs);

    describe('forLocale(locale)', () => {
        it('[positif] traduit une clé simple dans la langue demandée', () => {
            expect(i18n.forLocale('fr')('greeting', { name: 'DBcide' })).toBe('Bonjour DBcide');
            expect(i18n.forLocale('en')('greeting', { name: 'DBcide' })).toBe('Hello DBcide');
        });

        it('[positif] lit une clé imbriquée ("a.b.c")', () => {
            expect(i18n.forLocale('en')('nested.deep.key')).toBe('Deep');
        });

        it('[positif] joint les tableaux avec des retours à la ligne', () => {
            expect(i18n.forLocale('fr')('lines', { value: 42 })).toBe('Ligne 1\nLigne 2 : 42');
        });

        it('[extrême] retombe sur la langue par défaut si la clé manque dans la langue demandée', () => {
            expect(i18n.forLocale('en')('onlyFr')).toBe('Seulement en français');
        });

        it('[extrême] laisse visible un placeholder sans paramètre', () => {
            expect(i18n.forLocale('fr')('greeting')).toBe('Bonjour {name}');
            expect(i18n.forLocale('fr')('greeting', {})).toBe('Bonjour {name}');
        });

        it('[extrême] ne réinterprète pas un paramètre qui contient lui-même un placeholder', () => {
            expect(i18n.forLocale('fr')('greeting', { name: '{name}' })).toBe('Bonjour {name}');
        });

        it('[extrême] retourne la clé brute et logue un avertissement si elle n\'existe nulle part', () => {
            const warn = jest.spyOn(ServiceContainer.getInstance().logger, 'warn').mockImplementation(() => {});

            expect(i18n.forLocale('en')('inconnue.cle' as any)).toBe('inconnue.cle');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('inconnue.cle'), 'i18n');
        });

        it('[extrême] une clé qui désigne un groupe (pas un texte) est traitée comme introuvable', () => {
            jest.spyOn(ServiceContainer.getInstance().logger, 'warn').mockImplementation(() => {});

            expect(i18n.forLocale('fr')('nested' as any)).toBe('nested');
            expect(i18n.forLocale('fr')('greeting.trop.profond' as any)).toBe('greeting.trop.profond');
        });
    });

    describe('default()', () => {
        it('[positif] traduit dans la langue par défaut', () => {
            expect(i18n.defaultText('greeting', { name: 'X' })).toBe('Bonjour X');
        });
    });

    describe('localizations()', () => {
        it('[positif] génère une entrée par locale Discord des langues non par défaut', () => {
            expect(i18n.discordLocalizations('nested.deep.key')).toEqual({
                [DiscordLocale.EnglishUS]: 'Deep',
                [DiscordLocale.EnglishGB]: 'Deep',
            });
        });

        it('[extrême] n\'inclut pas la langue par défaut (déjà la description principale)', () => {
            expect(i18n.discordLocalizations('greeting')).not.toHaveProperty(DiscordLocale.French);
        });
    });
});

describe('catalogues communs', () => {
    it('[positif] commonTranslations traduit les clés common.*', () => {
        expect(commonTranslations.forLocale('en')('common.menu.timeout')).toBe('⏱️ Time is up. Please run the command again.');
    });

    it('[positif] createFeatureTranslations donne accès aux clés de la feature et aux clés communes', () => {
        const feature = createFeatureTranslations({ fr: { hello: 'Salut' }, en: { hello: 'Hi' } });

        expect(feature.forLocale('en')('hello')).toBe('Hi');
        expect(feature.forLocale('fr')('common.menu.notForYou')).toBe('❌ Ce menu ne vous est pas destiné.');
    });
});

describe('locales', () => {
    it('[positif] le français est la langue par défaut et fait partie des langues supportées', () => {
        expect(DEFAULT_LOCALE).toBe('fr');
        expect(SUPPORTED_LOCALES).toEqual(expect.arrayContaining(['fr', 'en']));
    });

    describe('isSupportedLocale()', () => {
        it.each([['fr', true], ['en', true], ['de', false], [42, false], [undefined, false]])(
            '[positif] %p → %p', (value, expected) => {
                expect(isSupportedLocale(value)).toBe(expected);
            }
        );

        it('[extrême] refuse les propriétés héritées d\'Object (ex: "toString")', () => {
            expect(isSupportedLocale('toString')).toBe(false);
        });
    });

    describe('fromDiscordLocale()', () => {
        it.each([
            ['fr', 'fr'],
            ['en-US', 'en'],
            ['en-GB', 'en'],
            ['en-AU', 'en'],   // pas dans la liste explicite → repli sur la langue de base
            ['ja', null],
            ['es-ES', null],
            [null, null],
            [undefined, null],
            ['', null],
        ])('[positif] %p → %p', (discordLocale, expected) => {
            expect(fromDiscordLocale(discordLocale)).toBe(expected);
        });
    });
});

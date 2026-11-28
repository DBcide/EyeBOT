import { embedGenerator } from '../../../tools/generators/embed/generator';
import { generateBuilderFunction, generateTestBlock } from '../../../tools/generators/embed/codegen';
import { buildPreviewEmbed } from '../../../tools/generators/embed/preview';
import { validateUrl } from '../../../tools/generators/embed/validate';
import { dataFields } from '../../../tools/generators/embed/spec';
import { SpecValidationError } from '../../../tools/generators/shared/input';
import { GeneratorContext } from '../../../tools/generators/shared/text';
import { createContext, createFixtureProject, plannedContent, plannedFiles, removeFixture, withAnswers } from './fixture';

const PROFILE_ANSWERS = [
    '2', 'profile', 'profile card', '', 'Fiche de profil', 'n', // feature tracer, nouveau fichier, sans traduction
    '', '6', // couleur Info
    'n', // auteur
    '', 'Profil de {name}', 'n', // titre sans lien
    '', 'Ligne 1', '{killFame}', '.', // description
    'o', '2', 'avatarUrl', 'n', // miniature dynamique optionnelle
    'o', 'stats', 'Stats', 'PvP : {pvp}', '.', 'o', 'n', // un champ en ligne
    'n', 'n', // image, pied de page
    'o', '1', // horodatage maintenant
    '1', '2', '1', // types : name string, killFame number, pvp string
];

const PROFILE_SPEC = {
    feature: 'tracer',
    file: 'Profile',
    name: 'ProfileCard',
    summary: 'Fiche de profil',
    color: 'Info',
    title: { fr: '\u{1F50D} Profil de {name}', en: '\u{1F50D} {name}\'s profile' },
    description: { fr: ['Ligne 1', '{killFame}'], en: 'Line 1' },
    thumbnail: { data: 'avatarUrl', optional: true },
    fields: [{ key: 'stats', name: 'Stats', value: '{pvp}', inline: true }],
    timestamp: 'now',
    placeholders: { killFame: 'number' },
};

describe('generators/embed', () => {
    let root: string;
    let context: GeneratorContext;

    beforeEach(() => {
        root = createFixtureProject();
        context = createContext(root);
    });

    afterEach(() => removeFixture(root));

    describe('mode interactif', () => {
        it('[positif] l\'assistant construit la description complète de l\'embed', async () => {
            const spec = await withAnswers(PROFILE_ANSWERS, (prompter) => embedGenerator.interactive(prompter, context));

            expect(spec).toMatchObject({
                feature: 'tracer',
                fileBaseName: 'Profile',
                embedName: 'ProfileCard',
                keyPrefix: 'profile.card',
                color: { name: 'Info', isNew: false },
                thumbnail: { kind: 'dynamic', field: 'avatarUrl', optional: true },
                timestamp: { kind: 'now' },
            });
            expect(spec.description!.values.fr).toEqual(['Ligne 1', '{killFame}']);
            expect(spec.title!.untranslated).toEqual(['en', 'es']);
            expect(dataFields(spec).map((field) => `${field.name}:${field.type}`)).toEqual([
                'name:string', 'killFame:number', 'pvp:string', 'avatarUrl:string',
            ]);
        });

        it('[extrême] les réponses invalides sont redemandées (clé existante, URL refusée)', async () => {
            const answers = [...PROFILE_ANSWERS];
            answers.splice(3, 1, 'labels.none', 'profile.card');
            const thumbnail = answers.indexOf('avatarUrl');
            answers.splice(thumbnail - 1, 3, '1', 'ftp://nope', 'https://example.com/a.png');

            const spec = await withAnswers(answers, (prompter) => embedGenerator.interactive(prompter, context));

            expect(spec.keyPrefix).toBe('profile.card');
            expect(spec.thumbnail).toEqual({ kind: 'static', url: 'https://example.com/a.png' });
        });

        it('[extrême] entrée interrompue → abandon', async () => {
            await expect(withAnswers(['2', 'profile'], (prompter) => embedGenerator.interactive(prompter, context)))
                .rejects.toThrow('Saisie interrompue');
        });
    });

    describe('spec JSON', () => {
        it('[positif] une spec valide prépare tous les fichiers sans rien écrire', () => {
            const spec = embedGenerator.fromInput(PROFILE_SPEC, '', context);
            const report = embedGenerator.plan(spec, context);

            expect(plannedFiles(context)).toEqual([
                '~ src/features/tracer/locales/fr.json',
                '~ src/features/tracer/locales/en.json',
                '~ src/features/tracer/locales/es.json',
                '+ src/features/tracer/embeds/types.ts',
                '+ src/features/tracer/embeds/ProfileEmbeds.ts',
                '+ src/features/tracer/embeds/index.ts',
                '+ tests/features/tracer/embeds/ProfileEmbeds.test.ts',
            ]);
            expect(plannedContent(context, 'src/features/tracer/locales/en.json')).toContain('"description": [\n        "Line 1"\n      ]');
            expect(plannedContent(context, 'src/features/tracer/locales/fr.json')).toContain('"title": "\\uD83D\\uDD0D Profil de {name}"');
            expect(report.notes.join('\n')).toContain('es: profile.card.title');
            expect(report.notes.join('\n')).not.toContain('statsValue'); // "{pvp}" : rien à traduire
        });

        it('[positif] une feature inconnue est créée avec son architecture', () => {
            embedGenerator.plan(embedGenerator.fromInput({ ...PROFILE_SPEC, feature: 'encyclopedia' }, '', context), context);

            const files = plannedFiles(context);
            expect(files).toContain('+ src/features/encyclopedia/translations.ts');
            expect(files).toContain('+ src/features/encyclopedia/services/.gitkeep');
            expect(files).not.toContain('+ src/features/encyclopedia/embeds/.gitkeep');
        });

        it('[extrême] toutes les erreurs sont renvoyées ensemble, avec leur chemin', () => {
            const invalid = { ...PROFILE_SPEC, titel: 'x', color: 'Pink', thumbnail: 'ftp://x', keyPrefix: 'labels.none' };

            try {
                embedGenerator.fromInput(invalid, '[3]', context);
                throw new Error('aucune erreur levée');
            } catch (error) {
                expect(error).toBeInstanceOf(SpecValidationError);
                const messages = (error as SpecValidationError).errors.join('\n');
                expect(messages).toContain('[3].titel : propriété inconnue');
                expect(messages).toContain('[3].color : couleur inconnue');
                expect(messages).toContain('[3].thumbnail : l\'URL doit commencer');
                expect(messages).toContain('[3].keyPrefix : "labels.none" existe déjà');
            }
        });

        it('[extrême] un texte au-delà des limites Discord est refusé', () => {
            expect(() => embedGenerator.fromInput({ ...PROFILE_SPEC, title: 'x'.repeat(257) }, '', context)).toThrow('257 caractères');
        });

        it('[extrême] un placeholder ne peut pas reprendre le nom d\'une URL dynamique', () => {
            const spec = { ...PROFILE_SPEC, title: 'Profil de {avatarUrl}' };

            expect(() => embedGenerator.fromInput(spec, '', context)).toThrow('"avatarUrl" est utilisé à la fois');
        });

        it('[positif] une nouvelle couleur est ajoutée à EmbedColors', () => {
            const spec = embedGenerator.fromInput({ ...PROFILE_SPEC, color: { name: 'Legendary', hex: '#9b59b6', comment: 'Objet légendaire' } }, '', context);
            embedGenerator.plan(spec, context);

            expect(plannedContent(context, 'src/shared/embeds/EmbedColors.ts')).toContain("    /** Objet légendaire */\n    Legendary: '#9B59B6',\n} as const;");
        });
    });

    describe('code généré', () => {
        it('[positif] respecte la convention des builders', () => {
            const spec = embedGenerator.fromInput(PROFILE_SPEC, '', context);
            const code = generateBuilderFunction(spec, 'TracerTranslator');

            expect(code).toContain('export function buildProfileCardEmbed(translate: TracerTranslator, data: ProfileCardEmbedData): EmbedBuilder {');
            expect(code).toContain(".setTitle(translate('profile.card.title', { name: data.name }))");
            expect(code).toContain('.setThumbnail(data.avatarUrl ?? null)');
            expect(code).toContain("value: truncateField(translate('profile.card.statsValue', { pvp: data.pvp })),"); // valeur dynamique tronquée
            expect(code).toMatch(/\.setTimestamp\(\);\n\}$/);
            expect(generateTestBlock(spec, 'tracerTranslations')).toContain('expect(embed.thumbnail).toBeUndefined();');
        });

        it('[extrême] l\'aperçu discord.js refuse un champ trop long', () => {
            const spec = embedGenerator.fromInput(PROFILE_SPEC, '', context);
            spec.fields[0].value.values.fr = 'x'.repeat(1025);

            expect(() => buildPreviewEmbed(spec, 'fr', 'fr')).toThrow();
        });

        it('[extrême] seules les URLs http(s) et attachment:// sont acceptées', () => {
            expect(validateUrl('https://example.com/a.png')).toBeNull();
            expect(validateUrl('attachment://a.png')).toBeNull();
            expect(validateUrl('ftp://example.com')).not.toBeNull();
            expect(validateUrl('pas une url')).not.toBeNull();
        });
    });
});

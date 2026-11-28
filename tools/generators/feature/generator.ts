import path from 'node:path';
import { Generator } from '../shared/generator';
import { InputReader, SpecValidationError, throwIfErrors } from '../shared/input';
import { Prompter } from '../shared/Prompter';
import { GITKEEP, isFeatureInitialized, listFeatures, paths } from '../shared/project';
import { CAMEL_CASE, toCamelCase, toPascalCase } from '../shared/naming';
import { serializeLocale } from '../shared/localeJson';
import { ensureTranslatorType } from '../shared/sourceEdit';
import { GeneratorContext, localeFile } from '../shared/text';
import { style } from '../shared/terminal';

/**
 * Générateur de feature : `npm run create:feature`
 *
 * Crée l'architecture d'une feature (cf. CLAUDE.md "Feature Organization") :
 * dossiers gardés dans git par un `.gitkeep`, fichiers de langue vides et `translations.ts`.
 */

/** Dossiers standards d'une feature, dans l'ordre de CLAUDE.md */
export const FEATURE_FOLDERS = ['commands', 'components', 'embeds', 'events', 'handlers', 'models', 'services', 'utils'] as const;
export type FeatureFolder = (typeof FEATURE_FOLDERS)[number];

export interface FeatureSpec {
    name: string;
    folders: FeatureFolder[];
}

/** Noms dérivés de la feature (ex: 'groupMaker' → GroupMakerTranslator, groupMakerTranslations) */
export function featureNames(feature: string) {
    const pascal = toPascalCase(feature);
    return {
        pascal,
        messagesType: `${pascal}Messages`,
        translatorType: `${pascal}Translator`,
        translationsName: `${toCamelCase(feature)}Translations`,
    };
}

function localeIdentifier(locale: string): string {
    return locale.replace(/\W/g, '_');
}

/** `translations.ts` d'une nouvelle feature (même forme que celui du tracer) */
function translationsFile(feature: string, locales: readonly string[]): string {
    const names = featureNames(feature);
    const identifiers = locales.map(localeIdentifier);
    return [
        ...locales.map((locale, index) => `import ${identifiers[index]} from './locales/${locale}.json';`),
        'import { CommonMessages, Locale, Translator, createFeatureTranslations } from \'../../shared/i18n\';',
        '',
        `/** Forme du catalogue ${feature}, déduite du fichier de la langue de référence (${locales[0]}) */`,
        `export type ${names.messagesType} = typeof ${identifiers[0]};`,
        '',
        '/** Un catalogue par langue : une clé oubliée dans une langue fait échouer la compilation */',
        `const catalogs: Record<Locale, ${names.messagesType}> = { ${identifiers.join(', ')} };`,
        '',
        `/** Traductions de la feature ${feature} (+ clés \`common.*\`) */`,
        `export const ${names.translationsName} = createFeatureTranslations(catalogs);`,
        '',
        '/** Fonction `translate(key, params)` de la feature, passée aux builders d\'embeds et de menus */',
        `export type ${names.translatorType} = Translator<CommonMessages & ${names.messagesType}>;`,
        '',
    ].join('\n');
}

/** Valide le nom d'une nouvelle feature */
export function checkNewFeatureName(name: string, context: GeneratorContext): string | null {
    if (!CAMEL_CASE.test(name)) return 'nom camelCase ASCII attendu (ex: groupMaker)';
    return isFeatureInitialized(context.changes, context.root, name) ? `la feature "${name}" existe déjà` : null;
}

/** Prévoit la création de la feature (dossiers + .gitkeep, langues, translations.ts) */
export function planFeature(spec: FeatureSpec, context: GeneratorContext): void {
    const featureDir = paths.feature(context.root, spec.name);
    for (const folder of spec.folders) {
        const directory = path.join(featureDir, folder);
        if (context.changes.listDir(directory).length === 0) {
            context.changes.write(path.join(directory, GITKEEP), '');
        }
    }

    const ordered = [context.defaultLocale, ...context.locales.filter((locale) => locale !== context.defaultLocale)];
    for (const locale of ordered) {
        const file = localeFile(context.root, spec.name, locale);
        if (context.changes.read(file) === null) context.changes.write(file, serializeLocale({}));
    }
    context.changes.write(path.join(featureDir, 'translations.ts'), translationsFile(spec.name, ordered));
}

/**
 * Garantit qu'une feature est prête à recevoir des textes traduits
 *
 * @remarks
 * Feature inexistante → architecture complète créée ; feature existante sans type
 * `<Feature>Translator` (ex: settings) → type ajouté à son `translations.ts`.
 *
 * @returns Les noms à importer depuis `../translations`
 */
export function ensureFeature(context: GeneratorContext, feature: string): ReturnType<typeof featureNames> {
    const names = featureNames(feature);
    const file = path.join(paths.feature(context.root, feature), 'translations.ts');
    const current = context.changes.read(file);

    if (current === null) {
        planFeature({ name: feature, folders: [...FEATURE_FOLDERS] }, context);
        return names;
    }
    const updated = ensureTranslatorType(current, names.pascal);
    context.changes.write(file, updated.source);
    return { ...names, translatorType: updated.typeName };
}

/** Feature existante (initialisée ou non) ou nouvelle : valide le nom pour les autres générateurs */
export function checkFeatureReference(name: string): string | null {
    return CAMEL_CASE.test(name) ? null : 'nom de feature camelCase attendu (ex: tracer)';
}

/** Choix interactif d'une feature existante ou nouvelle (utilisé par les autres générateurs) */
export async function askFeature(
    prompter: Prompter,
    context: GeneratorContext,
    question: string
): Promise<string> {
    const features = listFeatures(context.changes, context.root);
    const feature = await prompter.choose<string | null>(question, [
        ...features.map((name) => ({
            label: name,
            value: name,
            hint: isFeatureInitialized(context.changes, context.root, name) ? undefined : 'non initialisée : architecture créée',
        })),
        { label: 'Nouvelle feature', value: null, hint: 'architecture complète créée' },
    ]);
    if (feature) return feature;
    return prompter.text('Nom de la nouvelle feature (camelCase, ex: groupMaker)', {
        validate: (value) => checkNewFeatureName(value, context),
    });
}

export const featureGenerator: Generator<FeatureSpec> = {
    type: 'feature',
    description: 'architecture d\'une feature (dossiers + .gitkeep, locales, translations.ts)',
    specHelp: [
        '{ "name": "encyclopedia",              // camelCase, nouvelle feature (un dossier vide existant est accepté)',
        `  "folders": ["commands", "embeds"] }   // optionnel, défaut : ${FEATURE_FOLDERS.join(', ')}`,
    ].join('\n'),
    example: { type: 'feature', name: 'encyclopedia', folders: ['commands', 'components', 'embeds', 'services'] },

    async interactive(prompter, context) {
        const name = await prompter.text('Nom de la feature (camelCase, ex: encyclopedia)', {
            validate: (value) => checkNewFeatureName(value, context),
        });
        FEATURE_FOLDERS.forEach((folder, index) => prompter.say(`  ${style.bold(String(index + 1))}. ${folder}`));
        const excluded = await prompter.text('Dossiers à NE PAS créer (numéros séparés par des virgules, vide = tous)', {
            allowEmpty: true,
            validate: (value) => (/^\s*\d+(\s*,\s*\d+)*\s*$/.test(value) ? null : 'Exemple : 2,5'),
        });
        const skipped = new Set(excluded.split(',').map((part) => Number(part.trim()) - 1));
        return { name, folders: FEATURE_FOLDERS.filter((_, index) => !skipped.has(index)) };
    },

    fromInput(raw, where, context) {
        const errors: string[] = [];
        const input = InputReader.of(raw, where, errors);
        if (!input) throw new SpecValidationError(errors);
        input.allowOnly(['type', 'name', 'folders']);

        const name = input.string('name', { required: true, validate: (value) => checkNewFeatureName(value, context) });
        const folders = input.has('folders') ? input.array('folders') : [...FEATURE_FOLDERS];
        folders.forEach((folder, index) => {
            if (!FEATURE_FOLDERS.includes(folder as FeatureFolder)) {
                errors.push(`${input.path('folders')}[${index}] : dossier attendu parmi ${FEATURE_FOLDERS.join(', ')}`);
            }
        });
        throwIfErrors(errors);
        return { name: name!, folders: folders as FeatureFolder[] };
    },

    plan(spec, context) {
        planFeature(spec, context);
        return {
            usage: `import { ${featureNames(spec.name).translationsName} } from '../translations';`,
            notes: ['Ajouter ensuite embeds / components / commandes : npm run create:embed | create:component | create:command'],
        };
    },
};

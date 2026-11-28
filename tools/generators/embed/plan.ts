import path from 'node:path';
import { paths } from '../shared/project';
import { addPaletteColor, appendBlock, ensureExportStar, ensureNamedImports } from '../shared/sourceEdit';
import { GeneratorContext, planTexts } from '../shared/text';
import { ensureFeature } from '../feature/generator';
import {
    generateBuilderFunction,
    generateDataInterface,
    generateEmbedFileHeader,
    generateIndexHeader,
    generateTestBlock,
    generateTypesHeader,
    requiredImports,
} from './codegen';
import { EmbedSpec, dataTypeName, functionName, textElements } from './spec';

/**
 * Prépare toutes les modifications de fichiers d'un embed (rien n'est écrit sur le disque)
 *
 * Fichiers concernés :
 * - architecture de la feature si elle n'existe pas encore (cf. feature/generator)
 * - `locales/<langue>.json` de la feature (textes)
 * - `translations.ts` (type `<Feature>Translator` ajouté si absent)
 * - `shared/embeds/EmbedColors.ts` (nouvelle couleur)
 * - `embeds/types.ts`, `embeds/<Nom>Embeds.ts`, `embeds/index.ts`
 * - `tests/features/<feature>/embeds/<Nom>Embeds.test.ts`
 */

function planColor(spec: EmbedSpec, context: GeneratorContext): void {
    if (!spec.color?.isNew) return;
    const file = paths.embedColors(context.root);
    const current = context.changes.read(file);
    if (current === null) throw new Error(`Fichier introuvable : ${file}`);
    context.changes.write(file, addPaletteColor(current, spec.color));
}

function planEmbedSources(spec: EmbedSpec, context: GeneratorContext, translatorType: string): void {
    const embedsDir = path.join(paths.feature(context.root, spec.feature), 'embeds');
    const indexFile = path.join(embedsDir, 'index.ts');
    let index = context.changes.read(indexFile) ?? `${generateIndexHeader(spec.feature)}\n`;

    const dataInterface = generateDataInterface(spec);
    if (dataInterface) {
        const typesFile = path.join(embedsDir, 'types.ts');
        const types = context.changes.read(typesFile) ?? `${generateTypesHeader()}\n`;
        context.changes.write(typesFile, appendBlock(types, dataInterface));
        index = ensureExportStar(index, './types');
    }

    const embedFile = path.join(embedsDir, `${spec.fileBaseName}Embeds.ts`);
    let source = context.changes.read(embedFile) ?? `${generateEmbedFileHeader(spec.fileBaseName)}\n`;
    for (const [moduleSpecifier, names] of Object.entries(requiredImports(spec, translatorType))) {
        source = ensureNamedImports(source, moduleSpecifier, names);
    }
    context.changes.write(embedFile, appendBlock(source, generateBuilderFunction(spec, translatorType)));

    context.changes.write(indexFile, ensureExportStar(index, `./${spec.fileBaseName}Embeds`));
}

function planTests(spec: EmbedSpec, context: GeneratorContext, translationsName: string): void {
    const file = path.join(paths.featureTests(context.root, spec.feature), 'embeds', `${spec.fileBaseName}Embeds.test.ts`);
    let source = context.changes.read(file) ?? '';

    const embedImports = generateDataInterface(spec) ? [functionName(spec), dataTypeName(spec)] : [functionName(spec)];
    source = ensureNamedImports(source, `@/features/${spec.feature}/embeds`, embedImports);
    source = ensureNamedImports(source, `@/features/${spec.feature}/translations`, [translationsName]);
    source = ensureNamedImports(source, '@/shared/i18n', ['SUPPORTED_LOCALES']);

    context.changes.write(file, appendBlock(source, generateTestBlock(spec, translationsName)));
}

/** Applique toutes les modifications de l'embed au FileChangeSet du contexte */
export function planEmbed(spec: EmbedSpec, context: GeneratorContext): { translationsName: string } {
    const names = ensureFeature(context, spec.feature);
    planTexts(context, spec.feature, spec.keyPrefix, textElements(spec));
    planColor(spec, context);
    planEmbedSources(spec, context, names.translatorType);
    planTests(spec, context, names.translationsName);
    return { translationsName: names.translationsName };
}

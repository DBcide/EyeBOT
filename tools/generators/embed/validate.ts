import path from 'node:path';
import { ProjectView, listFeatureFiles, paths } from '../shared/project';
import { CAMEL_CASE, PASCAL_CASE, toPascalCase } from '../shared/naming';
import { PaletteColor, listExportedFunctions, parsePalette } from '../shared/sourceEdit';
import { EmbedSpec, allPlaceholders, dataFields, textElements } from './spec';
import { buildPreviewEmbed } from './preview';

/**
 * Règles de validation d'un embed, communes au mode interactif et aux specs JSON
 */

/** Limites Discord des éléments d'un embed */
export const EMBED_LIMITS = {
    author: 256,
    title: 256,
    description: 4096,
    fieldName: 256,
    fieldValue: 1024,
    footer: 2048,
    fields: 25,
};

/** Valide une URL acceptée par Discord (http, https ou attachment://) */
export function validateUrl(value: string): string | null {
    try {
        const parsed = new URL(value);
        return ['http:', 'https:', 'attachment:'].includes(parsed.protocol)
            ? null
            : 'l\'URL doit commencer par http://, https:// ou attachment://';
    } catch {
        return 'URL invalide';
    }
}

/** "profile", "ProfileEmbeds", "ProfileEmbeds.ts" → "Profile" */
export function normalizeFileBaseName(value: string): string {
    return toPascalCase(value.replace(/Embeds?(\.ts)?$/i, ''));
}

/** "profile card", "ProfileCardEmbed" → "ProfileCard" */
export function normalizeEmbedName(value: string): string {
    return toPascalCase(value).replace(/Embed$/, '');
}

/** Fonctions déjà exportées par les fichiers `embeds/` de la feature */
export function existingBuilders(view: ProjectView, root: string, feature: string): string[] {
    const directory = path.join(paths.feature(root, feature), 'embeds');
    return listFeatureFiles(view, root, feature, 'embeds')
        .flatMap((file) => listExportedFunctions(view.read(path.join(directory, file)) ?? ''));
}

export function checkEmbedName(name: string, builders: string[]): string | null {
    if (!PASCAL_CASE.test(name)) return 'lettres et chiffres ASCII uniquement';
    return builders.includes(`build${name}Embed`) ? `build${name}Embed existe déjà dans cette feature` : null;
}

/** Préfixe de clés proposé : `<fichier>.<embed sans le préfixe du fichier>` (ex: profile.card) */
export function defaultKeyPrefix(fileBaseName: string, embedName: string): string {
    const lower = (value: string) => (value ? value[0].toLowerCase() + value.slice(1) : value);
    const rest = embedName.startsWith(fileBaseName) ? embedName.slice(fileBaseName.length) : embedName;
    return `${lower(fileBaseName)}.${lower(rest) || 'embed'}`;
}

/** Palette `EmbedColors` (modifications prévues comprises) */
export function readPalette(view: ProjectView, root: string): PaletteColor[] {
    return parsePalette(view.read(paths.embedColors(root)) ?? '');
}

export function checkColorName(name: string, palette: PaletteColor[]): string | null {
    if (!PASCAL_CASE.test(name)) return 'nom PascalCase ASCII attendu (ex: Legendary)';
    return palette.some((color) => color.name === name) ? `EmbedColors.${name} existe déjà` : null;
}

export function checkDynamicName(name: string, used: Set<string>): string | null {
    if (!CAMEL_CASE.test(name)) return 'nom camelCase attendu (ex: avatarUrl)';
    return used.has(name) ? `"${name}" est déjà utilisé par cet embed` : null;
}

/**
 * Vérifications globales d'un embed complet
 *
 * - au moins un élément visible, noms de données uniques, champs uniques
 * - construction réelle avec discord.js dans chaque langue (limites Discord)
 */
export function checkEmbedSpec(spec: EmbedSpec, locales: readonly string[], defaultLocale: string): string[] {
    const errors: string[] = [];
    if (!(spec.title || spec.description || spec.author || spec.footer || spec.image || spec.thumbnail || spec.fields.length > 0)) {
        errors.push('l\'embed doit contenir au moins un titre, une description, un champ, un auteur, un pied de page ou une image');
    }
    if (spec.fields.length > EMBED_LIMITS.fields) errors.push(`fields : ${EMBED_LIMITS.fields} champs maximum`);

    const keys = textElements(spec).map((element) => element.key);
    const duplicateKey = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicateKey) errors.push(`clé de texte en double : ${duplicateKey}`);

    const names = dataFields(spec).map((field) => field.name);
    const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicateName) errors.push(`"${duplicateName}" est utilisé à la fois comme placeholder et comme URL/date dynamique`);

    const placeholders = allPlaceholders(spec);
    for (const name of Object.keys(spec.placeholderTypes)) {
        if (!placeholders.includes(name)) errors.push(`placeholders.${name} : aucun texte n'utilise {${name}}`);
    }

    if (errors.length === 0) {
        for (const locale of locales) {
            try {
                buildPreviewEmbed(spec, locale, defaultLocale);
            } catch (error) {
                errors.push(`refusé par discord.js [${locale}] : ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return errors;
}

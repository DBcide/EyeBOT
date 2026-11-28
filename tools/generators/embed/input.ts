import { InputReader, SpecValidationError, throwIfErrors } from '../shared/input';
import { EMOJI_CHAR } from '../shared/naming';
import { GeneratorContext, TextElement, checkKeyPrefix, readReferenceLocale, textFromInput } from '../shared/text';
import { checkFeatureReference } from '../feature/generator';
import { ColorSpec, EmbedSpec, FieldSpec, PlaceholderType, TimestampSource, UrlSource } from './spec';
import {
    EMBED_LIMITS,
    checkColorName,
    checkEmbedName,
    checkEmbedSpec,
    defaultKeyPrefix,
    existingBuilders,
    normalizeEmbedName,
    normalizeFileBaseName,
    readPalette,
    validateUrl,
} from './validate';

/**
 * Lecture d'une spec JSON d'embed (mode non interactif)
 */

export const EMBED_SPEC_HELP = `{
  "feature": "encyclopedia",          // camelCase ; architecture créée si la feature n'existe pas
  "file": "Item",                     // → embeds/ItemEmbeds.ts (créé ou complété)
  "name": "ItemDetails",              // → buildItemDetailsEmbed
  "keyPrefix": "item.details",        // optionnel (défaut : <file>.<name sans le préfixe file>)
  "summary": "Fiche d'un objet",      // JSDoc du builder (sans émoji)
  "color": "Info",                    // nom EmbedColors, ou { "name": "Legendary", "hex": "#9B59B6", "comment": "…" } (ajoutée)
  "author": { "name": TEXT, "iconUrl": URL, "url": URL },
  "title": TEXT, "url": URL,
  "description": TEXT,
  "thumbnail": URL, "image": URL,
  "fields": [{ "key": "stats", "name": TEXT, "value": TEXT, "inline": true }],   // clés → statsName / statsValue
  "footer": { "text": TEXT, "iconUrl": URL },
  "timestamp": "now",                 // ou { "data": "date", "optional": true }
  "placeholders": { "killFame": "number" }   // type des {placeholders} (défaut : string)
}
TEXT : "texte fr" | ["ligne 1", "ligne 2"] | { "fr": "…", "en": "…", "es": "…" }   (non traduit → recopié + signalé)
URL  : "https://…" (fixe) | { "data": "iconUrl", "optional": true } (fournie par la logique via data)
Tous les éléments sont optionnels sauf feature, file, name, summary et au moins un élément visible.`;

const TEXT_SPEC_KEYS = ['type', 'feature', 'file', 'name', 'keyPrefix', 'summary', 'color', 'author', 'title', 'url', 'description',
    'thumbnail', 'fields', 'image', 'footer', 'timestamp', 'placeholders'];

const noEmoji = (value: string) => (EMOJI_CHAR.test(value) ? 'pas d\'émoji (texte écrit dans le code)' : null);

function readUrl(input: InputReader, key: string): UrlSource | undefined {
    const raw = input.raw(key);
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'string') {
        const error = validateUrl(raw);
        if (error) input.errors.push(`${input.path(key)} : ${error}`);
        return { kind: 'static', url: raw };
    }
    const dynamic = InputReader.of(raw, input.path(key), input.errors);
    if (!dynamic) return undefined;
    dynamic.allowOnly(['data', 'optional']);
    const field = dynamic.string('data', { required: true, validate: (value) => (/^[a-z][a-zA-Z0-9]*$/.test(value) ? null : 'nom camelCase attendu') });
    return { kind: 'dynamic', field: field ?? '', optional: dynamic.boolean('optional', false) };
}

function readTimestamp(input: InputReader): TimestampSource | undefined {
    const raw = input.raw('timestamp');
    if (raw === undefined || raw === null || raw === false) return undefined;
    if (raw === 'now' || raw === true) return { kind: 'now' };
    const dynamic = InputReader.of(raw, input.path('timestamp'), input.errors);
    if (!dynamic) return undefined;
    dynamic.allowOnly(['data', 'optional']);
    const field = dynamic.string('data', { required: true });
    return { kind: 'dynamic', field: field ?? '', optional: dynamic.boolean('optional', false) };
}

function readColor(input: InputReader, context: GeneratorContext): ColorSpec | undefined {
    const raw = input.raw('color');
    if (raw === undefined || raw === null) return undefined;
    const palette = readPalette(context.changes, context.root);

    if (typeof raw === 'string') {
        const existing = palette.find((color) => color.name === raw);
        if (existing) return { name: existing.name, hex: existing.hex, isNew: false };
        input.errors.push(`${input.path('color')} : couleur inconnue (${palette.map((color) => color.name).join(', ')}) ; nouvelle couleur : { "name", "hex", "comment" }`);
        return undefined;
    }

    const color = InputReader.of(raw, input.path('color'), input.errors);
    if (!color) return undefined;
    color.allowOnly(['name', 'hex', 'comment']);
    const name = color.string('name', { required: true, validate: (value) => checkColorName(value, palette) });
    const hex = color.string('hex', { required: true, validate: (value) => (/^#[0-9A-Fa-f]{6}$/.test(value) ? null : 'format #RRGGBB attendu') });
    const comment = color.string('comment', { validate: noEmoji });
    return { name: name ?? '', hex: (hex ?? '').toUpperCase(), isNew: true, comment };
}

function readFields(input: InputReader, context: GeneratorContext): FieldSpec[] {
    return input.array('fields').flatMap((raw, index) => {
        const field = InputReader.of(raw, `${input.path('fields')}[${index}]`, input.errors);
        if (!field) return [];
        field.allowOnly(['key', 'name', 'value', 'inline']);
        const key = field.string('key', { validate: (value) => (/^[a-z][a-zA-Z0-9]*$/.test(value) ? null : 'camelCase attendu') }) ?? `field${index + 1}`;
        const name = textFromInput(field.raw('name'), `${key}Name`, field.path('name'), context, EMBED_LIMITS.fieldName, input.errors);
        const value = textFromInput(field.raw('value'), `${key}Value`, field.path('value'), context, EMBED_LIMITS.fieldValue, input.errors);
        return name && value ? [{ name, value, inline: field.boolean('inline', false) }] : [];
    });
}

function readPlaceholderTypes(input: InputReader): Record<string, PlaceholderType> {
    const raw = input.raw('placeholders');
    if (raw === undefined || raw === null) return {};
    const types = InputReader.of(raw, input.path('placeholders'), input.errors);
    if (!types) return {};
    const result: Record<string, PlaceholderType> = {};
    for (const name of Object.keys(raw as object)) {
        const type = types.oneOf(name, ['string', 'number'] as const);
        if (type) result[name] = type;
    }
    return result;
}

function readText(input: InputReader, key: string, maxLength: number, context: GeneratorContext, textKey = key): TextElement | undefined {
    if (!input.has(key)) return undefined;
    return textFromInput(input.raw(key), textKey, input.path(key), context, maxLength, input.errors);
}

/**
 * Valide une spec JSON d'embed et la convertit en spec interne
 *
 * @throws SpecValidationError avec toutes les erreurs trouvées
 */
export function embedFromInput(raw: unknown, where: string, context: GeneratorContext): EmbedSpec {
    const errors: string[] = [];
    const input = InputReader.of(raw, where, errors);
    if (!input) throw new SpecValidationError(errors);
    input.allowOnly(TEXT_SPEC_KEYS);

    const feature = input.string('feature', { required: true, validate: checkFeatureReference }) ?? '';
    const fileBaseName = normalizeFileBaseName(input.string('file', { required: true }) ?? '');
    const builders = feature ? existingBuilders(context.changes, context.root, feature) : [];
    const embedName = normalizeEmbedName(input.string('name', { required: true }) ?? '');
    const nameError = embedName ? checkEmbedName(embedName, builders) : null;
    if (nameError) errors.push(`${input.path('name')} : ${nameError}`);

    const reference = feature ? readReferenceLocale(context.changes, context, feature) : {};
    const keyPrefix = input.string('keyPrefix', { validate: (value) => checkKeyPrefix(value, reference) })
        ?? defaultKeyPrefix(fileBaseName, embedName);
    if (!input.has('keyPrefix') && fileBaseName && embedName) {
        const prefixError = checkKeyPrefix(keyPrefix, reference);
        if (prefixError) errors.push(`${input.path('keyPrefix')} (défaut "${keyPrefix}") : ${prefixError}`);
    }

    const spec: EmbedSpec = {
        feature,
        fileBaseName,
        embedName,
        keyPrefix,
        summary: input.string('summary', { required: true, validate: noEmoji }) ?? '',
        color: readColor(input, context),
        title: readText(input, 'title', 256, context),
        url: readUrl(input, 'url'),
        description: readText(input, 'description', 4096, context),
        thumbnail: readUrl(input, 'thumbnail'),
        fields: readFields(input, context),
        image: readUrl(input, 'image'),
        timestamp: readTimestamp(input),
        placeholderTypes: readPlaceholderTypes(input),
    };

    const author = input.has('author') ? InputReader.of(input.raw('author'), input.path('author'), errors) : null;
    if (author) {
        author.allowOnly(['name', 'iconUrl', 'url']);
        const name = textFromInput(author.raw('name'), 'author', author.path('name'), context, EMBED_LIMITS.author, errors);
        if (name) spec.author = { name, iconUrl: readUrl(author, 'iconUrl'), url: readUrl(author, 'url') };
    }
    const footer = input.has('footer') ? InputReader.of(input.raw('footer'), input.path('footer'), errors) : null;
    if (footer) {
        footer.allowOnly(['text', 'iconUrl']);
        const text = textFromInput(footer.raw('text'), 'footer', footer.path('text'), context, EMBED_LIMITS.footer, errors);
        if (text) spec.footer = { text, iconUrl: readUrl(footer, 'iconUrl') };
    }

    throwIfErrors(errors);
    throwIfErrors(checkEmbedSpec(spec, context.locales, context.defaultLocale).map((error) => `${where || 'embed'} : ${error}`));
    return spec;
}

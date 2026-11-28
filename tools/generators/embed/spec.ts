import { TextElement, elementPlaceholders } from '../shared/text';

export type { TextElement } from '../shared/text';

/**
 * Description d'un embed à générer (résultat des questions du terminal)
 *
 * Correspond aux éléments modifiables d'un EmbedBuilder discord.js :
 * couleur, auteur, titre (+ lien), description, miniature, champs, image,
 * pied de page, horodatage. `provider` et `video` n'existent que sur les embeds
 * reçus (générés par Discord) : un bot ne peut pas les définir.
 */

/**
 * Source d'une URL (lien, image, icône)
 * - static : URL fixe écrite dans le code
 * - dynamic : fournie par la logique via l'objet `data` (`optional` → peut être absente)
 */
export type UrlSource =
    | { kind: 'static'; url: string }
    | { kind: 'dynamic'; field: string; optional: boolean };

export type TimestampSource =
    | { kind: 'now' }
    | { kind: 'dynamic'; field: string; optional: boolean };

export interface ColorSpec {
    /** Nom dans EmbedColors (ex: 'Info') */
    name: string;
    hex: string;
    /** true → la couleur est ajoutée à EmbedColors.ts */
    isNew: boolean;
    comment?: string;
}

export interface FieldSpec {
    name: TextElement;
    value: TextElement;
    inline: boolean;
}

export type PlaceholderType = 'string' | 'number';

export interface EmbedSpec {
    feature: string;
    /** Nom du fichier sans suffixe (ex: 'Profile' → ProfileEmbeds.ts) */
    fileBaseName: string;
    /** Nom de l'embed en PascalCase (ex: 'ProfileCard' → buildProfileCardEmbed) */
    embedName: string;
    /** Préfixe des clés de traduction (ex: 'profile.card') */
    keyPrefix: string;
    /** Phrase de documentation (JSDoc) du builder */
    summary: string;

    color?: ColorSpec;
    author?: { name: TextElement; iconUrl?: UrlSource; url?: UrlSource };
    title?: TextElement;
    url?: UrlSource;
    description?: TextElement;
    thumbnail?: UrlSource;
    fields: FieldSpec[];
    image?: UrlSource;
    footer?: { text: TextElement; iconUrl?: UrlSource };
    timestamp?: TimestampSource;

    /** Type de chaque placeholder `{nom}` utilisé dans les textes */
    placeholderTypes: Record<string, PlaceholderType>;
}

/** Champ de l'objet `data` passé au builder */
export interface DataField {
    name: string;
    type: 'string' | 'number' | 'Date';
    optional: boolean;
    doc: string;
}

export function functionName(spec: EmbedSpec): string {
    return `build${spec.embedName}Embed`;
}

export function dataTypeName(spec: EmbedSpec): string {
    return `${spec.embedName}EmbedData`;
}

/** Tous les textes de l'embed, dans l'ordre d'affichage */
export function textElements(spec: EmbedSpec): TextElement[] {
    return [
        spec.author?.name,
        spec.title,
        spec.description,
        ...spec.fields.flatMap((field) => [field.name, field.value]),
        spec.footer?.text,
    ].filter((element): element is TextElement => element !== undefined);
}

/** Placeholders de tout l'embed, dans l'ordre d'apparition */
export function allPlaceholders(spec: EmbedSpec): string[] {
    return [...new Set(textElements(spec).flatMap(elementPlaceholders))];
}

interface DynamicSource {
    source: UrlSource | TimestampSource | undefined;
    doc: string;
    type: 'string' | 'Date';
    /** Emplacement de la valeur dans `embed.toJSON()` (assertions des tests générés) */
    jsonPath: string;
}

/** URLs et horodatage dynamiques, avec la description de leur rôle */
function dynamicSources(spec: EmbedSpec): DynamicSource[] {
    return [
        { source: spec.author?.iconUrl, doc: 'URL de l\'icône de l\'auteur', type: 'string', jsonPath: 'author?.icon_url' },
        { source: spec.author?.url, doc: 'Lien du nom de l\'auteur', type: 'string', jsonPath: 'author?.url' },
        { source: spec.url, doc: 'Lien du titre', type: 'string', jsonPath: 'url' },
        { source: spec.thumbnail, doc: 'URL de la miniature (en haut à droite)', type: 'string', jsonPath: 'thumbnail' },
        { source: spec.image, doc: 'URL de la grande image (en bas)', type: 'string', jsonPath: 'image' },
        { source: spec.footer?.iconUrl, doc: 'URL de l\'icône du pied de page', type: 'string', jsonPath: 'footer?.icon_url' },
        { source: spec.timestamp, doc: 'Date affichée à côté du pied de page', type: 'Date', jsonPath: 'timestamp' },
    ];
}

/** Emplacements dans `embed.toJSON()` des éléments fournis par des propriétés optionnelles */
export function optionalJsonPaths(spec: EmbedSpec): string[] {
    return dynamicSources(spec)
        .filter(({ source }) => source?.kind === 'dynamic' && source.optional)
        .map(({ jsonPath }) => jsonPath);
}

/** Champs de l'objet `data` : placeholders puis URLs / date dynamiques */
export function dataFields(spec: EmbedSpec): DataField[] {
    const fields: DataField[] = allPlaceholders(spec).map((name) => ({
        name,
        type: spec.placeholderTypes[name] ?? 'string',
        optional: false,
        doc: `Valeur du placeholder {${name}}`,
    }));

    for (const { source, doc, type } of dynamicSources(spec)) {
        if (source?.kind !== 'dynamic') continue;
        fields.push({ name: source.field, type, optional: source.optional, doc });
    }
    return fields;
}

/** Noms de champs `data` déjà utilisés (placeholders + sources dynamiques) */
export function usedDataNames(spec: EmbedSpec): Set<string> {
    return new Set(dataFields(spec).map((field) => field.name));
}

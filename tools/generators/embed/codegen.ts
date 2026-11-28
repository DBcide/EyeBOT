import { tsString } from '../shared/naming';
import { elementPlaceholders, translateCall } from '../shared/text';
import {
    DataField,
    EmbedSpec,
    TimestampSource,
    UrlSource,
    dataFields,
    dataTypeName,
    functionName,
    optionalJsonPaths,
} from './spec';

/**
 * Génération du code TypeScript d'un embed (fonctions pures, fins de ligne `\n`)
 *
 * Le code produit suit la convention des fichiers `features/<feature>/embeds/` :
 * une fonction pure `build<Nom>Embed(translate, data)` → EmbedBuilder, textes traduits,
 * couleur issue de `EmbedColors`.
 */

const INDENT = '    ';

/** Exemple de date utilisé dans les tests générés (horloge figée) */
const FIXED_DATE = '2026-01-01T00:00:00.000Z';

/** Imports nécessaires au fichier d'embeds, par module (chemins relatifs au dossier `embeds/`) */
export function requiredImports(spec: EmbedSpec, translatorType: string): Record<string, string[]> {
    const imports: Record<string, string[]> = { 'discord.js': ['EmbedBuilder'] };
    if (spec.color) imports['../../../shared/embeds/EmbedColors'] = ['EmbedColors'];
    if (usesTruncate(spec)) imports['../../../shared/embeds/EmbedUtils'] = ['truncateField'];
    imports['../translations'] = [translatorType];
    if (dataFields(spec).length > 0) imports['./types'] = [dataTypeName(spec)];
    return imports;
}

/** Les valeurs de champs avec placeholders sont tronquées à 1024 caractères (limite Discord) */
function usesTruncate(spec: EmbedSpec): boolean {
    return spec.fields.some((field) => elementPlaceholders(field.value).length > 0);
}

/**
 * Expression d'une URL
 *
 * @param absent - Valeur utilisée si une URL dynamique optionnelle est absente :
 *   `null` pour les setters (setImage(null) efface l'image), `undefined` dans un objet (iconURL)
 */
function urlExpression(source: UrlSource, absent: 'null' | 'undefined'): string {
    if (source.kind === 'static') return tsString(source.url);
    return source.optional ? `data.${source.field} ?? ${absent}` : `data.${source.field}`;
}

function timestampCall(source: TimestampSource): string {
    if (source.kind === 'now') return '.setTimestamp()';
    return source.optional ? `.setTimestamp(data.${source.field} ?? null)` : `.setTimestamp(data.${source.field})`;
}

/** Objet `{ clé: valeur }` sur une ligne (propriétés undefined ignorées) */
function inlineObject(properties: Record<string, string | undefined>): string {
    const entries = Object.entries(properties).filter(([, value]) => value !== undefined);
    return `{ ${entries.map(([key, value]) => `${key}: ${value}`).join(', ')} }`;
}

function fieldsCall(spec: EmbedSpec): string[] {
    const lines = ['.addFields('];
    for (const field of spec.fields) {
        const value = translateCall(spec.keyPrefix, field.value);
        const wrappedValue = elementPlaceholders(field.value).length > 0 ? `truncateField(${value})` : value;
        lines.push(
            `${INDENT}{`,
            `${INDENT}${INDENT}name: ${translateCall(spec.keyPrefix, field.name)},`,
            `${INDENT}${INDENT}value: ${wrappedValue},`,
            `${INDENT}${INDENT}inline: ${field.inline},`,
            `${INDENT}},`
        );
    }
    lines.push(')');
    return lines;
}

/** Appels chaînés sur `new EmbedBuilder()`, dans l'ordre d'affichage */
function builderCalls(spec: EmbedSpec): string[] {
    const calls: string[] = [];
    if (spec.color) calls.push(`.setColor(EmbedColors.${spec.color.name})`);
    if (spec.author) {
        calls.push(`.setAuthor(${inlineObject({
            name: translateCall(spec.keyPrefix, spec.author.name),
            iconURL: spec.author.iconUrl && urlExpression(spec.author.iconUrl, 'undefined'),
            url: spec.author.url && urlExpression(spec.author.url, 'undefined'),
        })})`);
    }
    if (spec.title) calls.push(`.setTitle(${translateCall(spec.keyPrefix, spec.title)})`);
    if (spec.url) calls.push(`.setURL(${urlExpression(spec.url, 'null')})`);
    if (spec.description) calls.push(`.setDescription(${translateCall(spec.keyPrefix, spec.description)})`);
    if (spec.thumbnail) calls.push(`.setThumbnail(${urlExpression(spec.thumbnail, 'null')})`);
    if (spec.fields.length > 0) calls.push(...fieldsCall(spec));
    if (spec.image) calls.push(`.setImage(${urlExpression(spec.image, 'null')})`);
    if (spec.footer) {
        calls.push(`.setFooter(${inlineObject({
            text: translateCall(spec.keyPrefix, spec.footer.text),
            iconURL: spec.footer.iconUrl && urlExpression(spec.footer.iconUrl, 'undefined'),
        })})`);
    }
    if (spec.timestamp) calls.push(timestampCall(spec.timestamp));
    return calls;
}

/** Fonction `build<Nom>Embed` complète, avec sa JSDoc */
export function generateBuilderFunction(spec: EmbedSpec, translatorType: string): string {
    const hasData = dataFields(spec).length > 0;
    const params = hasData
        ? `translate: ${translatorType}, data: ${dataTypeName(spec)}`
        : `translate: ${translatorType}`;

    const doc = [
        '/**',
        ` * ${spec.summary}`,
        ' *',
        ' * @param translate - Traductions dans la langue du destinataire',
        ...(hasData ? [` * @param data - Données affichées (cf. ${dataTypeName(spec)})`] : []),
        ' */',
    ];

    const calls = builderCalls(spec);
    calls[calls.length - 1] += ';';

    return [
        ...doc,
        `export function ${functionName(spec)}(${params}): EmbedBuilder {`,
        `${INDENT}return new EmbedBuilder()`,
        ...calls.map((call) => `${INDENT}${INDENT}${call}`),
        '}',
    ].join('\n');
}

function fieldTypeSuffix(field: DataField): string {
    if (!field.optional) return `: ${field.type}`;
    return `?: ${field.type} | null`;
}

/** Interface des données du builder (null si l'embed n'a aucune donnée dynamique) */
export function generateDataInterface(spec: EmbedSpec): string | null {
    const fields = dataFields(spec);
    if (fields.length === 0) return null;

    return [
        `/** Données de ${functionName(spec)} */`,
        `export interface ${dataTypeName(spec)} {`,
        ...fields.flatMap((field) => [
            `${INDENT}/** ${field.doc} */`,
            `${INDENT}${field.name}${fieldTypeSuffix(field)};`,
        ]),
        '}',
    ].join('\n');
}

/** En-tête d'un nouveau fichier `<Nom>Embeds.ts` (avant les fonctions) */
export function generateEmbedFileHeader(fileBaseName: string): string {
    return [
        '/**',
        ` * Embeds ${fileBaseName}`,
        ' *',
        ' * Convention de tous les fichiers `embeds/` :',
        ' * - une fonction pure par embed : `build<Nom>Embed(translate, données)` → EmbedBuilder',
        ' * - `translate` est la fonction de traduction de la langue du destinataire',
        ' * - aucune logique métier, aucun accès DB/API : uniquement de la mise en forme',
        ' */',
    ].join('\n');
}

/** En-tête d'un nouveau fichier `embeds/index.ts` */
export function generateIndexHeader(feature: string): string {
    return [
        '/**',
        ` * Point d'entrée des embeds de la feature ${feature}`,
        ' *',
        ' * Les commandes importent depuis `../embeds` : la répartition en fichiers',
        ' * (un par commande) reste un détail interne au dossier.',
        ' */',
    ].join('\n');
}

/** En-tête d'un nouveau fichier `embeds/types.ts` */
export function generateTypesHeader(): string {
    return [
        '/**',
        ' * Types d\'entrée des builders d\'embeds',
        ' *',
        ' * Les embeds ne connaissent que ces formats : la conversion depuis l\'API ou la base',
        ' * de données est faite en amont (commande, handler, mapper).',
        ' */',
    ].join('\n');
}

/** Valeur d'exemple d'un champ de données, pour les tests générés */
function sampleValue(field: DataField): string {
    if (field.type === 'Date') return `new Date('${FIXED_DATE}')`;
    if (field.type === 'number') return '1234';
    if (/url$/i.test(field.name)) return tsString(`https://example.com/${field.name}.png`);
    return tsString(`Exemple ${field.name}`);
}

/**
 * Bloc de tests Jest d'un builder (autonome : peut être ajouté à un fichier existant)
 *
 * @param translationsName - Catalogue de la feature (ex: 'tracerTranslations')
 */
export function generateTestBlock(spec: EmbedSpec, translationsName: string): string {
    const fields = dataFields(spec);
    const fn = functionName(spec);
    const call = (translate: string, data: string) => (fields.length > 0 ? `${fn}(${translate}, ${data})` : `${fn}(${translate})`);

    const lines = [
        `describe('${fn}()', () => {`,
        ...(fields.length > 0
            ? [
                `${INDENT}const data: ${dataTypeName(spec)} = {`,
                ...fields.map((field) => `${INDENT}${INDENT}${field.name}: ${sampleValue(field)},`),
                `${INDENT}};`,
                '',
            ]
            : []),
        `${INDENT}beforeAll(() => {`,
        `${INDENT}${INDENT}jest.useFakeTimers();`,
        `${INDENT}${INDENT}jest.setSystemTime(new Date('${FIXED_DATE}'));`,
        `${INDENT}});`,
        '',
        `${INDENT}afterAll(() => {`,
        `${INDENT}${INDENT}jest.useRealTimers();`,
        `${INDENT}});`,
        '',
        `${INDENT}it('[snapshot] rendu en français', () => {`,
        `${INDENT}${INDENT}expect(${call(`${translationsName}.forLocale('fr')`, 'data')}.toJSON()).toMatchSnapshot();`,
        `${INDENT}});`,
        '',
        `${INDENT}it.each(SUPPORTED_LOCALES)('[positif] valide dans la langue %s (limites Discord respectées)', (locale) => {`,
        `${INDENT}${INDENT}expect(() => ${call(`${translationsName}.forLocale(locale)`, 'data')}.toJSON()).not.toThrow();`,
        `${INDENT}});`,
    ];

    const optional = fields.filter((field) => field.optional);
    if (optional.length > 0) {
        const nulls = optional.map((field) => `${field.name}: null`).join(', ');
        lines.push(
            '',
            `${INDENT}it('[extrême] sans les données optionnelles', () => {`,
            `${INDENT}${INDENT}const embed = ${call(`${translationsName}.forLocale('fr')`, `{ ...data, ${nulls} }`)}.toJSON();`,
            '',
            ...optionalJsonPaths(spec).map((jsonPath) => `${INDENT}${INDENT}expect(embed.${jsonPath}).toBeUndefined();`),
            `${INDENT}});`
        );
    }

    lines.push('});');
    return lines.join('\n');
}

/** Exemple d'appel affiché à la fin de la génération */
export function generateUsageExample(spec: EmbedSpec, translationsName: string): string {
    const fields = dataFields(spec);
    const data = fields.length > 0
        ? `, {\n${fields.map((field) => `${INDENT}${field.name}: …,${field.optional ? ' // optionnel' : ''}`).join('\n')}\n}`
        : '';
    return [
        `import { ${functionName(spec)} } from '../embeds';`,
        `import { ${translationsName} } from '../translations';`,
        '',
        `const translate = ${translationsName}.forLocale(await this.resolveLocale(interaction));`,
        `const embed = ${functionName(spec)}(translate${data});`,
    ].join('\n');
}

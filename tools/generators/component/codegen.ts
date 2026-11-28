import { tsString } from '../shared/naming';
import { translateCall } from '../shared/text';
import {
    ButtonSpec,
    COMPONENT_LIMITS,
    ComponentSpec,
    SELECT_BUILDERS,
    componentDataFields,
    componentDataTypeName,
    componentFunctionName,
    customIdConstant,
} from './spec';

/**
 * Génération du code d'un component (fonctions pures, fins de ligne `\n`)
 *
 * Même convention que `tracer/components/SelectMenus.ts` : construction pure, textes
 * traduits via `translate`, renvoie un `ActionRowBuilder` prêt pour `components: [...]`.
 */

const INDENT = '    ';
const STYLE_ENUM: Record<ButtonSpec['style'], string> = {
    primary: 'Primary',
    secondary: 'Secondary',
    success: 'Success',
    danger: 'Danger',
    link: 'Link',
};

/** Imports discord.js nécessaires */
export function discordImports(spec: ComponentSpec): string[] {
    if (spec.kind === 'buttons') return ['ActionRowBuilder', 'ButtonBuilder', 'ButtonStyle'];
    const imports = ['ActionRowBuilder', SELECT_BUILDERS[spec.kind]];
    if (spec.kind === 'channelSelect' && spec.channelTypes.length > 0) imports.push('ChannelType');
    if (spec.dynamicOptions) imports.push('SelectMenuComponentOptionData');
    return imports;
}

function rowType(spec: ComponentSpec): string {
    return spec.kind === 'buttons' ? 'ButtonBuilder' : SELECT_BUILDERS[spec.kind];
}

/** Constante des custom IDs (à utiliser pour filtrer les collectors) */
export function generateCustomIdConstant(spec: ComponentSpec): string | null {
    if (spec.kind !== 'buttons') {
        return [
            `/** Custom ID de ${componentFunctionName(spec)} (filtre des collectors) */`,
            `export const ${customIdConstant(spec)} = ${tsString(spec.customId!)};`,
        ].join('\n');
    }
    const withId = spec.buttons.filter((button) => button.customId);
    if (withId.length === 0) return null;
    return [
        `/** Custom IDs des boutons de ${componentFunctionName(spec)} (filtre des collectors) */`,
        `export const ${customIdConstant(spec)} = {`,
        ...withId.map((button) => `${INDENT}${button.key}: ${tsString(button.customId!)},`),
        '} as const;',
    ].join('\n');
}

/** Interface des données (null si le component est entièrement statique) */
export function generateComponentDataInterface(spec: ComponentSpec): string | null {
    const fields = componentDataFields(spec);
    if (fields.length === 0) return null;
    return [
        `/** Données de ${componentFunctionName(spec)} */`,
        `export interface ${componentDataTypeName(spec)} {`,
        ...fields.flatMap((field) => [`${INDENT}/** ${field.doc} */`, `${INDENT}${field.name}: ${field.type};`]),
        '}',
    ].join('\n');
}

function buttonLines(spec: ComponentSpec, button: ButtonSpec): string[] {
    const calls = [
        button.customId ? `.setCustomId(${customIdConstant(spec)}.${button.key})` : null,
        `.setLabel(${translateCall(spec.keyPrefix, button.label)})`,
        `.setStyle(ButtonStyle.${STYLE_ENUM[button.style]})`,
        button.url ? `.setURL(${button.url.kind === 'static' ? tsString(button.url.url) : `data.${button.url.field}`})` : null,
        button.emoji ? `.setEmoji(${tsString(button.emoji)})` : null,
        button.disabled ? '.setDisabled(true)' : null,
    ].filter((call): call is string => call !== null);
    return ['new ButtonBuilder()', ...calls.map((call) => `${INDENT}${call}`)];
}

function optionLiteral(spec: ComponentSpec, option: ComponentSpec['options'][number]): string {
    const parts = [
        `label: ${translateCall(spec.keyPrefix, option.label)}`,
        `value: ${tsString(option.value)}`,
        option.description ? `description: ${translateCall(spec.keyPrefix, option.description)}` : null,
        option.emoji ? `emoji: ${tsString(option.emoji)}` : null,
        option.isDefault ? 'default: true' : null,
    ].filter(Boolean);
    return `{ ${parts.join(', ')} }`;
}

function selectCalls(spec: ComponentSpec): string[] {
    const calls = [`.setCustomId(${customIdConstant(spec)})`];
    if (spec.placeholder) calls.push(`.setPlaceholder(${translateCall(spec.keyPrefix, spec.placeholder)})`);
    if (spec.minValues !== undefined) calls.push(`.setMinValues(${spec.minValues})`);
    if (spec.maxValues !== undefined) calls.push(`.setMaxValues(${spec.maxValues})`);
    if (spec.kind === 'channelSelect' && spec.channelTypes.length > 0) {
        calls.push(`.setChannelTypes(${spec.channelTypes.map((type) => `ChannelType.${type}`).join(', ')})`);
    }
    if (spec.dynamicOptions) {
        calls.push(`.addOptions(data.options.slice(0, ${COMPONENT_LIMITS.options}))`);
    } else if (spec.options.length > 0) {
        calls.push('.addOptions(', ...spec.options.map((option) => `${INDENT}${optionLiteral(spec, option)},`), ')');
    }
    return calls;
}

/** Fonction `build<Nom>SelectMenu` / `build<Nom>Buttons`, avec sa JSDoc */
export function generateComponentFunction(spec: ComponentSpec, translatorType: string): string {
    const hasData = componentDataFields(spec).length > 0;
    const usesTranslate = spec.placeholder !== undefined || spec.options.length > 0 || spec.buttons.length > 0;
    const translateParam = usesTranslate ? 'translate' : '_translate';
    const params = hasData
        ? `${translateParam}: ${translatorType}, data: ${componentDataTypeName(spec)}`
        : `${translateParam}: ${translatorType}`;
    const row = rowType(spec);

    const doc = [
        '/**',
        ` * ${spec.summary}`,
        ' *',
        ` * @param ${translateParam} - Traductions dans la langue de l'utilisateur`,
        ...(hasData ? [` * @param data - Données affichées (cf. ${componentDataTypeName(spec)})`] : []),
        ...(spec.dynamicOptions ? [' *', ` * @remarks Discord limite un menu à ${COMPONENT_LIMITS.options} options : les suivantes sont ignorées.`] : []),
        ' */',
    ];

    let body: string[];
    if (spec.kind === 'buttons') {
        const buttons = spec.buttons.map((button) => buttonLines(spec, button).map((line) => `${INDENT}${INDENT}${line}`).join('\n'));
        body = [
            `${INDENT}return new ActionRowBuilder<${row}>().addComponents(`,
            ...buttons.map((button) => `${button},`),
            `${INDENT});`,
        ];
    } else {
        const calls = selectCalls(spec).map((call) => `${INDENT}${INDENT}${call}`);
        calls[calls.length - 1] += ';';
        body = [
            `${INDENT}const menu = new ${row}()`,
            ...calls,
            '',
            `${INDENT}return new ActionRowBuilder<${row}>().addComponents(menu);`,
        ];
    }

    return [
        ...doc,
        `export function ${componentFunctionName(spec)}(${params}): ActionRowBuilder<${row}> {`,
        ...body,
        '}',
    ].join('\n');
}

/** En-tête d'un nouveau fichier `components/<Nom>.ts` */
export function generateComponentFileHeader(feature: string): string {
    return [
        '/**',
        ` * Composants interactifs de la feature ${feature}`,
        ' *',
        ' * Même principe que le dossier `embeds/` : construction pure, textes traduits via `translate`.',
        ' * Les custom IDs sont exportés en constantes pour filtrer les collectors des commandes.',
        ' */',
    ].join('\n');
}

function sampleValue(field: { name: string; type: string }): string {
    if (field.type === 'number') return '3';
    if (field.name === 'options') return '[{ label: \'Option 1\', value: \'option-1\' }, { label: \'Option 2\', value: \'option-2\' }]';
    if (/url$/i.test(field.name)) return tsString(`https://example.com/${field.name}`);
    return tsString(`Exemple ${field.name}`);
}

/** Bloc de tests Jest d'un component (autonome : peut être ajouté à un fichier existant) */
export function generateComponentTestBlock(spec: ComponentSpec, translationsName: string): string {
    const fields = componentDataFields(spec);
    const fn = componentFunctionName(spec);
    const call = (translate: string, data = 'data') => (fields.length > 0 ? `${fn}(${translate}, ${data})` : `${fn}(${translate})`);

    const lines = [
        `describe('${fn}()', () => {`,
        ...(fields.length > 0
            ? [
                `${INDENT}const data: ${componentDataTypeName(spec)} = {`,
                ...fields.map((field) => `${INDENT}${INDENT}${field.name}: ${sampleValue(field)},`),
                `${INDENT}};`,
                '',
            ]
            : []),
        `${INDENT}it('[snapshot] rendu en français', () => {`,
        `${INDENT}${INDENT}expect(${call(`${translationsName}.forLocale('fr')`)}.toJSON()).toMatchSnapshot();`,
        `${INDENT}});`,
        '',
        `${INDENT}it.each(SUPPORTED_LOCALES)('[positif] valide dans la langue %s (limites Discord respectées)', (locale) => {`,
        `${INDENT}${INDENT}expect(() => ${call(`${translationsName}.forLocale(locale)`)}.toJSON()).not.toThrow();`,
        `${INDENT}});`,
    ];

    if (spec.dynamicOptions) {
        const many = `Array.from({ length: ${COMPONENT_LIMITS.options + 5} }, (_, index) => ({ label: \`Option \${index}\`, value: \`option-\${index}\` }))`;
        lines.push(
            '',
            `${INDENT}it('[extrême] limite Discord : ${COMPONENT_LIMITS.options} options maximum', () => {`,
            `${INDENT}${INDENT}const options = ${many};`,
            `${INDENT}${INDENT}const menu = ${call(`${translationsName}.forLocale('fr')`, '{ ...data, options }')}.toJSON().components[0];`,
            '',
            `${INDENT}${INDENT}expect(menu.options).toHaveLength(${COMPONENT_LIMITS.options});`,
            `${INDENT}});`
        );
    }
    lines.push('});');
    return lines.join('\n');
}

/** Exemple d'appel affiché à la fin de la génération */
export function generateComponentUsage(spec: ComponentSpec, translationsName: string): string {
    const fields = componentDataFields(spec);
    const data = fields.length > 0 ? `, { ${fields.map((field) => `${field.name}: …`).join(', ')} }` : '';
    const hasConstant = generateCustomIdConstant(spec) !== null;
    const imported = hasConstant ? `${componentFunctionName(spec)}, ${customIdConstant(spec)}` : componentFunctionName(spec);
    let filter = spec.kind === 'buttons'
        ? `// collector : filter: (i) => Object.values(${customIdConstant(spec)}).includes(i.customId)`
        : `// collector : filter: (i) => i.customId === ${customIdConstant(spec)}`;
    if (!hasConstant) filter = '// boutons link uniquement : aucun collector nécessaire';
    return [
        `import { ${imported} } from '../components/${spec.file}';`,
        '',
        `const translate = ${translationsName}.forLocale(await this.resolveLocale(interaction));`,
        `await interaction.reply({ components: [${componentFunctionName(spec)}(translate${data})] });`,
        filter,
    ].join('\n');
}

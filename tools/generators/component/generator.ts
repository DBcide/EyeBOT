import path from 'node:path';
import {
    ActionRowBuilder,
    APIActionRowComponent,
    APIComponentInActionRow,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    MentionableSelectMenuBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
} from 'discord.js';
import { Generator } from '../shared/generator';
import { InputReader, SpecValidationError, throwIfErrors } from '../shared/input';
import { Prompter } from '../shared/Prompter';
import { listFeatureFiles, listFeatures, paths } from '../shared/project';
import { CAMEL_CASE, EMOJI_CHAR, PASCAL_CASE, toCamelCase, toPascalCase } from '../shared/naming';
import { appendBlock, ensureNamedImports, listExportedFunctions } from '../shared/sourceEdit';
import { heading, style } from '../shared/terminal';
import {
    GeneratorContext,
    TextElement,
    checkKeyPrefix,
    elementPlaceholders,
    planTexts,
    readReferenceLocale,
    textFromInput,
    untranslatedKeys,
} from '../shared/text';
import { askText, askTranslateNow, TextPromptState } from '../shared/textPrompts';
import { askFeature, checkFeatureReference, ensureFeature } from '../feature/generator';
import { validateUrl } from '../embed/validate';
import {
    BUTTON_STYLES,
    ButtonSpec,
    ButtonStyleName,
    CHANNEL_TYPES,
    COMPONENT_KINDS,
    COMPONENT_LIMITS,
    ComponentKind,
    ComponentSpec,
    LinkSource,
    SelectOptionSpec,
    componentDataFields,
    componentDataTypeName,
    componentFunctionName,
    componentTexts,
    customIdConstant,
    isSelect,
    kebabCase,
} from './spec';
import {
    discordImports,
    generateComponentDataInterface,
    generateComponentFileHeader,
    generateComponentFunction,
    generateComponentTestBlock,
    generateComponentUsage,
    generateCustomIdConstant,
} from './codegen';

/**
 * Générateur de components : `npm run create:component`
 *
 * Boutons et menus déroulants traduits, dans `features/<feature>/components/<Fichier>.ts`,
 * avec leurs custom IDs exportés et un test (snapshot + toutes les langues).
 */

const SPEC_HELP = `{
  "feature": "encyclopedia",
  "file": "SelectMenus",              // → components/SelectMenus.ts (créé ou complété ; défaut : SelectMenus ou Buttons)
  "name": "ItemCategory",             // → buildItemCategorySelectMenu / buildItemCategoryButtons
  "kind": "stringSelect",             // ${COMPONENT_KINDS.join(' | ')}
  "keyPrefix": "itemCategory",        // optionnel (défaut : nom en camelCase)
  "summary": "Menu de choix de la catégorie",
  // menus :
  "customId": "encyclopedia-item-category",   // optionnel (défaut : <feature>-<name>)
  "placeholder": TEXT, "minValues": 1, "maxValues": 1,
  "options": [{ "value": "weapons", "label": TEXT, "description": TEXT, "emoji": "\\u2694\\uFE0F", "default": false }],
  //   ou "options": "dynamic" → data.options (SelectMenuComponentOptionData[], 25 max)
  "channelTypes": ["GuildText"],      // channelSelect : ${CHANNEL_TYPES.join(', ')}
  // boutons (5 max) :
  "buttons": [{ "key": "confirm", "label": TEXT, "style": "success", "emoji": "\\u2705" },
              { "key": "wiki", "label": TEXT, "style": "link", "url": "https://…" ou { "data": "wikiUrl" } }],
  "placeholders": { "count": "number" }   // type des {placeholders} (défaut : string)
}
TEXT : "texte fr" | { "fr": "…", "en": "…", "es": "…" }     styles : ${BUTTON_STYLES.join(' | ')}`;

const noEmoji = (value: string) => (EMOJI_CHAR.test(value) ? 'pas d\'émoji (texte écrit dans le code)' : null);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Littéraux de chaîne des fichiers components/ de toutes les features (custom IDs existants) */
function existingCustomIds(context: GeneratorContext): Set<string> {
    const ids = new Set<string>();
    for (const feature of listFeatures(context.changes, context.root)) {
        const directory = path.join(paths.feature(context.root, feature), 'components');
        for (const file of listFeatureFiles(context.changes, context.root, feature, 'components')) {
            for (const match of (context.changes.read(path.join(directory, file)) ?? '').matchAll(/'([\w:-]+)'/g)) ids.add(match[1]);
        }
    }
    return ids;
}

function componentFile(context: GeneratorContext, spec: Pick<ComponentSpec, 'feature' | 'file'>): string {
    return path.join(paths.feature(context.root, spec.feature), 'components', `${spec.file}.ts`);
}

/** Nom libre → PascalCase sans suffixe de type (ex: "item category menu" → ItemCategory) */
function normalizeComponentName(value: string): string {
    return toPascalCase(value).replace(/(SelectMenu|Menu|Buttons|Button)$/, '');
}

function checkName(spec: Pick<ComponentSpec, 'feature' | 'file' | 'name' | 'kind'>, context: GeneratorContext): string | null {
    if (!PASCAL_CASE.test(spec.name)) return 'lettres et chiffres ASCII uniquement';
    const directory = path.join(paths.feature(context.root, spec.feature), 'components');
    const functions = listFeatureFiles(context.changes, context.root, spec.feature, 'components')
        .flatMap((file) => listExportedFunctions(context.changes.read(path.join(directory, file)) ?? ''));
    if (functions.includes(componentFunctionName(spec))) return `${componentFunctionName(spec)} existe déjà dans cette feature`;
    const source = context.changes.read(componentFile(context, spec)) ?? '';
    return source.includes(`export const ${customIdConstant(spec)} `) ? `${customIdConstant(spec)} existe déjà` : null;
}

function checkCustomId(value: string, taken: Set<string>): string | null {
    if (!/^[\w:-]+$/.test(value)) return 'lettres, chiffres, "-", "_" ou ":" uniquement';
    if (value.length > COMPONENT_LIMITS.customId) return `${COMPONENT_LIMITS.customId} caractères maximum`;
    return taken.has(value) ? `custom ID "${value}" déjà utilisé` : null;
}

/** Construit le component avec discord.js (textes d'une langue, données d'exemple) */
function buildPreview(spec: ComponentSpec, locale: string, defaultLocale: string): APIActionRowComponent<APIComponentInActionRow> {
    const read = (element: TextElement) => {
        const value = element.values[locale] ?? element.values[defaultLocale];
        return Array.isArray(value) ? value.join('\n') : value;
    };

    if (spec.kind === 'buttons') {
        const buttons = spec.buttons.map((button) => {
            const builder = new ButtonBuilder().setLabel(read(button.label)).setStyle(ButtonStyle[STYLE_NAMES[button.style]]);
            if (button.customId) builder.setCustomId(button.customId);
            if (button.url) builder.setURL(button.url.kind === 'static' ? button.url.url : 'https://example.com/');
            if (button.emoji) builder.setEmoji(button.emoji);
            return builder;
        });
        return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons).toJSON();
    }

    const menu = createMenu(spec.kind).setCustomId(spec.customId!);
    if (spec.placeholder) menu.setPlaceholder(read(spec.placeholder));
    if (spec.minValues !== undefined) menu.setMinValues(spec.minValues);
    if (spec.maxValues !== undefined) menu.setMaxValues(spec.maxValues);
    if (menu instanceof ChannelSelectMenuBuilder && spec.channelTypes.length > 0) {
        menu.setChannelTypes(...spec.channelTypes.map((type) => ChannelType[type as keyof typeof ChannelType] as ChannelType));
    }
    if (menu instanceof StringSelectMenuBuilder) {
        const options = spec.dynamicOptions
            ? [{ label: 'Option 1', value: 'option-1' }, { label: 'Option 2', value: 'option-2' }]
            : spec.options.map((option) => ({
                label: read(option.label),
                value: option.value,
                description: option.description && read(option.description),
                emoji: option.emoji,
                default: option.isDefault,
            }));
        menu.addOptions(options);
    }
    return new ActionRowBuilder<typeof menu>().addComponents(menu).toJSON() as APIActionRowComponent<APIComponentInActionRow>;
}

const STYLE_NAMES: Record<ButtonStyleName, keyof typeof ButtonStyle> = {
    primary: 'Primary', secondary: 'Secondary', success: 'Success', danger: 'Danger', link: 'Link',
};

function createMenu(kind: Exclude<ComponentKind, 'buttons'>) {
    switch (kind) {
        case 'stringSelect': return new StringSelectMenuBuilder();
        case 'userSelect': return new UserSelectMenuBuilder();
        case 'roleSelect': return new RoleSelectMenuBuilder();
        case 'channelSelect': return new ChannelSelectMenuBuilder();
        default: return new MentionableSelectMenuBuilder();
    }
}

/** Vérifications globales d'un component complet (règles Discord + construction discord.js) */
export function checkComponentSpec(spec: ComponentSpec, context: GeneratorContext): string[] {
    const errors: string[] = [];
    if (spec.kind === 'buttons') {
        if (spec.buttons.length === 0 || spec.buttons.length > COMPONENT_LIMITS.buttons) errors.push(`buttons : 1 à ${COMPONENT_LIMITS.buttons} boutons`);
        const ids = spec.buttons.flatMap((button) => (button.customId ? [button.customId] : []));
        if (new Set(ids).size !== ids.length) errors.push('buttons : custom IDs en double');
        const keys = spec.buttons.map((button) => button.key);
        if (new Set(keys).size !== keys.length) errors.push('buttons : clés en double');
    } else {
        if (spec.kind === 'stringSelect' && !spec.dynamicOptions && spec.options.length === 0) {
            errors.push('options : au moins une option, ou "dynamic"');
        }
        const values = spec.options.map((option) => option.value);
        if (new Set(values).size !== values.length) errors.push('options : valeurs en double');
        if (spec.minValues !== undefined && spec.maxValues !== undefined && spec.minValues > spec.maxValues) {
            errors.push('minValues doit être inférieur ou égal à maxValues');
        }
        if (!spec.dynamicOptions && spec.options.length > 0 && (spec.maxValues ?? 1) > spec.options.length) {
            errors.push(`maxValues (${spec.maxValues}) dépasse le nombre d'options (${spec.options.length})`);
        }
    }

    const placeholders = new Set(componentTexts(spec).flatMap(elementPlaceholders));
    for (const name of Object.keys(spec.placeholderTypes)) {
        if (!placeholders.has(name)) errors.push(`placeholders.${name} : aucun texte n'utilise {${name}}`);
    }
    const names = componentDataFields(spec).map((field) => field.name);
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate) errors.push(`"${duplicate}" est utilisé deux fois dans data (placeholder, options ou URL)`);

    if (errors.length === 0) {
        for (const locale of context.locales) {
            try {
                buildPreview(spec, locale, context.defaultLocale);
            } catch (error) {
                errors.push(`refusé par discord.js [${locale}] : ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return errors;
}

// ---------------------------------------------------------------------------
// Spec JSON
// ---------------------------------------------------------------------------

function readLink(button: InputReader): LinkSource | undefined {
    const raw = button.raw('url');
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'string') {
        const error = validateUrl(raw);
        if (error) button.errors.push(`${button.path('url')} : ${error}`);
        return { kind: 'static', url: raw };
    }
    const dynamic = InputReader.of(raw, button.path('url'), button.errors);
    const field = dynamic?.allowOnly(['data']).string('data', { required: true, validate: (value) => (CAMEL_CASE.test(value) ? null : 'camelCase attendu') });
    return { kind: 'dynamic', field: field ?? '' };
}

function readButtons(input: InputReader, spec: ComponentSpec, context: GeneratorContext, taken: Set<string>): ButtonSpec[] {
    return input.array('buttons').flatMap((raw, index) => {
        const button = InputReader.of(raw, `${input.path('buttons')}[${index}]`, input.errors);
        if (!button) return [];
        button.allowOnly(['key', 'label', 'style', 'customId', 'url', 'emoji', 'disabled']);
        const key = button.string('key', { validate: (value) => (CAMEL_CASE.test(value) ? null : 'camelCase attendu') }) ?? `button${index + 1}`;
        const styleName = button.oneOf('style', BUTTON_STYLES, 'primary')!;
        const label = textFromInput(button.raw('label'), `${key}Label`, button.path('label'), context, COMPONENT_LIMITS.buttonLabel, input.errors);
        const url = readLink(button);
        if (styleName === 'link' && !url) input.errors.push(`${button.path('url')} : obligatoire pour un bouton link`);
        if (styleName !== 'link' && url) input.errors.push(`${button.path('url')} : réservé au style link`);
        const customId = styleName === 'link'
            ? undefined
            : button.string('customId', { validate: (value) => checkCustomId(value, taken) }) ?? `${kebabCase(spec.feature)}-${kebabCase(spec.name)}-${kebabCase(key)}`;
        if (!label) return [];
        return [{ key, label, style: styleName, customId, url, emoji: button.string('emoji'), disabled: button.boolean('disabled', false) }];
    });
}

function readOptions(input: InputReader, context: GeneratorContext): SelectOptionSpec[] {
    if (input.raw('options') === 'dynamic') return [];
    return input.array('options').flatMap((raw, index) => {
        const option = InputReader.of(raw, `${input.path('options')}[${index}]`, input.errors);
        if (!option) return [];
        option.allowOnly(['key', 'value', 'label', 'description', 'emoji', 'default']);
        const value = option.string('value', {
            required: true,
            validate: (text) => (text.length <= COMPONENT_LIMITS.optionValue ? null : `${COMPONENT_LIMITS.optionValue} caractères maximum`),
        }) ?? '';
        const key = option.string('key', { validate: (text) => (CAMEL_CASE.test(text) ? null : 'camelCase attendu') })
            ?? (CAMEL_CASE.test(toCamelCase(value)) ? toCamelCase(value) : `option${index + 1}`);
        const label = textFromInput(option.raw('label'), `${key}Label`, option.path('label'), context, COMPONENT_LIMITS.optionLabel, input.errors);
        const description = option.has('description')
            ? textFromInput(option.raw('description'), `${key}Description`, option.path('description'), context, COMPONENT_LIMITS.optionDescription, input.errors)
            : undefined;
        if (!label) return [];
        return [{ value, label, description, emoji: option.string('emoji'), isDefault: option.boolean('default', false) }];
    });
}

function readPlaceholderTypes(input: InputReader): Record<string, 'string' | 'number'> {
    const raw = input.raw('placeholders');
    const types = raw === undefined ? null : InputReader.of(raw, input.path('placeholders'), input.errors);
    if (!types) return {};
    const result: Record<string, 'string' | 'number'> = {};
    for (const name of Object.keys(raw as object)) {
        const type = types.oneOf(name, ['string', 'number'] as const);
        if (type) result[name] = type;
    }
    return result;
}

function componentFromInput(raw: unknown, where: string, context: GeneratorContext): ComponentSpec {
    const errors: string[] = [];
    const input = InputReader.of(raw, where, errors);
    if (!input) throw new SpecValidationError(errors);
    input.allowOnly(['type', 'feature', 'file', 'name', 'kind', 'keyPrefix', 'summary', 'customId', 'placeholder', 'minValues',
        'maxValues', 'options', 'channelTypes', 'buttons', 'placeholders']);

    const kind = input.oneOf('kind', COMPONENT_KINDS) ?? 'buttons';
    const feature = input.string('feature', { required: true, validate: checkFeatureReference }) ?? '';
    const name = normalizeComponentName(input.string('name', { required: true }) ?? '');
    const file = toPascalCase(input.string('file') ?? (kind === 'buttons' ? 'Buttons' : 'SelectMenus')).replace(/\.ts$/i, '');
    const spec: ComponentSpec = {
        feature, file, name, kind,
        keyPrefix: input.string('keyPrefix') ?? toCamelCase(name),
        summary: input.string('summary', { required: true, validate: noEmoji }) ?? '',
        options: [], dynamicOptions: false, channelTypes: [], buttons: [], placeholderTypes: readPlaceholderTypes(input),
    };
    if (feature && name) {
        const nameError = checkName(spec, context);
        if (nameError) errors.push(`${input.path('name')} : ${nameError}`);
        const prefixError = checkKeyPrefix(spec.keyPrefix, readReferenceLocale(context.changes, context, feature));
        if (prefixError) errors.push(`${input.path('keyPrefix')} ("${spec.keyPrefix}") : ${prefixError}`);
    }

    const taken = existingCustomIds(context);
    if (isSelect(kind)) {
        spec.customId = input.string('customId', { validate: (value) => checkCustomId(value, taken) }) ?? `${kebabCase(feature)}-${kebabCase(name)}`;
        if (!input.has('customId') && taken.has(spec.customId)) errors.push(`${input.path('customId')} : "${spec.customId}" déjà utilisé`);
        if (input.has('placeholder')) {
            spec.placeholder = textFromInput(input.raw('placeholder'), 'placeholder', input.path('placeholder'), context, COMPONENT_LIMITS.placeholder, errors);
        }
        spec.minValues = input.integer('minValues', 0, COMPONENT_LIMITS.options);
        spec.maxValues = input.integer('maxValues', 1, COMPONENT_LIMITS.options);
        spec.dynamicOptions = kind === 'stringSelect' && input.raw('options') === 'dynamic';
        spec.options = kind === 'stringSelect' ? readOptions(input, context) : [];
        spec.channelTypes = input.array('channelTypes').filter((type, index) => {
            const valid = (CHANNEL_TYPES as readonly unknown[]).includes(type);
            if (!valid) errors.push(`${input.path('channelTypes')}[${index}] : ${CHANNEL_TYPES.join(' | ')} attendu`);
            return valid;
        }) as string[];
    } else {
        spec.buttons = readButtons(input, spec, context, taken);
    }

    throwIfErrors(errors);
    throwIfErrors(checkComponentSpec(spec, context).map((error) => `${where || 'component'} : ${error}`));
    return spec;
}

// ---------------------------------------------------------------------------
// Mode interactif
// ---------------------------------------------------------------------------

interface WizardState extends TextPromptState {
    context: GeneratorContext;
    spec: ComponentSpec;
    taken: Set<string>;
}

async function askCustomId(state: WizardState, suggestion: string): Promise<string> {
    const id = await state.prompter.text('Custom ID (identifie l\'interaction dans les collectors)', {
        default: suggestion,
        validate: (value) => checkCustomId(value, state.taken),
    });
    state.taken.add(id);
    return id;
}

async function askOptionalEmoji(prompter: Prompter): Promise<string | undefined> {
    const emoji = await prompter.text('Émoji (vide = aucun ; émoji Unicode ou <:nom:id>)', { allowEmpty: true });
    return emoji || undefined;
}

async function askButtons(state: WizardState): Promise<void> {
    const { prompter, spec } = state;
    do {
        const index = spec.buttons.length;
        prompter.say(style.bold(`  Bouton n°${index + 1}`));
        const key = await prompter.text('Identifiant (camelCase, ex: confirm)', {
            default: `button${index + 1}`,
            validate: (value) => {
                if (!CAMEL_CASE.test(value)) return 'camelCase attendu';
                return spec.buttons.some((button) => button.key === value) ? 'identifiant déjà utilisé' : null;
            },
        });
        const label = await askText(state, `${key}Label`, 'Libellé', { maxLength: COMPONENT_LIMITS.buttonLabel });
        const buttonStyle = await prompter.choose('Style', BUTTON_STYLES.map((value) => ({
            label: value,
            value,
            hint: value === 'link' ? 'ouvre une URL, aucune interaction' : undefined,
        })));

        const button: ButtonSpec = { key, label, style: buttonStyle, disabled: false };
        if (buttonStyle === 'link') {
            const dynamic = await prompter.confirm('URL fournie par la logique (sinon URL fixe) ?', false);
            button.url = dynamic
                ? { kind: 'dynamic', field: await prompter.text('Nom de la propriété dans `data`', { default: `${key}Url`, validate: (value) => (CAMEL_CASE.test(value) ? null : 'camelCase attendu') }) }
                : { kind: 'static', url: await prompter.text('URL', { validate: validateUrl }) };
        } else {
            button.customId = await askCustomId(state, `${kebabCase(spec.feature)}-${kebabCase(spec.name)}-${kebabCase(key)}`);
        }
        button.emoji = await askOptionalEmoji(prompter);
        spec.buttons.push(button);
    } while (spec.buttons.length < COMPONENT_LIMITS.buttons && await prompter.confirm('Ajouter un autre bouton ?', false));
}

async function askStaticOptions(state: WizardState): Promise<void> {
    const { prompter, spec } = state;
    do {
        const index = spec.options.length;
        prompter.say(style.bold(`  Option n°${index + 1}`));
        const value = await prompter.text('Valeur renvoyée à la sélection (ex: weapons)', {
            validate: (text) => (spec.options.some((option) => option.value === text) ? 'valeur déjà utilisée' : null),
        });
        const key = CAMEL_CASE.test(toCamelCase(value)) ? toCamelCase(value) : `option${index + 1}`;
        const label = await askText(state, `${key}Label`, 'Libellé', { maxLength: COMPONENT_LIMITS.optionLabel });
        const description = await prompter.confirm('Description sous le libellé ?', false)
            ? await askText(state, `${key}Description`, 'Description', { maxLength: COMPONENT_LIMITS.optionDescription })
            : undefined;
        const emoji = await askOptionalEmoji(prompter);
        spec.options.push({ value, label, description, emoji, isDefault: false });
    } while (spec.options.length < COMPONENT_LIMITS.options && await prompter.confirm('Ajouter une autre option ?', true));
}

async function askSelect(state: WizardState): Promise<void> {
    const { prompter, spec } = state;
    spec.customId = await askCustomId(state, `${kebabCase(spec.feature)}-${kebabCase(spec.name)}`);
    if (await prompter.confirm('Texte affiché avant sélection (placeholder) ?', true)) {
        spec.placeholder = await askText(state, 'placeholder', 'Placeholder', { maxLength: COMPONENT_LIMITS.placeholder });
    }

    if (spec.kind === 'stringSelect') {
        spec.dynamicOptions = await prompter.choose('Options du menu ?', [
            { label: 'Fixes', value: false, hint: 'libellés traduits écrits maintenant' },
            { label: 'Dynamiques', value: true, hint: 'liste passée par la logique (data.options)' },
        ]);
        if (!spec.dynamicOptions) await askStaticOptions(state);
    }
    if (spec.kind === 'channelSelect') {
        CHANNEL_TYPES.forEach((type, index) => prompter.say(`  ${style.bold(String(index + 1))}. ${type}`));
        const picked = await prompter.text('Types de salons proposés (numéros séparés par des virgules, vide = tous)', {
            allowEmpty: true,
            validate: (value) => (/^\s*\d+(\s*,\s*\d+)*\s*$/.test(value) ? null : 'Exemple : 1,2'),
        });
        spec.channelTypes = picked ? picked.split(',').map((part) => CHANNEL_TYPES[Number(part.trim()) - 1]).filter(Boolean) : [];
    }
    if (await prompter.confirm('Plusieurs choix possibles ?', false)) {
        const max = spec.dynamicOptions || spec.kind !== 'stringSelect' ? COMPONENT_LIMITS.options : spec.options.length;
        const range = (min: number) => (value: string) => {
            const number = Number(value);
            return Number.isInteger(number) && number >= min && number <= max ? null : `entier entre ${min} et ${max}`;
        };
        spec.minValues = Number(await prompter.text('Nombre minimum de choix', { default: '1', validate: range(0) }));
        spec.maxValues = Number(await prompter.text('Nombre maximum de choix', { default: String(max), validate: range(Math.max(1, spec.minValues)) }));
    }
}

async function runComponentWizard(prompter: Prompter, context: GeneratorContext): Promise<ComponentSpec> {
    prompter.say(heading('Emplacement'));
    const feature = await askFeature(prompter, context, 'À quelle feature appartient le component ?');
    const kind = await prompter.choose('Type de component ?', [
        { label: 'Boutons', value: 'buttons' as const, hint: `jusqu'à ${COMPONENT_LIMITS.buttons} par ligne` },
        { label: 'Menu à options', value: 'stringSelect' as const, hint: 'options fixes ou dynamiques' },
        { label: 'Menu de membres', value: 'userSelect' as const },
        { label: 'Menu de rôles', value: 'roleSelect' as const },
        { label: 'Menu de salons', value: 'channelSelect' as const },
        { label: 'Menu de membres et rôles', value: 'mentionableSelect' as const },
    ]);

    const files = listFeatureFiles(context.changes, context.root, feature, 'components');
    const defaultFile = kind === 'buttons' ? 'Buttons' : 'SelectMenus';
    const file = await prompter.choose<string>('Dans quel fichier ?', [
        ...files.map((name) => ({ label: name, value: name.replace(/\.ts$/, '') })),
        ...(files.includes(`${defaultFile}.ts`) ? [] : [{ label: `${defaultFile}.ts`, value: defaultFile, hint: 'nouveau fichier' }]),
    ]);

    const spec: ComponentSpec = {
        feature, file, kind, name: '', keyPrefix: '', summary: '',
        options: [], dynamicOptions: false, channelTypes: [], buttons: [], placeholderTypes: {},
    };
    spec.name = normalizeComponentName(await prompter.text('Nom du component (ex: item category)', {
        validate: (value) => checkName({ ...spec, name: normalizeComponentName(value) }, context),
    }));
    const reference = readReferenceLocale(context.changes, context, feature);
    spec.keyPrefix = await prompter.text('Préfixe des clés de traduction', {
        default: toCamelCase(spec.name),
        validate: (value) => checkKeyPrefix(value, reference),
    });
    spec.summary = await prompter.text('Rôle du component, en une phrase (documentation)', { validate: noEmoji });

    const state: WizardState = { prompter, context, spec, taken: existingCustomIds(context), translateNow: await askTranslateNow(prompter, context) };
    prompter.say(heading(kind === 'buttons' ? 'Boutons' : 'Menu'));
    if (kind === 'buttons') await askButtons(state);
    else await askSelect(state);

    for (const placeholder of new Set(componentTexts(spec).flatMap(elementPlaceholders))) {
        spec.placeholderTypes[placeholder] = await prompter.choose(`Type de {${placeholder}} ?`, [
            { label: 'string', value: 'string' as const },
            { label: 'number', value: 'number' as const },
        ]);
    }

    const errors = checkComponentSpec(spec, context);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return spec;
}

// ---------------------------------------------------------------------------
// Aperçu et fichiers
// ---------------------------------------------------------------------------

function renderPreview(row: APIActionRowComponent<APIComponentInActionRow>): string {
    return row.components.map((component) => {
        if ('label' in component && component.label) return `  [ ${component.label} ]${'url' in component ? style.dim('  -> lien') : ''}`;
        const placeholder = 'placeholder' in component ? component.placeholder ?? '' : '';
        const options = 'options' in component ? component.options.map((option) => `      - ${option.label}${option.description ? style.dim(`  ${option.description}`) : ''}`) : [];
        return [`  [ ${placeholder || 'Sélection'} ▾ ]`, ...options].join('\n');
    }).join('\n');
}

function planComponent(spec: ComponentSpec, context: GeneratorContext) {
    const names = ensureFeature(context, spec.feature);
    planTexts(context, spec.feature, spec.keyPrefix, componentTexts(spec));

    const file = componentFile(context, spec);
    let source = context.changes.read(file) ?? `${generateComponentFileHeader(spec.feature)}\n`;
    source = ensureNamedImports(source, 'discord.js', discordImports(spec));
    source = ensureNamedImports(source, '../translations', [names.translatorType]);
    const blocks = [generateCustomIdConstant(spec), generateComponentDataInterface(spec), generateComponentFunction(spec, names.translatorType)];
    context.changes.write(file, appendBlock(source, blocks.filter(Boolean).join('\n\n')));

    const testFile = path.join(paths.featureTests(context.root, spec.feature), 'components', `${spec.file}.test.ts`);
    let test = context.changes.read(testFile) ?? '';
    const imported = generateComponentDataInterface(spec) ? [componentFunctionName(spec), componentDataTypeName(spec)] : [componentFunctionName(spec)];
    test = ensureNamedImports(test, `@/features/${spec.feature}/components/${spec.file}`, imported);
    test = ensureNamedImports(test, `@/features/${spec.feature}/translations`, [names.translationsName]);
    test = ensureNamedImports(test, '@/shared/i18n', ['SUPPORTED_LOCALES']);
    context.changes.write(testFile, appendBlock(test, generateComponentTestBlock(spec, names.translationsName)));
    return names;
}

export const componentGenerator: Generator<ComponentSpec> = {
    type: 'component',
    description: 'boutons / menus déroulants traduits (custom IDs exportés, test)',
    specHelp: SPEC_HELP,
    example: {
        type: 'component',
        feature: 'encyclopedia',
        name: 'ItemCategory',
        kind: 'stringSelect',
        summary: 'Menu de choix de la catégorie d\'objets',
        placeholder: { fr: 'Choisissez une catégorie', en: 'Choose a category', es: 'Elige una categoría' },
        options: [
            { value: 'weapons', label: { fr: 'Armes', en: 'Weapons', es: 'Armas' } },
            { value: 'armors', label: { fr: 'Armures', en: 'Armors', es: 'Armaduras' } },
        ],
    },

    interactive: runComponentWizard,
    fromInput: componentFromInput,

    preview(spec, context) {
        return context.locales.map((locale) => `[${locale}]\n${renderPreview(buildPreview(spec, locale, context.defaultLocale))}`).join('\n\n');
    },

    plan(spec, context) {
        const names = planComponent(spec, context);
        const untranslated = untranslatedKeys(spec.keyPrefix, componentTexts(spec));
        return {
            usage: generateComponentUsage(spec, names.translationsName),
            notes: [
                `npm test en local : crée le snapshot de ${componentFunctionName(spec)}`,
                ...(untranslated.length > 0 ? [`à traduire (texte ${context.defaultLocale} recopié) : ${untranslated.join(', ')}`] : []),
            ],
        };
    },
};

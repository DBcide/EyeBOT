import path from 'node:path';
import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { Generator } from '../shared/generator';
import { InputReader, SpecValidationError, throwIfErrors } from '../shared/input';
import { Prompter } from '../shared/Prompter';
import { listFeatureFiles, listFeatures, paths } from '../shared/project';
import { CAMEL_CASE, toCamelCase, toPascalCase, tsString } from '../shared/naming';
import { findPathConflict } from '../shared/localeJson';
import { heading, style } from '../shared/terminal';
import {
    GeneratorContext,
    TextElement,
    elementPlaceholders,
    planTexts,
    readReferenceLocale,
    textFromInput,
    untranslatedKeys,
} from '../shared/text';
import { askText, askTranslateNow, TextPromptState } from '../shared/textPrompts';
import { askFeature, checkFeatureReference, ensureFeature } from '../feature/generator';

/**
 * Générateur de commandes slash : `npm run create:command`
 *
 * Crée `features/<feature>/commands/<Nom>Command.ts` (auto-découvert par Bot.ts) :
 * description et options traduites (`commands.<nom>.*`, localisations Discord comprises),
 * permissions, réponse par défaut traduite, et un test (snapshot de la définition + réponse).
 */

const OPTION_TYPES = ['string', 'integer', 'number', 'boolean', 'user', 'channel', 'role', 'mentionable', 'attachment'] as const;
type OptionType = (typeof OPTION_TYPES)[number];

const OPTION_METHOD: Record<OptionType, string> = {
    string: 'String', integer: 'Integer', number: 'Number', boolean: 'Boolean', user: 'User',
    channel: 'Channel', role: 'Role', mentionable: 'Mentionable', attachment: 'Attachment',
};

const WITH_CHOICES: OptionType[] = ['string', 'integer', 'number'];

/** Limites Discord des commandes slash */
const LIMITS = { description: 100, options: 25, choices: 25, choiceName: 100 };

/** Nom de commande / d'option accepté par Discord (version ASCII) */
const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

interface ChoiceSpec {
    value: string | number;
    name: TextElement;
}

interface OptionSpec {
    name: string;
    /** Clé de traduction (camelCase du nom) */
    key: string;
    type: OptionType;
    description: TextElement;
    required: boolean;
    choices: ChoiceSpec[];
    min?: number;
    max?: number;
}

export interface CommandSpec {
    feature: string;
    name: string;
    description: TextElement;
    options: OptionSpec[];
    /** Nom d'un flag PermissionFlagsBits (ex: 'ManageGuild') : commande masquée aux autres membres */
    permission?: string;
    guildOnly: boolean;
    ephemeral: boolean;
    reply: TextElement;
}

const SPEC_HELP = `{
  "feature": "encyclopedia",
  "name": "item",                     // nom slash : minuscules, chiffres, - ou _ (32 max) → commands/ItemCommand.ts
  "description": TEXT,                // 100 caractères max
  "options": [{ "name": "nom", "type": "string", "description": TEXT, "required": true,
                "choices": [{ "value": "weapons", "name": TEXT }],   // string / integer / number
                "min": 1, "max": 50 }],                              // longueur (string) ou valeur (integer / number)
  "permission": "ManageGuild",        // optionnel : flag PermissionFlagsBits requis
  "guildOnly": true,                  // défaut true : commande indisponible en MP
  "ephemeral": true,                  // défaut true : réponse visible du seul utilisateur
  "reply": TEXT                       // réponse par défaut de execute() (à remplacer par la logique)
}
TEXT : "texte fr" | { "fr": "…", "en": "…", "es": "…" }     types : ${OPTION_TYPES.join(' | ')}
Les options obligatoires sont placées avant les optionnelles (règle Discord).`;

const commandKey = (name: string) => toCamelCase(name);
const className = (name: string) => `${toPascalCase(name)}Command`;
const commandPrefix = (spec: Pick<CommandSpec, 'name'>) => `commands.${commandKey(spec.name)}`;

function descriptionKey(option: OptionSpec): string {
    return `options.${option.key}`;
}

function choiceKey(option: OptionSpec, choice: ChoiceSpec, index: number): string {
    const key = toCamelCase(String(choice.value));
    return `choices.${option.key}.${CAMEL_CASE.test(key) ? key : `choice${index + 1}`}`;
}

function commandTexts(spec: CommandSpec): TextElement[] {
    return [spec.description, ...spec.options.flatMap((option) => [option.description, ...option.choices.map((choice) => choice.name)])];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Noms des commandes existantes (toutes features) */
function existingCommandNames(context: GeneratorContext): string[] {
    return listFeatures(context.changes, context.root).flatMap((feature) => {
        const directory = path.join(paths.feature(context.root, feature), 'commands');
        return listFeatureFiles(context.changes, context.root, feature, 'commands').flatMap((file) =>
            Array.from((context.changes.read(path.join(directory, file)) ?? '').matchAll(/public name = '([^']+)'/g), (match) => match[1]));
    });
}

function checkCommandName(name: string, context: GeneratorContext, feature?: string): string | null {
    if (!COMMAND_NAME.test(name)) return 'minuscules, chiffres, "-" ou "_" (1 à 32 caractères)';
    if (existingCommandNames(context).includes(name)) return `la commande /${name} existe déjà`;
    if (!feature) return null;
    if (context.changes.read(path.join(paths.feature(context.root, feature), 'commands', `${className(name)}.ts`)) !== null) {
        return `${className(name)}.ts existe déjà`;
    }
    const reference = readReferenceLocale(context.changes, context, feature);
    return findPathConflict(reference, ['commands', commandKey(name)]) ?? findPathConflict(reference, [commandKey(name), 'reply']);
}

function checkPermission(name: string): string | null {
    return name in PermissionFlagsBits ? null : 'flag PermissionFlagsBits inconnu (ex: ManageGuild, Administrator)';
}

/** Options obligatoires d'abord (Discord refuse une option obligatoire après une optionnelle) */
function sortOptions(options: OptionSpec[]): OptionSpec[] {
    return [...options.filter((option) => option.required), ...options.filter((option) => !option.required)];
}

interface OptionLike {
    setName(name: string): OptionLike;
    setDescription(description: string): OptionLike;
    setRequired(required: boolean): OptionLike;
    addChoices?(...choices: { name: string; value: string | number }[]): OptionLike;
    setMinValue?(value: number): OptionLike;
    setMaxValue?(value: number): OptionLike;
    setMinLength?(value: number): OptionLike;
    setMaxLength?(value: number): OptionLike;
}

/** Construit la commande avec discord.js dans une langue (valide noms, longueurs, choix) */
function buildPreview(spec: CommandSpec, locale: string, defaultLocale: string) {
    const read = (element: TextElement) => {
        const value = element.values[locale] ?? element.values[defaultLocale];
        return Array.isArray(value) ? value.join('\n') : value;
    };
    const builder = new SlashCommandBuilder().setName(spec.name).setDescription(read(spec.description));
    if (spec.permission) builder.setDefaultMemberPermissions(PermissionFlagsBits[spec.permission as keyof typeof PermissionFlagsBits]);
    if (spec.guildOnly) builder.setContexts(InteractionContextType.Guild);

    for (const option of spec.options) {
        const adder = (builder as unknown as Record<string, (fn: (o: OptionLike) => OptionLike) => unknown>)[`add${OPTION_METHOD[option.type]}Option`];
        adder.call(builder, (o) => {
            o.setName(option.name).setDescription(read(option.description)).setRequired(option.required);
            if (option.choices.length > 0) o.addChoices!(...option.choices.map((choice) => ({ name: read(choice.name), value: choice.value })));
            if (option.type === 'string') {
                if (option.min !== undefined) o.setMinLength!(option.min);
                if (option.max !== undefined) o.setMaxLength!(option.max);
            } else {
                if (option.min !== undefined) o.setMinValue?.(option.min);
                if (option.max !== undefined) o.setMaxValue?.(option.max);
            }
            return o;
        });
    }
    return builder.toJSON();
}

function checkCommandSpec(spec: CommandSpec, context: GeneratorContext): string[] {
    const errors: string[] = [];
    if (spec.options.length > LIMITS.options) errors.push(`options : ${LIMITS.options} maximum`);
    const names = spec.options.map((option) => option.name);
    if (new Set(names).size !== names.length) errors.push('options : noms en double');
    for (const element of [...commandTexts(spec), spec.reply]) {
        const placeholders = elementPlaceholders(element);
        if (placeholders.length > 0) errors.push(`${element.key} : placeholders non pris en charge ({${placeholders[0]}})`);
    }
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

function readChoices(option: InputReader, spec: OptionSpec, context: GeneratorContext): ChoiceSpec[] {
    const choices = option.array('choices');
    if (choices.length > 0 && !WITH_CHOICES.includes(spec.type)) {
        option.errors.push(`${option.path('choices')} : réservé aux types ${WITH_CHOICES.join(', ')}`);
        return [];
    }
    if (choices.length > LIMITS.choices) option.errors.push(`${option.path('choices')} : ${LIMITS.choices} maximum`);
    return choices.flatMap((raw, index) => {
        const choice = InputReader.of(raw, `${option.path('choices')}[${index}]`, option.errors);
        if (!choice) return [];
        choice.allowOnly(['value', 'name']);
        const value = spec.type === 'string' ? choice.string('value', { required: true }) : choice.number('value');
        if (value === undefined) {
            if (!choice.has('value') && spec.type !== 'string') option.errors.push(`${choice.path('value')} : nombre obligatoire`);
            return [];
        }
        const partial = { value, name: { key: '', values: {}, untranslated: [] } };
        const name = textFromInput(choice.raw('name'), choiceKey(spec, partial, index), choice.path('name'), context, LIMITS.choiceName, option.errors);
        return name ? [{ value, name }] : [];
    });
}

function readOptions(input: InputReader, context: GeneratorContext): OptionSpec[] {
    return input.array('options').flatMap((raw, index) => {
        const option = InputReader.of(raw, `${input.path('options')}[${index}]`, input.errors);
        if (!option) return [];
        option.allowOnly(['name', 'type', 'description', 'required', 'choices', 'min', 'max']);
        const name = option.string('name', { required: true, validate: (value) => (COMMAND_NAME.test(value) ? null : 'minuscules, chiffres, "-" ou "_" (32 max)') });
        const type = option.oneOf('type', OPTION_TYPES, 'string')!;
        if (!name) return [];
        const spec: OptionSpec = {
            name, key: toCamelCase(name), type, required: option.boolean('required', false), choices: [],
            description: { key: '', values: {}, untranslated: [] },
            min: option.number('min'), max: option.number('max'),
        };
        if ((spec.min !== undefined || spec.max !== undefined) && !['string', 'integer', 'number'].includes(type)) {
            input.errors.push(`${option.path('min')} : réservé aux types string, integer, number`);
        }
        const description = textFromInput(option.raw('description'), descriptionKey(spec), option.path('description'), context, LIMITS.description, input.errors);
        if (!description) return [];
        spec.description = description;
        spec.choices = readChoices(option, spec, context);
        return [spec];
    });
}

function commandFromInput(raw: unknown, where: string, context: GeneratorContext): CommandSpec {
    const errors: string[] = [];
    const input = InputReader.of(raw, where, errors);
    if (!input) throw new SpecValidationError(errors);
    input.allowOnly(['type', 'feature', 'name', 'description', 'options', 'permission', 'guildOnly', 'ephemeral', 'reply']);

    const feature = input.string('feature', { required: true, validate: checkFeatureReference }) ?? '';
    const name = input.string('name', { required: true, validate: (value) => checkCommandName(value, context, feature || undefined) }) ?? '';
    const description = textFromInput(input.raw('description'), 'description', input.path('description'), context, LIMITS.description, errors);
    const reply = input.has('reply')
        ? textFromInput(input.raw('reply'), 'reply', input.path('reply'), context, 2000, errors)
        : textFromInput(`Commande /${name} : réponse à définir.`, 'reply', input.path('reply'), context, 2000, errors);

    const spec: CommandSpec = {
        feature, name,
        description: description ?? { key: 'description', values: {}, untranslated: [] },
        options: sortOptions(readOptions(input, context)),
        permission: input.string('permission', { validate: checkPermission }),
        guildOnly: input.boolean('guildOnly', true),
        ephemeral: input.boolean('ephemeral', true),
        reply: reply ?? { key: 'reply', values: {}, untranslated: [] },
    };
    throwIfErrors(errors);
    throwIfErrors(checkCommandSpec(spec, context).map((error) => `${where || 'command'} : ${error}`));
    return spec;
}

// ---------------------------------------------------------------------------
// Mode interactif
// ---------------------------------------------------------------------------

const PERMISSION_SHORTLIST = ['ManageGuild', 'ManageRoles', 'ManageMessages', 'ModerateMembers', 'Administrator'];

async function askOption(state: TextPromptState, used: string[]): Promise<OptionSpec> {
    const { prompter } = state;
    const name = await prompter.text('Nom de l\'option (minuscules, ex: pseudo)', {
        validate: (value) => {
            if (!COMMAND_NAME.test(value)) return 'minuscules, chiffres, "-" ou "_"';
            return used.includes(value) ? 'option déjà définie' : null;
        },
    });
    const type = await prompter.choose('Type', OPTION_TYPES.map((value) => ({ label: value, value })));
    const option: OptionSpec = { name, key: toCamelCase(name), type, required: false, choices: [], description: { key: '', values: {}, untranslated: [] } };
    option.description = await askText(state, descriptionKey(option), 'Description de l\'option', { maxLength: LIMITS.description });
    option.required = await prompter.confirm('Obligatoire ?', true);

    if (WITH_CHOICES.includes(type) && await prompter.confirm('Choix prédéfinis (liste fermée) ?', false)) {
        do {
            const value = await prompter.text('Valeur du choix', {
                validate: (text) => (type === 'string' || Number.isFinite(Number(text)) ? null : 'nombre attendu'),
            });
            const partial: ChoiceSpec = { value: type === 'string' ? value : Number(value), name: { key: '', values: {}, untranslated: [] } };
            partial.name = await askText(state, choiceKey(option, partial, option.choices.length), 'Nom affiché du choix', { maxLength: LIMITS.choiceName });
            option.choices.push(partial);
        } while (option.choices.length < LIMITS.choices && await prompter.confirm('Ajouter un autre choix ?', true));
    }
    return option;
}

async function runCommandWizard(prompter: Prompter, context: GeneratorContext): Promise<CommandSpec> {
    prompter.say(heading('Commande'));
    const feature = await askFeature(prompter, context, 'À quelle feature appartient la commande ?');
    const name = await prompter.text('Nom de la commande slash (ex: item → /item)', { validate: (value) => checkCommandName(value, context, feature) });
    const state: TextPromptState = { prompter, context, translateNow: await askTranslateNow(prompter, context) };
    const description = await askText(state, 'description', 'Description (visible dans Discord)', { maxLength: LIMITS.description });

    const options: OptionSpec[] = [];
    let question = 'Options (paramètres de la commande) ?';
    while (options.length < LIMITS.options && await prompter.confirm(question, false)) {
        prompter.say(style.bold(`  Option n°${options.length + 1}`));
        options.push(await askOption(state, options.map((option) => option.name)));
        question = 'Ajouter une autre option ?';
    }

    const permission = await prompter.choose<string | undefined>('Permission requise pour voir la commande ?', [
        { label: 'Aucune', value: undefined, hint: 'tous les membres' },
        ...PERMISSION_SHORTLIST.map((value) => ({ label: value, value })),
    ]);
    const guildOnly = await prompter.confirm('Uniquement sur un serveur (pas en MP) ?', true);
    const ephemeral = await prompter.confirm('Réponse visible uniquement par l\'utilisateur ?', true);
    const reply = await askText(state, 'reply', 'Réponse par défaut (à remplacer par la logique)', { maxLength: 2000 });

    const spec: CommandSpec = { feature, name, description, options: sortOptions(options), permission, guildOnly, ephemeral, reply };
    const errors = checkCommandSpec(spec, context);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return spec;
}

// ---------------------------------------------------------------------------
// Code généré
// ---------------------------------------------------------------------------

const I1 = '    ';

function optionCode(spec: CommandSpec, option: OptionSpec, translations: string): string[] {
    const key = (relative: string) => tsString(`${commandPrefix(spec)}.${relative}`);
    const lines = [
        `.add${OPTION_METHOD[option.type]}Option((option) =>`,
        `${I1}option`,
        `${I1}${I1}.setName(${tsString(option.name)})`,
        `${I1}${I1}.setDescription(${translations}.defaultText(${key(descriptionKey(option))}))`,
        `${I1}${I1}.setDescriptionLocalizations(${translations}.discordLocalizations(${key(descriptionKey(option))}))`,
    ];
    if (option.required) lines.push(`${I1}${I1}.setRequired(true)`);
    const [minMethod, maxMethod] = option.type === 'string' ? ['setMinLength', 'setMaxLength'] : ['setMinValue', 'setMaxValue'];
    if (option.min !== undefined) lines.push(`${I1}${I1}.${minMethod}(${option.min})`);
    if (option.max !== undefined) lines.push(`${I1}${I1}.${maxMethod}(${option.max})`);
    if (option.choices.length > 0) {
        lines.push(`${I1}${I1}.addChoices(`);
        option.choices.forEach((choice, index) => {
            const choiceTextKey = key(choiceKey(option, choice, index));
            const value = typeof choice.value === 'string' ? tsString(choice.value) : String(choice.value);
            lines.push(
                `${I1}${I1}${I1}{`,
                `${I1}${I1}${I1}${I1}name: ${translations}.defaultText(${choiceTextKey}),`,
                `${I1}${I1}${I1}${I1}name_localizations: ${translations}.discordLocalizations(${choiceTextKey}),`,
                `${I1}${I1}${I1}${I1}value: ${value},`,
                `${I1}${I1}${I1}},`
            );
        });
        lines.push(`${I1}${I1})`);
    }
    lines.push(')');
    return lines;
}

const GETTERS: Record<OptionType, string> = {
    string: 'getString', integer: 'getInteger', number: 'getNumber', boolean: 'getBoolean', user: 'getUser',
    channel: 'getChannel', role: 'getRole', mentionable: 'getMentionable', attachment: 'getAttachment',
};

function generateCommandFile(spec: CommandSpec, translations: string): string {
    const imports = ['ChatInputCommandInteraction', 'SlashCommandBuilder'];
    if (spec.ephemeral) imports.push('MessageFlagsBitField');
    if (spec.permission) imports.push('PermissionFlagsBits');
    if (spec.guildOnly) imports.push('InteractionContextType');
    imports.sort((a, b) => a.localeCompare(b));

    const description = spec.description.values[Object.keys(spec.description.values)[0]];
    const chain = [
        '.setName(this.name)',
        '.setDescription(this.description)',
        `.setDescriptionLocalizations(${translations}.discordLocalizations(${tsString(`${commandPrefix(spec)}.description`)}))`,
        ...(spec.permission ? [`.setDefaultMemberPermissions(PermissionFlagsBits.${spec.permission})`] : []),
        ...(spec.guildOnly ? ['.setContexts(InteractionContextType.Guild)'] : []),
        ...spec.options.flatMap((option) => optionCode(spec, option, translations)),
    ];
    chain[chain.length - 1] += spec.options.length > 0 ? ' as SlashCommandBuilder;' : ';';

    const reply = `translate(${tsString(`${commandKey(spec.name)}.reply`)})`;
    const replyCall = spec.ephemeral
        ? `await interaction.reply({ content: ${reply}, flags: MessageFlagsBitField.Flags.Ephemeral });`
        : `await interaction.reply(${reply});`;

    return [
        `import { ${imports.join(', ')} } from 'discord.js';`,
        'import { BaseCommand } from \'../../../core/BaseCommand\';',
        `import { ${translations} } from '../translations';`,
        '',
        '/**',
        ` * Commande /${spec.name} : ${Array.isArray(description) ? description.join(' ') : description}`.replace(/\p{Extended_Pictographic}️?\s*/gu, ''),
        ...(spec.options.length > 0
            ? [' *', ' * @remarks', ' * Options (lecture dans execute()) :',
                ...spec.options.map((option) => ` * - \`${option.name}\` (${option.type}${option.required ? ', obligatoire' : ''}) : \`interaction.options.${GETTERS[option.type]}('${option.name}'${option.required ? ', true' : ''})\``)]
            : []),
        ' */',
        `export default class ${className(spec.name)} extends BaseCommand {`,
        `${I1}public name = ${tsString(spec.name)};`,
        `${I1}public description = ${translations}.defaultText(${tsString(`${commandPrefix(spec)}.description`)});`,
        '',
        `${I1}/**`,
        `${I1} * Construit la définition de la commande slash (envoyée à Discord par \`npm run register\`)`,
        `${I1} */`,
        `${I1}public buildCommand(): SlashCommandBuilder {`,
        `${I1}${I1}return new SlashCommandBuilder()`,
        ...chain.map((line) => `${I1}${I1}${I1}${line}`),
        `${I1}}`,
        '',
        `${I1}/**`,
        `${I1} * Exécute la commande`,
        `${I1} *`,
        `${I1} * @param interaction - L'interaction Discord de la commande slash`,
        `${I1} */`,
        `${I1}public async execute(interaction: ChatInputCommandInteraction): Promise<void> {`,
        `${I1}${I1}const translate = ${translations}.forLocale(await this.resolveLocale(interaction));`,
        `${I1}${I1}${replyCall}`,
        `${I1}}`,
        '}',
        '',
    ].join('\n');
}

function generateCommandTest(spec: CommandSpec): string {
    const name = className(spec.name);
    return [
        `import ${name} from '@/features/${spec.feature}/commands/${name}';`,
        'import { ChatInputCommandInteraction } from \'discord.js\';',
        '',
        `describe('${name}', () => {`,
        `${I1}it('[snapshot] définition envoyée à Discord (npm run register)', () => {`,
        `${I1}${I1}expect(new ${name}().buildCommand().toJSON()).toMatchSnapshot();`,
        `${I1}});`,
        '',
        `${I1}it('[positif] répond à l\\'utilisateur', async () => {`,
        `${I1}${I1}const interaction = { user: { id: 'user-1' }, locale: 'fr', reply: jest.fn().mockResolvedValue(undefined) };`,
        '',
        `${I1}${I1}await new ${name}().execute(interaction as unknown as ChatInputCommandInteraction);`,
        '',
        `${I1}${I1}expect(interaction.reply).toHaveBeenCalledTimes(1);`,
        `${I1}});`,
        '});',
        '',
    ].join('\n');
}

function renderPreview(json: ReturnType<typeof buildPreview>): string {
    const options = (json.options ?? []).map((option) => {
        const required = 'required' in option && option.required ? '' : '?';
        return `${option.name}${required}`;
    });
    return `  /${json.name} ${options.join(' ')}\n  ${style.dim(json.description)}`;
}

export const commandGenerator: Generator<CommandSpec> = {
    type: 'command',
    description: 'commande slash traduite (options, permissions, réponse, test)',
    specHelp: SPEC_HELP,
    example: {
        type: 'command',
        feature: 'encyclopedia',
        name: 'item',
        description: { fr: 'Afficher la fiche d\'un objet', en: 'Show an item sheet', es: 'Mostrar la ficha de un objeto' },
        options: [{ name: 'nom', type: 'string', required: true, description: { fr: 'Nom de l\'objet', en: 'Item name', es: 'Nombre del objeto' } }],
        ephemeral: false,
    },

    interactive: runCommandWizard,
    fromInput: commandFromInput,

    preview(spec, context) {
        return context.locales.map((locale) => `[${locale}]\n${renderPreview(buildPreview(spec, locale, context.defaultLocale))}`).join('\n\n');
    },

    plan(spec, context) {
        const names = ensureFeature(context, spec.feature);
        planTexts(context, spec.feature, commandPrefix(spec), commandTexts(spec));
        planTexts(context, spec.feature, commandKey(spec.name), [spec.reply]);

        const file = path.join(paths.feature(context.root, spec.feature), 'commands', `${className(spec.name)}.ts`);
        context.changes.write(file, generateCommandFile(spec, names.translationsName));
        const testFile = path.join(paths.featureTests(context.root, spec.feature), 'commands', `${className(spec.name)}.test.ts`);
        context.changes.write(testFile, generateCommandTest(spec));

        const untranslated = [
            ...untranslatedKeys(commandPrefix(spec), commandTexts(spec)),
            ...untranslatedKeys(commandKey(spec.name), [spec.reply]),
        ];
        return {
            usage: `// Logique à écrire dans ${className(spec.name)}.execute() (réponse par défaut : ${commandKey(spec.name)}.reply)`,
            notes: [
                'npm run register : enregistre la commande auprès de Discord',
                `npm test en local : crée le snapshot de ${className(spec.name)}`,
                ...(untranslated.length > 0 ? [`à traduire (texte ${context.defaultLocale} recopié) : ${untranslated.join(', ')}`] : []),
            ],
        };
    },
};

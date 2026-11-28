import { TextElement, elementPlaceholders } from '../shared/text';

/**
 * Description d'un component à générer (ligne d'action Discord)
 *
 * - `buttons` : jusqu'à 5 boutons (styles primary/secondary/success/danger, ou link vers une URL)
 * - `stringSelect` : menu à options fixes (traduites) ou fournies par la logique (`data.options`)
 * - `userSelect` / `roleSelect` / `channelSelect` / `mentionableSelect` : menus remplis par Discord
 */

export const COMPONENT_KINDS = ['buttons', 'stringSelect', 'userSelect', 'roleSelect', 'channelSelect', 'mentionableSelect'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const BUTTON_STYLES = ['primary', 'secondary', 'success', 'danger', 'link'] as const;
export type ButtonStyleName = (typeof BUTTON_STYLES)[number];

/** Types de salons proposables par un channelSelect (noms de l'enum ChannelType de discord.js) */
export const CHANNEL_TYPES = [
    'GuildText', 'GuildVoice', 'GuildCategory', 'GuildAnnouncement', 'GuildStageVoice', 'GuildForum', 'GuildMedia',
    'PublicThread', 'PrivateThread', 'AnnouncementThread',
] as const;

/** Limites Discord des components */
export const COMPONENT_LIMITS = {
    buttons: 5,
    buttonLabel: 80,
    customId: 100,
    placeholder: 150,
    options: 25,
    optionLabel: 100,
    optionDescription: 100,
    optionValue: 100,
};

/** URL d'un bouton link : fixe ou fournie par la logique (`data.<field>`) */
export type LinkSource = { kind: 'static'; url: string } | { kind: 'dynamic'; field: string };

export interface ButtonSpec {
    key: string;
    label: TextElement;
    style: ButtonStyleName;
    /** Absent pour un bouton link */
    customId?: string;
    url?: LinkSource;
    emoji?: string;
    disabled: boolean;
}

export interface SelectOptionSpec {
    value: string;
    label: TextElement;
    description?: TextElement;
    emoji?: string;
    isDefault: boolean;
}

export interface ComponentSpec {
    feature: string;
    /** Fichier `components/<file>.ts` (ex: 'SelectMenus', 'Buttons') */
    file: string;
    /** PascalCase (ex: 'ItemCategory' → buildItemCategorySelectMenu) */
    name: string;
    kind: ComponentKind;
    keyPrefix: string;
    summary: string;

    /** Menus : custom ID, placeholder, nombre de choix */
    customId?: string;
    placeholder?: TextElement;
    minValues?: number;
    maxValues?: number;
    /** stringSelect : options fixes */
    options: SelectOptionSpec[];
    /** stringSelect : options passées par la logique (`data.options`) */
    dynamicOptions: boolean;
    /** channelSelect : types de salons proposés (tous si vide) */
    channelTypes: string[];

    buttons: ButtonSpec[];

    /** Type des placeholders `{nom}` des textes */
    placeholderTypes: Record<string, 'string' | 'number'>;
}

export const isSelect = (kind: ComponentKind) => kind !== 'buttons';

/** Classe discord.js du menu */
export const SELECT_BUILDERS: Record<Exclude<ComponentKind, 'buttons'>, string> = {
    stringSelect: 'StringSelectMenuBuilder',
    userSelect: 'UserSelectMenuBuilder',
    roleSelect: 'RoleSelectMenuBuilder',
    channelSelect: 'ChannelSelectMenuBuilder',
    mentionableSelect: 'MentionableSelectMenuBuilder',
};

export function componentFunctionName(spec: Pick<ComponentSpec, 'name' | 'kind'>): string {
    return spec.kind === 'buttons' ? `build${spec.name}Buttons` : `build${spec.name}SelectMenu`;
}

export function componentDataTypeName(spec: Pick<ComponentSpec, 'name' | 'kind'>): string {
    return spec.kind === 'buttons' ? `${spec.name}ButtonsData` : `${spec.name}SelectMenuData`;
}

/** "item category" → "ITEM_CATEGORY" */
export function constantCase(pascal: string): string {
    return pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Nom de la constante des custom IDs (ex: ITEM_CATEGORY_SELECT_ID, CONFIRM_BUTTON_IDS) */
export function customIdConstant(spec: Pick<ComponentSpec, 'name' | 'kind'>): string {
    return spec.kind === 'buttons' ? `${constantCase(spec.name)}_BUTTON_IDS` : `${constantCase(spec.name)}_SELECT_ID`;
}

/** "ItemCategory" → "item-category" */
export function kebabCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

/** Tous les textes du component */
export function componentTexts(spec: ComponentSpec): TextElement[] {
    return [
        spec.placeholder,
        ...spec.options.flatMap((option) => [option.label, option.description]),
        ...spec.buttons.map((button) => button.label),
    ].filter((element): element is TextElement => element !== undefined);
}

/** Champs de l'objet `data` : placeholders, options dynamiques, URLs dynamiques */
export function componentDataFields(spec: ComponentSpec): { name: string; type: string; doc: string }[] {
    const placeholders = [...new Set(componentTexts(spec).flatMap(elementPlaceholders))];
    const fields: { name: string; type: string; doc: string }[] = placeholders.map((name) => ({
        name,
        type: spec.placeholderTypes[name] ?? 'string',
        doc: `Valeur du placeholder {${name}}`,
    }));
    if (spec.dynamicOptions) {
        fields.push({ name: 'options', type: 'SelectMenuComponentOptionData[]', doc: `Options proposées (${COMPONENT_LIMITS.options} premières affichées)` });
    }
    for (const button of spec.buttons) {
        if (button.url?.kind === 'dynamic') fields.push({ name: button.url.field, type: 'string', doc: `URL du bouton ${button.key}` });
    }
    return fields;
}

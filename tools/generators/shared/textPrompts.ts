import { Prompter } from './Prompter';
import { style } from './terminal';
import { extractPlaceholders, matchShape } from './localeJson';
import { GeneratorContext, TextElement, checkTextValue, needsTranslation } from './text';

/**
 * Saisie interactive des textes traduits
 */

export interface TextPromptOptions {
    multiline?: boolean;
    maxLength: number;
    /** Refuse certains noms de placeholders (ex: déjà utilisés pour une URL dynamique) */
    reservedPlaceholder?: (name: string) => string | null;
}

export interface TextPromptState {
    prompter: Prompter;
    context: Pick<GeneratorContext, 'locales' | 'defaultLocale'>;
    /** Demander aussi les textes des autres langues */
    translateNow: boolean;
}

function check(value: string | string[], options: TextPromptOptions): string | null {
    const error = checkTextValue(value, options.maxLength);
    if (error) return error;
    for (const name of extractPlaceholders(value)) {
        const reserved = options.reservedPlaceholder?.(name);
        if (reserved) return reserved;
    }
    return null;
}

async function askOne(
    state: TextPromptState,
    label: string,
    locale: string,
    options: TextPromptOptions,
    allowCopy: boolean
): Promise<string | string[] | null> {
    const copyHint = allowCopy ? style.dim(' — vide = reprendre le texte de référence') : '';
    for (;;) {
        let value: string | string[];
        if (options.multiline) {
            const lines = await state.prompter.multiline(`${label} [${locale}]${copyHint}`);
            value = lines.length > 1 ? lines : (lines[0] ?? '');
        } else {
            value = await state.prompter.text(`${label} [${locale}]${copyHint}`, { allowEmpty: true });
        }

        if (allowCopy && value.length === 0) return null;
        const error = check(value, options);
        if (!error) return value;
        state.prompter.say(style.red(`  ${error}`));
    }
}

/**
 * Demande un texte dans la langue de référence, puis (si demandé) dans les autres langues
 *
 * @remarks
 * Un texte non traduit reprend celui de la langue de référence et est signalé à la fin.
 * Une traduction prend la forme (chaîne / tableau) du texte de référence.
 */
export async function askText(state: TextPromptState, key: string, label: string, options: TextPromptOptions): Promise<TextElement> {
    const { defaultLocale, locales } = state.context;
    const reference = (await askOne(state, label, defaultLocale, options, false))!;

    const element: TextElement = { key, values: { [defaultLocale]: reference }, untranslated: [] };
    const translatable = needsTranslation(reference);
    for (const locale of locales.filter((code) => code !== defaultLocale)) {
        const translated = state.translateNow && translatable ? await askOne(state, label, locale, options, true) : null;
        if (translated === null) {
            element.values[locale] = reference;
            if (translatable) element.untranslated.push(locale);
        } else {
            element.values[locale] = matchShape(reference, translated);
        }
    }
    return element;
}

/** Demande si les textes des autres langues sont saisis maintenant */
export async function askTranslateNow(prompter: Prompter, context: Pick<GeneratorContext, 'locales' | 'defaultLocale'>): Promise<boolean> {
    const others = context.locales.filter((locale) => locale !== context.defaultLocale);
    if (others.length === 0) return false;
    return prompter.confirm(
        `Saisir aussi les textes en ${others.join(', ')} ? (non → texte ${context.defaultLocale} recopié, à traduire ensuite)`,
        true
    );
}

import { Choice, Prompter } from '../shared/Prompter';
import { heading, style } from '../shared/terminal';
import { EMOJI_CHAR, toPascalCase } from '../shared/naming';
import { PaletteColor } from '../shared/sourceEdit';
import { listFeatureFiles } from '../shared/project';
import { GeneratorContext, checkKeyPrefix, readReferenceLocale } from '../shared/text';
import { TextPromptOptions, TextPromptState, askText, askTranslateNow } from '../shared/textPrompts';
import { askFeature } from '../feature/generator';
import { ColorSpec, EmbedSpec, FieldSpec, TimestampSource, UrlSource, allPlaceholders, usedDataNames } from './spec';
import {
    EMBED_LIMITS,
    checkColorName,
    checkDynamicName,
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
 * Questions posées pour décrire un embed, élément par élément
 *
 * Chaque élément d'un embed Discord est optionnel : pour chacun, le terminal demande
 * s'il est présent puis comment le personnaliser.
 */

interface WizardState extends TextPromptState {
    context: GeneratorContext;
    spec: EmbedSpec;
}

const noEmoji = (value: string) =>
    EMOJI_CHAR.test(value) ? 'Pas d\'émoji ici (texte destiné au code, cf. tests/architecture.test.ts).' : null;

/** Options de saisie d'un texte : un placeholder ne peut pas reprendre le nom d'une URL / date dynamique */
function textOptions(state: WizardState, maxLength: number, multiline = false): TextPromptOptions {
    return {
        maxLength,
        multiline,
        reservedPlaceholder: (name) =>
            usedDataNames(state.spec).has(name) && !allPlaceholders(state.spec).includes(name)
                ? `{${name}} est déjà utilisé pour une URL ou une date dynamique.`
                : null,
    };
}

// ---------------------------------------------------------------------------
// Emplacement
// ---------------------------------------------------------------------------

async function askFile(state: WizardState, feature: string): Promise<string> {
    const files = listFeatureFiles(state.context.changes, state.context.root, feature, 'embeds')
        .filter((file) => /^[A-Z]\w*Embeds\.ts$/.test(file));
    if (files.length > 0) {
        const existing = await state.prompter.choose<string | null>('Dans quel fichier d\'embeds ?', [
            ...files.map((file) => ({ label: file, value: file.replace(/Embeds\.ts$/, '') })),
            { label: 'Nouveau fichier', value: null, hint: 'un fichier par commande' },
        ]);
        if (existing) return existing;
    }

    const name = await state.prompter.text('Commande ou thème du fichier (ex: profile → ProfileEmbeds.ts)', {
        validate: (value) => {
            const pascal = normalizeFileBaseName(value);
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(pascal)) return 'Lettres et chiffres ASCII uniquement.';
            return files.includes(`${pascal}Embeds.ts`) ? `${pascal}Embeds.ts existe déjà : choisissez-le dans la liste.` : null;
        },
    });
    return normalizeFileBaseName(name);
}

async function askLocation(state: WizardState): Promise<void> {
    const { prompter, context, spec } = state;
    spec.feature = await askFeature(prompter, context, 'À quelle feature appartient l\'embed ?');
    spec.fileBaseName = await askFile(state, spec.feature);

    const builders = existingBuilders(context.changes, context.root, spec.feature);
    spec.embedName = normalizeEmbedName(await prompter.text('Nom de l\'embed (ex: profile card → buildProfileCardEmbed)', {
        validate: (value) => checkEmbedName(normalizeEmbedName(value), builders),
    }));

    const reference = readReferenceLocale(context.changes, context, spec.feature);
    spec.keyPrefix = await prompter.text(`Préfixe des clés de traduction dans locales/${context.defaultLocale}.json`, {
        default: defaultKeyPrefix(spec.fileBaseName, spec.embedName),
        validate: (value) => checkKeyPrefix(value, reference),
    });
    spec.summary = await prompter.text('Rôle de l\'embed, en une phrase (documentation du builder)', { validate: noEmoji });
}

// ---------------------------------------------------------------------------
// URLs, couleur, horodatage
// ---------------------------------------------------------------------------

async function askDynamicName(state: WizardState, suggestion: string): Promise<string> {
    return state.prompter.text('Nom de la propriété dans `data` (camelCase)', {
        default: suggestion,
        validate: (value) => checkDynamicName(value, usedDataNames(state.spec)),
    });
}

/** Source d'une URL : fixe (écrite dans le code) ou dynamique (fournie par la logique) */
async function askUrl(state: WizardState, label: string, dynamicSuggestion: string): Promise<UrlSource> {
    const kind = await state.prompter.choose(`${label} : URL fixe ou fournie par la logique ?`, [
        { label: 'Fixe', value: 'static' as const, hint: 'écrite dans le code (logo, bannière...)' },
        { label: 'Dynamique', value: 'dynamic' as const, hint: 'passée au builder (avatar, image d\'objet...)' },
    ]);

    if (kind === 'static') {
        const url = await state.prompter.text(`${label} — URL`, { validate: validateUrl });
        return { kind, url };
    }
    const field = await askDynamicName(state, dynamicSuggestion);
    const optional = !(await state.prompter.confirm('Toujours fournie ? (non → propriété optionnelle, élément masqué si absente)', true));
    return { kind, field, optional };
}

async function askOptionalUrl(state: WizardState, question: string, label: string, suggestion: string): Promise<UrlSource | undefined> {
    return (await state.prompter.confirm(question, false)) ? askUrl(state, label, suggestion) : undefined;
}

async function askNewColor(state: WizardState, palette: PaletteColor[]): Promise<ColorSpec> {
    const hex = (await state.prompter.text('Code hexadécimal (ex: #9B59B6)', {
        validate: (value) => (/^#?[0-9A-Fa-f]{6}$/.test(value) ? null : 'Format attendu : #RRGGBB.'),
    })).replace(/^#?/, '#').toUpperCase();

    const sameHex = palette.find((color) => color.hex === hex);
    if (sameHex && await state.prompter.confirm(`${hex} existe déjà (EmbedColors.${sameHex.name}). L'utiliser ?`, true)) {
        return { name: sameHex.name, hex, isNew: false };
    }

    const name = toPascalCase(await state.prompter.text('Nom dans EmbedColors (PascalCase, ex: Legendary)', {
        validate: (value) => checkColorName(toPascalCase(value), palette),
    }));
    const comment = await state.prompter.text('Signification de la couleur (commentaire, ex: Objet légendaire)', { validate: noEmoji });
    return { name, hex, isNew: true, comment };
}

async function askColor(state: WizardState): Promise<ColorSpec | undefined> {
    if (!(await state.prompter.confirm('Couleur de bordure ?', true))) return undefined;

    const palette = readPalette(state.context.changes, state.context.root);
    const choices: Choice<PaletteColor | null>[] = [
        ...palette.map((color) => ({
            label: `${style.hex(color.hex, '██')} ${color.name}`,
            value: color,
            hint: `${color.hex}  ${color.comment ?? ''}`,
        })),
        { label: 'Nouvelle couleur', value: null, hint: 'ajoutée à shared/embeds/EmbedColors.ts' },
    ];
    const picked = await state.prompter.choose('Couleur (palette partagée EmbedColors) :', choices);
    return picked ? { name: picked.name, hex: picked.hex, isNew: false } : askNewColor(state, palette);
}

async function askTimestamp(state: WizardState): Promise<TimestampSource | undefined> {
    if (!(await state.prompter.confirm('Horodatage (date à côté du pied de page) ?', false))) return undefined;

    const kind = await state.prompter.choose('Quelle date ?', [
        { label: 'Maintenant', value: 'now' as const, hint: 'moment de l\'envoi' },
        { label: 'Dynamique', value: 'dynamic' as const, hint: 'date passée au builder' },
    ]);
    if (kind === 'now') return { kind };

    const field = await askDynamicName(state, 'timestamp');
    const optional = !(await state.prompter.confirm('Toujours fournie ?', true));
    return { kind, field, optional };
}

// ---------------------------------------------------------------------------
// Éléments de l'embed
// ---------------------------------------------------------------------------

async function askAuthor(state: WizardState): Promise<void> {
    if (!(await state.prompter.confirm('Auteur (ligne en haut, au-dessus du titre) ?', false))) return;
    const name = await askText(state, 'author', 'Nom de l\'auteur', textOptions(state, EMBED_LIMITS.author));
    state.spec.author = { name };
    state.spec.author.iconUrl = await askOptionalUrl(state, 'Icône de l\'auteur ?', 'Icône de l\'auteur', 'authorIconUrl');
    state.spec.author.url = await askOptionalUrl(state, 'Lien sur le nom de l\'auteur ?', 'Lien de l\'auteur', 'authorUrl');
}

async function askTitle(state: WizardState): Promise<void> {
    if (!(await state.prompter.confirm('Titre ?', true))) return;
    state.spec.title = await askText(state, 'title', 'Titre', textOptions(state, EMBED_LIMITS.title));
    state.spec.url = await askOptionalUrl(state, 'Lien sur le titre ?', 'Lien du titre', 'url');
}

async function askDescription(state: WizardState): Promise<void> {
    if (!(await state.prompter.confirm('Description ?', true))) return;
    state.spec.description = await askText(state, 'description', 'Description', textOptions(state, EMBED_LIMITS.description, true));
}

async function askField(state: WizardState, index: number, usedKeys: Set<string>): Promise<FieldSpec> {
    state.prompter.say(style.bold(`  Champ n°${index + 1}`));
    const key = await state.prompter.text('Identifiant du champ (camelCase, ex: stats → statsName / statsValue)', {
        default: `field${index + 1}`,
        validate: (value) => {
            if (!/^[a-z][a-zA-Z0-9]*$/.test(value)) return 'Format attendu : camelCase.';
            return usedKeys.has(value) ? 'Identifiant déjà utilisé par un autre champ.' : null;
        },
    });
    usedKeys.add(key);

    const name = await askText(state, `${key}Name`, 'Nom du champ', textOptions(state, EMBED_LIMITS.fieldName));
    const value = await askText(state, `${key}Value`, 'Valeur du champ', textOptions(state, EMBED_LIMITS.fieldValue, true));
    const inline = await state.prompter.confirm('Affiché en ligne (jusqu\'à 3 champs côte à côte) ?', false);
    return { name, value, inline };
}

async function askFields(state: WizardState): Promise<void> {
    const usedKeys = new Set<string>();
    let question = 'Champs (blocs nom / valeur) ?';
    while (state.spec.fields.length < EMBED_LIMITS.fields && await state.prompter.confirm(question, false)) {
        state.spec.fields.push(await askField(state, state.spec.fields.length, usedKeys));
        question = 'Ajouter un autre champ ?';
    }
    if (state.spec.fields.length === EMBED_LIMITS.fields) {
        state.prompter.say(style.yellow(`  Limite Discord atteinte : ${EMBED_LIMITS.fields} champs maximum.`));
    }
}

async function askFooter(state: WizardState): Promise<void> {
    if (!(await state.prompter.confirm('Pied de page ?', false))) return;
    const text = await askText(state, 'footer', 'Texte du pied de page', textOptions(state, EMBED_LIMITS.footer));
    state.spec.footer = { text };
    state.spec.footer.iconUrl = await askOptionalUrl(state, 'Icône du pied de page ?', 'Icône du pied de page', 'footerIconUrl');
}

/** Type TypeScript de chaque placeholder (les valeurs injectées sont des string ou des number) */
async function askPlaceholderTypes(state: WizardState): Promise<void> {
    const placeholders = allPlaceholders(state.spec);
    if (placeholders.length === 0) return;

    state.prompter.say(heading('Placeholders'));
    state.prompter.say(style.dim('  Chaque {placeholder} devient une propriété de `data`, passée par la logique.'));
    for (const name of placeholders) {
        state.spec.placeholderTypes[name] = await state.prompter.choose(`Type de {${name}} ?`, [
            { label: 'string', value: 'string' as const, hint: 'texte déjà formaté (ex: fame formatée, mention)' },
            { label: 'number', value: 'number' as const, hint: 'nombre affiché tel quel' },
        ]);
    }
}

/**
 * Pose toutes les questions et renvoie la description complète de l'embed
 *
 * @throws Error si l'embed final est refusé (aucun élément visible, limites Discord)
 */
export async function runEmbedWizard(prompter: Prompter, context: GeneratorContext): Promise<EmbedSpec> {
    const state: WizardState = {
        context,
        prompter,
        translateNow: false,
        spec: { feature: '', fileBaseName: '', embedName: '', keyPrefix: '', summary: '', fields: [], placeholderTypes: {} },
    };

    prompter.say(heading('Emplacement'));
    await askLocation(state);
    state.translateNow = await askTranslateNow(prompter, context);
    prompter.say(style.dim('  Astuce : {nom} dans un texte = valeur dynamique. Émojis acceptés (échappés automatiquement dans les JSON).'));

    prompter.say(heading('Éléments de l\'embed'));
    state.spec.color = await askColor(state);
    await askAuthor(state);
    await askTitle(state);
    await askDescription(state);
    state.spec.thumbnail = await askOptionalUrl(state, 'Miniature (petite image en haut à droite) ?', 'Miniature', 'thumbnailUrl');
    await askFields(state);
    state.spec.image = await askOptionalUrl(state, 'Grande image (en bas de l\'embed) ?', 'Image', 'imageUrl');
    await askFooter(state);
    state.spec.timestamp = await askTimestamp(state);
    await askPlaceholderTypes(state);

    const errors = checkEmbedSpec(state.spec, context.locales, context.defaultLocale);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return state.spec;
}

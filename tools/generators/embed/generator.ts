import { Generator } from '../shared/generator';
import { untranslatedKeys } from '../shared/text';
import { generateUsageExample } from './codegen';
import { EMBED_SPEC_HELP, embedFromInput } from './input';
import { planEmbed } from './plan';
import { buildPreviewEmbed, renderPreview } from './preview';
import { EmbedSpec, functionName, textElements } from './spec';
import { runEmbedWizard } from './wizard';

/**
 * Générateur d'embeds : `npm run create:embed`
 *
 * Crée / complète : textes traduits, builder `build<Nom>Embed(translate, data)`, `types.ts`,
 * `index.ts`, couleur EmbedColors, test (snapshot + toutes les langues).
 */
export const embedGenerator: Generator<EmbedSpec> = {
    type: 'embed',
    description: 'embed traduit (builder, types, index, couleur, textes, test)',
    specHelp: EMBED_SPEC_HELP,
    example: {
        type: 'embed',
        feature: 'encyclopedia',
        file: 'Item',
        name: 'ItemDetails',
        summary: 'Fiche détaillée d\'un objet Albion',
        color: 'Info',
        title: { fr: '{name}', en: '{name}', es: '{name}' },
        description: { fr: ['**Tier :** {tier}', '**Catégorie :** {category}'], en: ['**Tier:** {tier}', '**Category:** {category}'] },
        thumbnail: { data: 'iconUrl' },
        fields: [{ key: 'price', name: { fr: 'Prix', en: 'Price', es: 'Precio' }, value: '{price}', inline: true }],
        footer: { text: { fr: 'Encyclopédie', en: 'Encyclopedia', es: 'Enciclopedia' } },
        timestamp: 'now',
        placeholders: { tier: 'number' },
    },

    interactive: runEmbedWizard,
    fromInput: embedFromInput,

    preview(spec, context) {
        return context.locales
            .map((locale) => `[${locale}]\n${renderPreview(buildPreviewEmbed(spec, locale, context.defaultLocale))}`)
            .join('\n\n');
    },

    plan(spec, context) {
        const { translationsName } = planEmbed(spec, context);
        const untranslated = untranslatedKeys(spec.keyPrefix, textElements(spec));
        return {
            usage: generateUsageExample(spec, translationsName),
            notes: [
                `npm test en local : crée le snapshot de ${functionName(spec)} (la CI ne crée pas de snapshot)`,
                ...(untranslated.length > 0 ? [`à traduire (texte ${context.defaultLocale} recopié) : ${untranslated.join(', ')}`] : []),
            ],
        };
    },
};

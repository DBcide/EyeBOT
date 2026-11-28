import { APIEmbed, EmbedBuilder } from 'discord.js';
import { style } from '../shared/terminal';
import { EmbedSpec, TextElement, TimestampSource, UrlSource } from './spec';

/**
 * Aperçu de l'embed dans le terminal, construit avec le vrai EmbedBuilder de discord.js
 *
 * Les placeholders restent visibles (`{name}`) et les URLs dynamiques sont remplacées
 * par une URL d'exemple : l'aperçu valide ainsi les limites de Discord (longueurs,
 * format des URLs) avant que le moindre fichier soit écrit.
 */

const SAMPLE_URL = 'https://example.com/dynamic.png';

/** Limite totale d'un embed (somme des textes) */
export const EMBED_TOTAL_LIMIT = 6000;

function text(element: TextElement, locale: string, defaultLocale: string): string {
    const value = element.values[locale] ?? element.values[defaultLocale];
    return Array.isArray(value) ? value.join('\n') : value;
}

function url(source: UrlSource | undefined): string | undefined {
    if (!source) return undefined;
    return source.kind === 'static' ? source.url : SAMPLE_URL;
}

function timestamp(builder: EmbedBuilder, source: TimestampSource): void {
    builder.setTimestamp(source.kind === 'now' ? Date.now() : new Date('2026-01-01T12:00:00.000Z'));
}

/**
 * Construit l'embed d'aperçu dans une langue
 *
 * @throws Si un élément dépasse une limite Discord ou si une URL est invalide
 */
export function buildPreviewEmbed(spec: EmbedSpec, locale: string, defaultLocale: string): APIEmbed {
    const read = (element: TextElement) => text(element, locale, defaultLocale);
    const builder = new EmbedBuilder();

    if (spec.color) builder.setColor(spec.color.hex as `#${string}`);
    if (spec.author) builder.setAuthor({ name: read(spec.author.name), iconURL: url(spec.author.iconUrl), url: url(spec.author.url) });
    if (spec.title) builder.setTitle(read(spec.title));
    if (spec.url) builder.setURL(url(spec.url)!);
    if (spec.description) builder.setDescription(read(spec.description));
    if (spec.thumbnail) builder.setThumbnail(url(spec.thumbnail)!);
    for (const field of spec.fields) {
        builder.addFields({ name: read(field.name), value: read(field.value), inline: field.inline });
    }
    if (spec.image) builder.setImage(url(spec.image)!);
    if (spec.footer) builder.setFooter({ text: read(spec.footer.text), iconURL: url(spec.footer.iconUrl) });
    if (spec.timestamp) timestamp(builder, spec.timestamp);

    const embed = builder.toJSON();
    if (builder.length > EMBED_TOTAL_LIMIT) {
        throw new Error(`L'embed dépasse ${EMBED_TOTAL_LIMIT} caractères au total (${builder.length})`);
    }
    return embed;
}

/** Rendu texte de l'embed, avec une barre latérale de la couleur choisie */
export function renderPreview(embed: APIEmbed): string {
    const hex = embed.color === undefined ? '#4E5058' : `#${embed.color.toString(16).padStart(6, '0')}`;
    const lines: string[] = [];
    const add = (line = '') => lines.push(line);

    if (embed.author) add(`${style.bold(embed.author.name)}${embed.author.icon_url ? style.dim('  [icône]') : ''}`);
    if (embed.title) add(style.bold(style.cyan(embed.title)) + (embed.url ? style.dim(`  -> ${embed.url}`) : ''));
    if (embed.thumbnail) add(style.dim(`[miniature : ${embed.thumbnail.url}]`));
    if (embed.description) embed.description.split('\n').forEach((line) => add(line));

    for (const field of embed.fields ?? []) {
        add();
        add(style.bold(field.name) + (field.inline ? style.dim('  (en ligne)') : ''));
        field.value.split('\n').forEach((line) => add(line));
    }
    if (embed.image) {
        add();
        add(style.dim(`[image : ${embed.image.url}]`));
    }
    if (embed.footer || embed.timestamp) {
        add();
        const parts = [embed.footer?.text, embed.timestamp && 'horodatage'].filter(Boolean).join(' • ');
        add(style.dim(`${embed.footer?.icon_url ? '[icône] ' : ''}${parts}`));
    }

    const bar = style.hex(hex, '┃');
    return lines.map((line) => `  ${bar} ${line}`).join('\n');
}

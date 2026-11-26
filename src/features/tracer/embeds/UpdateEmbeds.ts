import { EmbedBuilder } from 'discord.js';
import { EmbedColors } from '../../../shared/embeds/EmbedColors';
import { truncateField } from '../../../shared/embeds/EmbedUtils';
import { TracerTranslator } from '../i18n';
import { formatFame } from '../utils/FameUtils';
import { MAX_SELECT_OPTIONS } from '../constants';
import { CharacterView, UpdateAllProgress, UpdateAllResults } from './types';

/**
 * Embeds des commandes /update et /updateall
 *
 * @see RegisterEmbeds pour la convention commune aux fichiers `embeds/`
 */

/**
 * Choix du personnage à mettre à jour quand l'utilisateur en a plusieurs
 *
 * @param t - Traductions dans la langue de l'utilisateur
 * @param characters - Personnages enregistrés de l'utilisateur
 */
export function buildCharacterSelectionEmbed(t: TracerTranslator, characters: CharacterView[]): EmbedBuilder {
    const lines = characters
        .slice(0, MAX_SELECT_OPTIONS)
        .map((character, i) => t('update.selection.line', {
            index: i + 1,
            name: character.name,
            killFame: formatFame(character.killFame),
        }));

    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(t('update.selection.title'))
        .setDescription(
            `${t('update.selection.intro')}\n\n${lines.join('\n')}\n\n${t('update.selection.renameWarning')}`
        );
}

/**
 * Confirmation de mise à jour avec les nouvelles stats
 *
 * @param t - Traductions dans la langue de l'utilisateur
 * @param character - Données fraîches renvoyées par l'API Albion
 */
export function buildCharacterUpdatedEmbed(t: TracerTranslator, character: CharacterView): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Success)
        .setTitle(t('update.successEmbed.title'))
        .setDescription(t('update.successEmbed.description', {
            name: character.name,
            killFame: formatFame(character.killFame),
            deathFame: formatFame(character.deathFame ?? 0),
            guild: character.guildName || t('labels.none'),
            alliance: character.allianceName || t('labels.none'),
        }))
        .setTimestamp();
}

/**
 * Progression initiale de /updateall (avant le premier batch)
 *
 * @param t - Traductions dans la langue de l'administrateur
 * @param total - Nombre de membres à mettre à jour
 */
export function buildUpdateAllStartEmbed(t: TracerTranslator, total: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(t('updateAll.progress.title'))
        .setDescription(t('updateAll.progress.start', { total }))
        .setTimestamp();
}

/**
 * Progression de /updateall après chaque batch
 *
 * @param t - Traductions dans la langue de l'administrateur
 * @param progress - Compteurs à jour
 */
export function buildUpdateAllProgressEmbed(t: TracerTranslator, progress: UpdateAllProgress): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(t('updateAll.progress.title'))
        .setDescription(t('updateAll.progress.batch', { ...progress }))
        .setTimestamp();
}

/**
 * Rapport final de /updateall
 *
 * @param t - Traductions dans la langue de l'administrateur
 * @param results - Compteurs et détails des échecs (10 premiers affichés)
 *
 * @remarks
 * Orange s'il y a au moins un échec, vert sinon.
 */
export function buildUpdateAllSummaryEmbed(t: TracerTranslator, results: UpdateAllResults): EmbedBuilder {
    const total = results.success + results.failures + results.skipped;

    const embed = new EmbedBuilder()
        .setColor(results.failures > 0 ? EmbedColors.Warning : EmbedColors.Success)
        .setTitle(t('updateAll.summary.title'))
        .setDescription(t('updateAll.summary.description', {
            total,
            success: results.success,
            skipped: results.skipped,
            failures: results.failures,
        }))
        .setTimestamp();

    if (results.details.length > 0) {
        const errorList = results.details
            .slice(0, 10)
            .map((detail, i) => `${i + 1}. ${detail}`)
            .join('\n');

        const more = results.details.length > 10
            ? `\n${t('updateAll.summary.moreFailures', { count: results.details.length - 10 })}`
            : '';

        embed.addFields({
            name: t('updateAll.summary.failuresName'),
            value: truncateField(errorList + more),
        });
    }

    return embed;
}

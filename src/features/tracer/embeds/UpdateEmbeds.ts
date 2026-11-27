import { EmbedBuilder } from 'discord.js';
import { EmbedColors } from '../../../shared/embeds/EmbedColors';
import { truncateField } from '../../../shared/embeds/EmbedUtils';
import { TracerTranslator } from '../translations';
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
 * @param translate - Traductions dans la langue de l'utilisateur
 * @param characters - Personnages enregistrés de l'utilisateur
 */
export function buildCharacterSelectionEmbed(translate: TracerTranslator, characters: CharacterView[]): EmbedBuilder {
    const lines = characters
        .slice(0, MAX_SELECT_OPTIONS)
        .map((character, index) => translate('update.selection.line', {
            index: index + 1,
            name: character.name,
            killFame: formatFame(character.killFame),
        }));

    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(translate('update.selection.title'))
        .setDescription(
            `${translate('update.selection.intro')}\n\n${lines.join('\n')}\n\n${translate('update.selection.renameWarning')}`
        );
}

/**
 * Confirmation de mise à jour avec les nouvelles stats
 *
 * @param translate - Traductions dans la langue de l'utilisateur
 * @param character - Données fraîches renvoyées par l'API Albion
 */
export function buildCharacterUpdatedEmbed(translate: TracerTranslator, character: CharacterView): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Success)
        .setTitle(translate('update.successEmbed.title'))
        .setDescription(translate('update.successEmbed.description', {
            name: character.name,
            killFame: formatFame(character.killFame),
            deathFame: formatFame(character.deathFame ?? 0),
            guild: character.guildName || translate('labels.none'),
            alliance: character.allianceName || translate('labels.none'),
        }))
        .setTimestamp();
}

/**
 * Progression initiale de /updateall (avant le premier batch)
 *
 * @param translate - Traductions dans la langue de l'administrateur
 * @param total - Nombre de membres à mettre à jour
 */
export function buildUpdateAllStartEmbed(translate: TracerTranslator, total: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(translate('updateAll.progress.title'))
        .setDescription(translate('updateAll.progress.start', { total }))
        .setTimestamp();
}

/**
 * Progression de /updateall après chaque batch
 *
 * @param translate - Traductions dans la langue de l'administrateur
 * @param progress - Compteurs à jour
 */
export function buildUpdateAllProgressEmbed(translate: TracerTranslator, progress: UpdateAllProgress): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(translate('updateAll.progress.title'))
        .setDescription(translate('updateAll.progress.batch', { ...progress }))
        .setTimestamp();
}

/**
 * Rapport final de /updateall
 *
 * @param translate - Traductions dans la langue de l'administrateur
 * @param results - Compteurs et détails des échecs (10 premiers affichés)
 *
 * @remarks
 * Orange s'il y a au moins un échec, vert sinon.
 */
export function buildUpdateAllSummaryEmbed(translate: TracerTranslator, results: UpdateAllResults): EmbedBuilder {
    const total = results.success + results.failures + results.skipped;

    const embed = new EmbedBuilder()
        .setColor(results.failures > 0 ? EmbedColors.Warning : EmbedColors.Success)
        .setTitle(translate('updateAll.summary.title'))
        .setDescription(translate('updateAll.summary.description', {
            total,
            success: results.success,
            skipped: results.skipped,
            failures: results.failures,
        }))
        .setTimestamp();

    if (results.details.length > 0) {
        const errorList = results.details
            .slice(0, 10)
            .map((detail, index) => `${index + 1}. ${detail}`)
            .join('\n');

        const more = results.details.length > 10
            ? `\n${translate('updateAll.summary.moreFailures', { count: results.details.length - 10 })}`
            : '';

        embed.addFields({
            name: translate('updateAll.summary.failuresName'),
            value: truncateField(errorList + more),
        });
    }

    return embed;
}

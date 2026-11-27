import { EmbedBuilder } from 'discord.js';
import { EmbedColors } from '../../../shared/embeds/EmbedColors';
import { discordDate, truncateField } from '../../../shared/embeds/EmbedUtils';
import { TracerTranslator } from '../translations';
import { TracerUser } from '../models/AlbionTypes';

/**
 * Embeds de la commande /verify
 *
 * @see RegisterEmbeds pour la convention commune aux fichiers `embeds/`
 */

/**
 * Rapport de vérification affiché à l'administrateur
 *
 * @param translate - Traductions dans la langue de l'administrateur
 * @param targetUserId - Propriétaire vérifié
 * @param character - Le personnage vérifié (tel qu'en base)
 * @param removedClaims - Revendications des autres utilisateurs supprimées
 * @param verifiedBy - Administrateur ayant lancé la commande (footer)
 */
export function buildVerificationReportEmbed(
    translate: TracerTranslator,
    targetUserId: string,
    character: TracerUser,
    removedClaims: TracerUser[],
    verifiedBy: { tag: string; avatarURL: string }
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EmbedColors.Verified)
        .setTitle(translate('verify.report.title'))
        .setDescription(translate('verify.report.description', {
            userId: targetUserId,
            name: character.albion_name,
            albionId: character.albion_id,
            guild: character.guild_name || translate('labels.none'),
            alliance: character.alliance_name || translate('labels.none'),
        }))
        .setTimestamp()
        .setFooter({
            text: translate('verify.report.footer', { tag: verifiedBy.tag }),
            iconURL: verifiedBy.avatarURL,
        });

    if (removedClaims.length > 0) {
        const lines = removedClaims
            .map(claim => translate('verify.report.removedClaimLine', {
                userId: claim.discord_id,
                date: discordDate(claim.registered_at),
            }))
            .join('\n');

        embed.addFields({
            name: translate('verify.report.removedClaimsName', { count: removedClaims.length }),
            value: truncateField(lines),
            inline: false,
        });
    }

    return embed;
}

/**
 * Notification envoyée en MP au propriétaire du personnage vérifié
 *
 * @param translate - Traductions dans la langue du destinataire (pas celle de l'administrateur)
 * @param character - Le personnage vérifié
 */
export function buildVerificationNotificationEmbed(translate: TracerTranslator, character: TracerUser): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Verified)
        .setTitle(translate('verify.notification.title'))
        .setDescription(translate('verify.notification.description', { name: character.albion_name }))
        .addFields({
            name: translate('verify.notification.infoName'),
            value: translate('verify.notification.infoValue', {
                name: character.albion_name,
                guild: character.guild_name || translate('labels.none'),
                alliance: character.alliance_name || translate('labels.none'),
            }),
            inline: false,
        })
        .setTimestamp();
}

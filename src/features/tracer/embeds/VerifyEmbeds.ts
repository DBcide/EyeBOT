import { EmbedBuilder } from 'discord.js';
import { EmbedColors } from '../../../shared/embeds/EmbedColors';
import { discordDate, truncateField } from '../../../shared/embeds/EmbedUtils';
import { TracerTranslator } from '../i18n';
import { TracerUser } from '../models/AlbionTypes';

/**
 * Embeds de la commande /verify
 *
 * @see RegisterEmbeds pour la convention commune aux fichiers `embeds/`
 */

/**
 * Rapport de vérification affiché à l'administrateur
 *
 * @param t - Traductions dans la langue de l'administrateur
 * @param targetUserId - Propriétaire vérifié
 * @param character - Le personnage vérifié (tel qu'en base)
 * @param removedClaims - Revendications des autres utilisateurs supprimées
 * @param verifiedBy - Administrateur ayant lancé la commande (footer)
 */
export function buildVerificationReportEmbed(
    t: TracerTranslator,
    targetUserId: string,
    character: TracerUser,
    removedClaims: TracerUser[],
    verifiedBy: { tag: string; avatarURL: string }
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EmbedColors.Verified)
        .setTitle(t('verify.report.title'))
        .setDescription(t('verify.report.description', {
            userId: targetUserId,
            name: character.albion_name,
            albionId: character.albion_id,
            guild: character.guild_name || t('labels.none'),
            alliance: character.alliance_name || t('labels.none'),
        }))
        .setTimestamp()
        .setFooter({
            text: t('verify.report.footer', { tag: verifiedBy.tag }),
            iconURL: verifiedBy.avatarURL,
        });

    if (removedClaims.length > 0) {
        const lines = removedClaims
            .map(claim => t('verify.report.removedClaimLine', {
                userId: claim.discord_id,
                date: discordDate(claim.registered_at),
            }))
            .join('\n');

        embed.addFields({
            name: t('verify.report.removedClaimsName', { count: removedClaims.length }),
            value: truncateField(lines),
            inline: false,
        });
    }

    return embed;
}

/**
 * Notification envoyée en MP au propriétaire du personnage vérifié
 *
 * @param t - Traductions dans la langue du destinataire (pas celle de l'administrateur)
 * @param character - Le personnage vérifié
 */
export function buildVerificationNotificationEmbed(t: TracerTranslator, character: TracerUser): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Verified)
        .setTitle(t('verify.notification.title'))
        .setDescription(t('verify.notification.description', { name: character.albion_name }))
        .addFields({
            name: t('verify.notification.infoName'),
            value: t('verify.notification.infoValue', {
                name: character.albion_name,
                guild: character.guild_name || t('labels.none'),
                alliance: character.alliance_name || t('labels.none'),
            }),
            inline: false,
        })
        .setTimestamp();
}

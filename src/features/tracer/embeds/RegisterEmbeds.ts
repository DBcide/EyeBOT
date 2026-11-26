import { EmbedBuilder } from 'discord.js';
import { EmbedColors } from '../../../shared/embeds/EmbedColors';
import { TracerTranslator } from '../i18n';
import { formatFame } from '../utils/FameUtils';
import { VERIFICATION_MAIL_RECIPIENT, MAX_SELECT_OPTIONS } from '../constants';
import { CharacterView } from './types';

/**
 * Embeds de la commande /register
 *
 * Convention de tous les fichiers `embeds/` :
 * - une fonction pure par embed : `build<Nom>Embed(t, données)` → EmbedBuilder
 * - `t` est la fonction de traduction de la langue du destinataire
 * - aucune logique métier, aucun accès DB/API : uniquement de la mise en forme
 */

/**
 * Liste des joueurs trouvés quand la recherche renvoie plusieurs résultats
 *
 * @param t - Traductions dans la langue de l'utilisateur
 * @param players - Joueurs trouvés (seuls les 25 premiers sont affichés, comme le menu)
 */
export function buildPlayerSelectionEmbed(t: TracerTranslator, players: CharacterView[]): EmbedBuilder {
    const lines = players
        .slice(0, MAX_SELECT_OPTIONS)
        .map((player, i) => t('register.selection.line', {
            index: i + 1,
            name: player.name,
            killFame: formatFame(player.killFame),
        }));

    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(t('register.selection.title'))
        .setDescription(`${t('register.selection.intro')}\n\n${lines.join('\n')}`);
}

/**
 * Refus : le personnage est déjà vérifié par un autre compte Discord
 *
 * @param t - Traductions dans la langue de l'utilisateur
 * @param verifiedOwner - ID Discord du propriétaire vérifié
 * @param character - Infos du personnage (champ omis si absent)
 */
export function buildCharacterAlreadyVerifiedEmbed(
    t: TracerTranslator,
    verifiedOwner: string,
    character?: CharacterView
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EmbedColors.Danger)
        .setTitle(t('register.alreadyVerified.title'))
        .setDescription(t('register.alreadyVerified.description', { ownerId: verifiedOwner }))
        .setTimestamp();

    if (character) {
        embed.addFields({
            name: t('register.alreadyVerified.infoName'),
            value: t('register.alreadyVerified.infoValue', {
                name: character.name,
                killFame: formatFame(character.killFame),
                guild: character.guildName || t('labels.none'),
            }),
            inline: false,
        });
    }

    return embed;
}

/**
 * Annonce publique d'un nouvel enregistrement (sans conflit)
 *
 * @param t - Traductions
 * @param discordUserId - ID de l'utilisateur enregistré
 * @param character - Le personnage enregistré
 */
export function buildRegistrationSuccessEmbed(
    t: TracerTranslator,
    discordUserId: string,
    character: CharacterView
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Success)
        .setTitle(t('register.successEmbed.title'))
        .setDescription(t('register.successEmbed.description', {
            discordId: discordUserId,
            name: character.name,
            killFame: formatFame(character.killFame),
            guild: character.guildName || t('labels.none'),
            alliance: character.allianceName || t('labels.none'),
        }))
        .setTimestamp();
}

/**
 * Annonce publique d'un enregistrement sur un personnage déjà revendiqué (non vérifié)
 *
 * @param t - Traductions
 * @param discordUserId - ID de l'utilisateur enregistré
 * @param character - Le personnage enregistré
 * @param otherClaimantIds - IDs Discord des autres revendicateurs
 */
export function buildRegistrationWithWarningEmbed(
    t: TracerTranslator,
    discordUserId: string,
    character: CharacterView,
    otherClaimantIds: string[]
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Warning)
        .setTitle(t('register.warningEmbed.title'))
        .setDescription(t('register.warningEmbed.description', {
            discordId: discordUserId,
            name: character.name,
            killFame: formatFame(character.killFame),
            guild: character.guildName || t('labels.none'),
            alliance: character.allianceName || t('labels.none'),
            count: otherClaimantIds.length,
            claimants: otherClaimantIds.map(id => `<@${id}>`).join(', '),
        }))
        .setTimestamp();
}

/**
 * Récapitulatif de tous les personnages liés au compte de l'utilisateur
 *
 * @param t - Traductions
 * @param characters - Personnages enregistrés (avec leur statut de vérification)
 */
export function buildCharactersSummaryEmbed(
    t: TracerTranslator,
    characters: (CharacterView & { isVerified: boolean })[]
): EmbedBuilder {
    const description = characters.length > 0
        ? characters
            .map((character, i) => t('register.summary.line', {
                index: i + 1,
                name: character.name,
                killFame: formatFame(character.killFame),
                verified: character.isVerified ? '🔒' : '',
            }))
            .join('\n')
        : t('register.summary.empty');

    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(t('register.summary.title'))
        .setDescription(description)
        .setFooter({ text: t('register.summary.footer', { count: characters.length }) });
}

/**
 * Instructions de vérification envoyées en MP (enregistrement standard)
 *
 * @param t - Traductions
 * @param characterName - Nom du personnage à vérifier
 * @param discordUserId - ID à indiquer dans le courrier in-game
 */
export function buildVerificationInstructionsEmbed(
    t: TracerTranslator,
    characterName: string,
    discordUserId: string
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Warning)
        .setTitle(t('register.verificationInstructions.title'))
        .setDescription(t('register.verificationInstructions.description', {
            name: characterName,
            verifier: VERIFICATION_MAIL_RECIPIENT,
            discordId: discordUserId,
        }))
        .setFooter({ text: t('register.verificationInstructions.footer') });
}

/**
 * Instructions de vérification envoyées en MP (personnage revendiqué par d'autres)
 *
 * @param t - Traductions
 * @param discordUserId - ID à indiquer dans le courrier in-game
 */
export function buildVerificationWarningEmbed(t: TracerTranslator, discordUserId: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Help)
        .setTitle(t('register.verificationWarning.title'))
        .setDescription(t('register.verificationWarning.description', {
            verifier: VERIFICATION_MAIL_RECIPIENT,
            discordId: discordUserId,
        }))
        .setFooter({ text: t('register.verificationWarning.footer') });
}

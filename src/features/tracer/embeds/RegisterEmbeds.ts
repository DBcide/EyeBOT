import { EmbedBuilder } from 'discord.js';
import { EmbedColors } from '../../../shared/embeds/EmbedColors';
import { TracerTranslator } from '../translations';
import { formatFame } from '../utils/FameUtils';
import { VERIFICATION_MAIL_RECIPIENT, MAX_SELECT_OPTIONS } from '../constants';
import { CharacterView } from './types';

/**
 * Embeds de la commande /register
 *
 * Convention de tous les fichiers `embeds/` :
 * - une fonction pure par embed : `build<Nom>Embed(translate, données)` → EmbedBuilder
 * - `translate` est la fonction de traduction de la langue du destinataire
 * - aucune logique métier, aucun accès DB/API : uniquement de la mise en forme
 */

/**
 * Liste des joueurs trouvés quand la recherche renvoie plusieurs résultats
 *
 * @param translate - Traductions dans la langue de l'utilisateur
 * @param players - Joueurs trouvés (seuls les 25 premiers sont affichés, comme le menu)
 */
export function buildPlayerSelectionEmbed(translate: TracerTranslator, players: CharacterView[]): EmbedBuilder {
    const lines = players
        .slice(0, MAX_SELECT_OPTIONS)
        .map((player, index) => translate('register.selection.line', {
            index: index + 1,
            name: player.name,
            killFame: formatFame(player.killFame),
        }));

    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(translate('register.selection.title'))
        .setDescription(`${translate('register.selection.intro')}\n\n${lines.join('\n')}`);
}

/**
 * Refus : le personnage est déjà vérifié par un autre compte Discord
 *
 * @param translate - Traductions dans la langue de l'utilisateur
 * @param verifiedOwner - ID Discord du propriétaire vérifié
 * @param character - Infos du personnage (champ omis si absent)
 */
export function buildCharacterAlreadyVerifiedEmbed(
    translate: TracerTranslator,
    verifiedOwner: string,
    character?: CharacterView
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EmbedColors.Danger)
        .setTitle(translate('register.alreadyVerified.title'))
        .setDescription(translate('register.alreadyVerified.description', { ownerId: verifiedOwner }))
        .setTimestamp();

    if (character) {
        embed.addFields({
            name: translate('register.alreadyVerified.infoName'),
            value: translate('register.alreadyVerified.infoValue', {
                name: character.name,
                killFame: formatFame(character.killFame),
                guild: character.guildName || translate('labels.none'),
            }),
            inline: false,
        });
    }

    return embed;
}

/**
 * Annonce publique d'un nouvel enregistrement (sans conflit)
 *
 * @param translate - Traductions
 * @param discordUserId - ID de l'utilisateur enregistré
 * @param character - Le personnage enregistré
 */
export function buildRegistrationSuccessEmbed(
    translate: TracerTranslator,
    discordUserId: string,
    character: CharacterView
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Success)
        .setTitle(translate('register.successEmbed.title'))
        .setDescription(translate('register.successEmbed.description', {
            discordId: discordUserId,
            name: character.name,
            killFame: formatFame(character.killFame),
            guild: character.guildName || translate('labels.none'),
            alliance: character.allianceName || translate('labels.none'),
        }))
        .setTimestamp();
}

/**
 * Annonce publique d'un enregistrement sur un personnage déjà revendiqué (non vérifié)
 *
 * @param translate - Traductions
 * @param discordUserId - ID de l'utilisateur enregistré
 * @param character - Le personnage enregistré
 * @param otherClaimantIds - IDs Discord des autres revendicateurs
 */
export function buildRegistrationWithWarningEmbed(
    translate: TracerTranslator,
    discordUserId: string,
    character: CharacterView,
    otherClaimantIds: string[]
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Warning)
        .setTitle(translate('register.warningEmbed.title'))
        .setDescription(translate('register.warningEmbed.description', {
            discordId: discordUserId,
            name: character.name,
            killFame: formatFame(character.killFame),
            guild: character.guildName || translate('labels.none'),
            alliance: character.allianceName || translate('labels.none'),
            count: otherClaimantIds.length,
            claimants: otherClaimantIds.map(id => `<@${id}>`).join(', '),
        }))
        .setTimestamp();
}

/**
 * Récapitulatif de tous les personnages liés au compte de l'utilisateur
 *
 * @param translate - Traductions
 * @param characters - Personnages enregistrés (avec leur statut de vérification)
 */
export function buildCharactersSummaryEmbed(
    translate: TracerTranslator,
    characters: (CharacterView & { isVerified: boolean })[]
): EmbedBuilder {
    const description = characters.length > 0
        ? characters
            .map((character, index) => translate('register.summary.line', {
                index: index + 1,
                name: character.name,
                killFame: formatFame(character.killFame),
                verified: character.isVerified ? '\u{1F512}' : '',
            }))
            .join('\n')
        : translate('register.summary.empty');

    return new EmbedBuilder()
        .setColor(EmbedColors.Info)
        .setTitle(translate('register.summary.title'))
        .setDescription(description)
        .setFooter({ text: translate('register.summary.footer', { count: characters.length }) });
}

/**
 * Instructions de vérification envoyées en MP (enregistrement standard)
 *
 * @param translate - Traductions
 * @param characterName - Nom du personnage à vérifier
 * @param discordUserId - ID à indiquer dans le courrier in-game
 */
export function buildVerificationInstructionsEmbed(
    translate: TracerTranslator,
    characterName: string,
    discordUserId: string
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Warning)
        .setTitle(translate('register.verificationInstructions.title'))
        .setDescription(translate('register.verificationInstructions.description', {
            name: characterName,
            verifier: VERIFICATION_MAIL_RECIPIENT,
            discordId: discordUserId,
        }))
        .setFooter({ text: translate('register.verificationInstructions.footer') });
}

/**
 * Instructions de vérification envoyées en MP (personnage revendiqué par d'autres)
 *
 * @param translate - Traductions
 * @param discordUserId - ID à indiquer dans le courrier in-game
 */
export function buildVerificationWarningEmbed(translate: TracerTranslator, discordUserId: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(EmbedColors.Help)
        .setTitle(translate('register.verificationWarning.title'))
        .setDescription(translate('register.verificationWarning.description', {
            verifier: VERIFICATION_MAIL_RECIPIENT,
            discordId: discordUserId,
        }))
        .setFooter({ text: translate('register.verificationWarning.footer') });
}

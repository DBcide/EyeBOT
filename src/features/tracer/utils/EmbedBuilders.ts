import { EmbedBuilder } from 'discord.js';
import { AlbionService } from '../services/AlbionService';

/**
 * Interface représentant un personnage enregistré
 */
interface RegisteredCharacter {
    albion_name: string;
    kill_fame: number;
    is_verified: number;
}

/**
 * Construit l'embed récapitulatif des personnages liés à un compte Discord
 * @param allCharacters Liste de tous les personnages enregistrés par l'utilisateur
 * @param albionService Instance du service Albion pour le formatage
 * @returns EmbedBuilder configuré
 */
export function buildCharactersSummaryEmbed(
    allCharacters: RegisteredCharacter[],
    albionService: AlbionService
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#4A90E2')
        .setTitle('📋 Personnages liés à ce compte')
        .setDescription(
            allCharacters.length > 0
                ? allCharacters
                    .map(
                        (char, index) =>
                            `**${index + 1}.** ${char.albion_name} - ${albionService.formatFame(
                                char.kill_fame
                            )} Kill Fame ${char.is_verified ? '🔒' : ''}`
                    )
                    .join('\n')
                : 'Aucun personnage enregistré.'
        )
        .setFooter({ text: `Total : ${allCharacters.length} personnage(s) | 🔒 = Vérifié` });
}

/**
 * Construit l'embed d'instructions de vérification
 * @param playerName Nom du personnage Albion
 * @param discordUserId ID Discord de l'utilisateur
 * @returns EmbedBuilder configuré
 */
export function buildVerificationInstructionsEmbed(
    playerName: string,
    discordUserId: string
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle('🔒 Sécurisez votre personnage !')
        .setDescription(
            `Pour **protéger** votre personnage et empêcher d'autres joueurs de le revendiquer :\n\n` +
            `**1.** Connectez-vous sur **Albion Online** avec le personnage **${playerName}**\n` +
            `**2.** Envoyez un **courrier in-game** à **DBcide**\n` +
            `**3.** Dans le courrier, indiquez votre Discord ID : \`${discordUserId}\`\n` +
            `**4.** Attendez la validation par un administrateur\n\n` +
            `⚠️ **Important :** C'est bien le personnage Albion qui doit envoyer le courrier !`
        )
        .setFooter({ text: 'Une fois vérifié, ce personnage sera définitivement lié à votre compte Discord' });
}

/**
 * Construit l'embed d'instructions de vérification pour un compte avec avertissement
 * @param discordUserId ID Discord de l'utilisateur
 * @returns EmbedBuilder configuré
 */
export function buildVerificationWarningEmbed(discordUserId: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🔒 Comment vérifier votre personnage ?')
        .setDescription(
            `Pour **sécuriser** votre personnage et empêcher d'autres joueurs de le revendiquer :\n\n` +
            `**1.** Connectez-vous sur Albion Online avec ce personnage\n` +
            `**2.** Envoyez un mail in-game à **DBcide** avec votre Discord ID (\`${discordUserId}\`)\n` +
            `**3.** Attendez la validation par un administrateur\n\n` +
            `Une fois vérifié, ce personnage sera définitivement lié à votre compte Discord.`
        )
        .setFooter({ text: 'La vérification protège votre personnage contre les revendications frauduleuses' });
}

/**
 * Construit l'embed d'erreur quand un personnage est déjà vérifié par quelqu'un d'autre
 * @param verifiedOwner ID Discord du propriétaire vérifié
 * @param playerName Nom du personnage (optionnel)
 * @param killFame Kill fame formaté (optionnel)
 * @param guildName Nom de la guilde (optionnel)
 * @returns EmbedBuilder configuré
 */
export function buildCharacterAlreadyVerifiedEmbed(
    verifiedOwner: string,
    playerName?: string,
    killFame?: string,
    guildName?: string
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Personnage déjà vérifié')
        .setDescription(
            `Ce personnage est déjà lié et **vérifié** par un autre compte Discord (<@${verifiedOwner}>).\n\n` +
            `⚠️ Un personnage vérifié ne peut pas être lié à un autre compte Discord.`
        )
        .setTimestamp();

    if (playerName) {
        embed.addFields({
            name: '📋 Informations du personnage',
            value:
                `**Albion :** ${playerName}\n` +
                `**Kill Fame :** ${killFame || 'N/A'}\n` +
                `**Guilde :** ${guildName || 'Aucune'}`,
            inline: false
        });
    }

    return embed;
}

/**
 * Construit l'embed de succès pour un nouvel enregistrement
 * @param discordUserId ID Discord de l'utilisateur
 * @param playerName Nom du personnage Albion
 * @param killFame Kill fame formaté
 * @param guildName Nom de la guilde
 * @param allianceName Nom de l'alliance
 * @returns EmbedBuilder configuré
 */
export function buildRegistrationSuccessEmbed(
    discordUserId: string,
    playerName: string,
    killFame: string,
    guildName: string | null,
    allianceName: string | null
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#51CF66')
        .setTitle('✅ Nouveau personnage enregistré')
        .setDescription(
            `**Discord :** <@${discordUserId}>\n` +
            `**Albion :** ${playerName}\n` +
            `**Kill Fame :** ${killFame}\n` +
            `**Guilde :** ${guildName || 'Aucune'}\n` +
            `**Alliance :** ${allianceName || 'Aucune'}`
        )
        .setTimestamp();
}

/**
 * Construit l'embed d'avertissement pour un enregistrement avec multiples revendications
 * @param discordUserId ID Discord de l'utilisateur
 * @param playerName Nom du personnage Albion
 * @param killFame Kill fame formaté
 * @param guildName Nom de la guilde
 * @param allianceName Nom de l'alliance
 * @param otherClaimants Liste des autres revendicateurs (format : "<@id1>, <@id2>")
 * @param claimsCount Nombre de revendications existantes
 * @returns EmbedBuilder configuré
 */
export function buildRegistrationWithWarningEmbed(
    discordUserId: string,
    playerName: string,
    killFame: string,
    guildName: string | null,
    allianceName: string | null,
    otherClaimants: string,
    claimsCount: number
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle('⚠️ Personnage enregistré (revendications multiples)')
        .setDescription(
            `**Discord :** <@${discordUserId}>\n` +
            `**Albion :** ${playerName}\n` +
            `**Kill Fame :** ${killFame}\n` +
            `**Guilde :** ${guildName || 'Aucune'}\n` +
            `**Alliance :** ${allianceName || 'Aucune'}\n\n` +
            `⚠️ **Attention :** Ce personnage est également revendiqué par ${claimsCount} autre(s) utilisateur(s) :\n` +
            `${otherClaimants}\n\n` +
            `Ces comptes n'étant pas vérifiés, vous pouvez aussi le revendiquer.\n` +
            `**Vérifiez votre compte** pour être le seul propriétaire !`
        )
        .setTimestamp();
}
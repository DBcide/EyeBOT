import { EmbedBuilder, User, Guild } from 'discord.js';

/**
 * Construit l'embed d'erreur quand l'exécuteur n'a pas de compte Albion vérifié
 *
 * @returns EmbedBuilder configuré en rouge avec les instructions de vérification
 */
export function buildVouchNoVerifiedAccountEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Compte Albion non vérifié')
        .setDescription(
            `Pour vous porter garant d'un autre joueur, vous devez avoir au moins **un compte Albion Online vérifié** lié à votre compte Discord.\n\n` +
            `📬 Vous avez reçu les instructions de vérification en message privé lors de l'enregistrement de votre compte.\n\n` +
            `💡 Si vous n'avez pas reçu ces instructions, utilisez la commande \`/register\` pour enregistrer votre personnage Albion, puis suivez la procédure de vérification.`
        )
        .setTimestamp();
}

/**
 * Construit l'embed d'erreur quand l'utilisateur cible n'a aucun compte Albion enregistré
 *
 * @param targetUser - L'utilisateur Discord cible qui n'a pas de compte
 * @returns EmbedBuilder configuré en rouge avec le message d'invitation à s'enregistrer
 */
export function buildVouchTargetNoAccountEmbed(targetUser: User): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Compagnon non enregistré')
        .setDescription(
            `<@${targetUser.id}> n'a aucun compte Albion Online lié à son compte Discord.\n\n` +
            `💡 Merci de demander à votre compagnon de lier un compte Albion à son compte Discord avec la commande \`/register\` !`
        )
        .setTimestamp();
}

/**
 * Construit l'embed d'erreur quand un vouch circulaire est détecté
 *
 * @param targetUser - L'utilisateur Discord qui a déjà accordé un vouch à l'exécuteur
 * @returns EmbedBuilder configuré en rouge avec l'explication du vouch circulaire
 */
export function buildVouchCircularEmbed(targetUser: User): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Vouch circulaire détecté')
        .setDescription(
            `<@${targetUser.id}> vous a déjà accordé un vouch.\n\n` +
            `⚠️ Pour éviter les garanties circulaires, il vous est impossible de vous porter garant pour un utilisateur qui vous garantit déjà.`
        )
        .setTimestamp();
}

/**
 * Construit l'embed d'erreur quand l'exécuteur n'a aucune autorisation de vouch
 *
 * @param reason - Message d'explication de l'absence d'autorisation
 * @returns EmbedBuilder configuré en rouge avec la raison du refus
 */
export function buildVouchNoPermissionsEmbed(reason?: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Aucune autorisation de vouch')
        .setDescription(
            reason ??
            `Vous n'avez les autorisations pour effectuer un vouch dans aucun des serveurs communs.\n\n` +
            `💡 Les autorisations de vouch sont définies par les administrateurs des serveurs Discord.`
        )
        .setTimestamp();
}

/**
 * Construit l'embed de sélection des serveurs pour le vouch (message public non éphémère)
 *
 * @param voucher - L'utilisateur Discord qui exécute le vouch
 * @param targetUser - L'utilisateur Discord sous garantie
 * @param guilds - Liste des serveurs éligibles pour le vouch
 * @returns EmbedBuilder configuré avec la liste des serveurs disponibles
 */
export function buildVouchGuildSelectorEmbed(
    voucher: User,
    targetUser: User,
    guilds: Guild[]
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#4A90E2')
        .setTitle('🤝 Sélection des serveurs pour le vouch')
        .setDescription(
            `<@${voucher.id}> souhaite se porter **garant** pour <@${targetUser.id}>.\n\n` +
            `**Serveurs éligibles :**\n` +
            guilds.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n') +
            `\n\n📋 <@${voucher.id}>, sélectionnez le ou les serveurs sur lesquels appliquer votre vouch.`
        )
        .setFooter({ text: 'Ce menu expirera dans 5 minutes.' })
        .setTimestamp();
}

/**
 * Construit l'embed de confirmation après un vouch réussi (message public)
 *
 * @param voucher - L'utilisateur Discord qui s'est porté garant
 * @param vouchee - L'utilisateur Discord sous garantie
 * @param guilds - Liste des serveurs sur lesquels le vouch a été enregistré
 * @returns EmbedBuilder configuré en vert avec le résumé du vouch
 */
export function buildVouchSuccessEmbed(
    voucher: User,
    vouchee: User,
    guilds: Guild[]
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('✅ Vouch enregistré')
        .setDescription(
            `<@${voucher.id}> se porte désormais **garant** pour <@${vouchee.id}>.\n\n` +
            `**Serveur(s) concerné(s) :**\n` +
            guilds.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n')
        )
        .setTimestamp();
}

/**
 * Construit l'embed de notification MP envoyé à l'utilisateur sous garantie
 *
 * @param voucher - L'utilisateur Discord qui s'est porté garant
 * @param guilds - Liste des serveurs sur lesquels le vouch a été accordé
 * @returns EmbedBuilder configuré en vert avec les détails du vouch reçu
 */
export function buildVouchDMNotificationEmbed(voucher: User, guilds: Guild[]): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🤝 Vous avez reçu un vouch !')
        .setDescription(
            `<@${voucher.id}> (**${voucher.username}**) s'est porté **garant** pour vous sur le(s) serveur(s) suivant(s) :\n\n` +
            guilds.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n') +
            `\n\n💡 Un vouch signifie que ce joueur répond de vous et de votre comportement sur ces serveurs Discord.`
        )
        .setTimestamp();
}

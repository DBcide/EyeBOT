import { EmbedBuilder, User, Guild } from 'discord.js';
import { VouchGuildSetting, VouchRequirement } from '../models/VouchTypes';

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

// ─────────────────────────────────────────────────────────────────────────────
// Embeds de la commande /vouchrule (administration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit l'embed de confirmation d'activation/désactivation du vouch sur un serveur
 *
 * @param enabled - true si activé, false si désactivé
 * @param guildName - Nom du serveur Discord
 * @returns EmbedBuilder configuré
 */
export function buildVouchRuleToggleEmbed(enabled: boolean, guildName: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(enabled ? '#2ECC71' : '#E74C3C')
        .setTitle(enabled ? '✅ Vouch activé' : '🔴 Vouch désactivé')
        .setDescription(
            enabled
                ? `La feature vouch est désormais **activée** sur **${guildName}**.\n\n💡 Configurez les prérequis avec \`/vouchrule add\` ou laissez-les vides pour permettre à tous les membres de voucher.`
                : `La feature vouch est désormais **désactivée** sur **${guildName}**.\nAucun vouch ne peut être effectué sur ce serveur.`
        )
        .setTimestamp();
}

/**
 * Construit l'embed récapitulatif des règles de vouch d'un serveur
 *
 * @param settings - Paramètres de vouch du serveur (null si non configuré)
 * @param requirements - Liste des prérequis de rôles
 * @param guildName - Nom du serveur Discord
 * @returns EmbedBuilder configuré avec la liste des règles groupées
 */
export function buildVouchRuleListEmbed(
    settings: VouchGuildSetting | null,
    requirements: VouchRequirement[],
    guildName: string
): EmbedBuilder {
    const isEnabled = settings?.is_enabled === 1;
    const status = isEnabled ? '🟢 **Activé**' : '🔴 **Désactivé**';

    const embed = new EmbedBuilder()
        .setColor(isEnabled ? '#4A90E2' : '#95A5A6')
        .setTitle(`📋 Règles de vouch — ${guildName}`)
        .setDescription(`**Statut :** ${status}`)
        .setTimestamp();

    if (requirements.length === 0) {
        embed.addFields({
            name: '🔓 Prérequis',
            value: 'Aucun prérequis configuré — tous les membres peuvent voucher (si activé).',
            inline: false,
        });
        return embed;
    }

    // Regrouper par condition_group
    const groups = new Map<number, VouchRequirement[]>();
    for (const req of requirements) {
        if (!groups.has(req.condition_group)) groups.set(req.condition_group, []);
        groups.get(req.condition_group)!.push(req);
    }

    const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);

    const lines: string[] = [];
    for (const [groupNum, reqs] of sortedGroups) {
        lines.push(`**Groupe ${groupNum}** *(ET)*`);
        for (const req of reqs) {
            const icon = req.requirement_type === 'must_have' ? '✅' : '❌';
            const label = req.requirement_type === 'must_have' ? 'Doit avoir' : 'Ne doit pas avoir';
            lines.push(`  ${icon} \`ID:${req.id}\` ${label} <@&${req.role_id}>`);
        }
    }

    if (sortedGroups.length > 1) {
        lines.push('');
        lines.push('*Les groupes sont combinés avec un opérateur **OU***');
    }

    embed.addFields({
        name: '🔒 Prérequis de rôles',
        value: lines.join('\n'),
        inline: false,
    });

    return embed;
}

/**
 * Construit l'embed de confirmation d'ajout d'un prérequis
 *
 * @param id - ID du prérequis créé
 * @param roleId - ID Discord du rôle
 * @param requirementType - Type de condition
 * @param conditionGroup - Numéro de groupe
 * @returns EmbedBuilder configuré en vert
 */
export function buildVouchRuleAddEmbed(
    id: number,
    roleId: string,
    requirementType: 'must_have' | 'must_not_have',
    conditionGroup: number
): EmbedBuilder {
    const label = requirementType === 'must_have' ? 'Doit posséder' : 'Ne doit pas posséder';
    return new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('✅ Prérequis ajouté')
        .addFields(
            { name: 'ID', value: `\`${id}\``, inline: true },
            { name: 'Rôle', value: `<@&${roleId}>`, inline: true },
            { name: 'Type', value: label, inline: true },
            { name: 'Groupe', value: `${conditionGroup}`, inline: true },
        )
        .setFooter({ text: 'Utilisez /vouchrule list pour voir toutes les règles.' })
        .setTimestamp();
}

/**
 * Construit l'embed de confirmation de suppression ou modification d'un prérequis
 *
 * @param action - 'remove' ou 'modify'
 * @param requirementId - ID du prérequis concerné
 * @returns EmbedBuilder configuré
 */
export function buildVouchRuleActionEmbed(action: 'remove' | 'modify', requirementId: number): EmbedBuilder {
    const isRemove = action === 'remove';
    return new EmbedBuilder()
        .setColor(isRemove ? '#E67E22' : '#3498DB')
        .setTitle(isRemove ? '🗑️ Prérequis supprimé' : '✏️ Prérequis modifié')
        .setDescription(`Le prérequis \`ID:${requirementId}\` a été ${isRemove ? 'supprimé' : 'modifié'} avec succès.`)
        .setFooter({ text: 'Utilisez /vouchrule list pour voir toutes les règles.' })
        .setTimestamp();
}

/**
 * Construit l'embed d'erreur quand un prérequis est introuvable
 *
 * @param requirementId - ID du prérequis recherché
 * @returns EmbedBuilder configuré en rouge
 */
export function buildVouchRuleNotFoundEmbed(requirementId: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Prérequis introuvable')
        .setDescription(`Aucun prérequis avec l'ID \`${requirementId}\` n'existe sur ce serveur.\n\nUtilisez \`/vouchrule list\` pour voir les IDs disponibles.`)
        .setTimestamp();
}

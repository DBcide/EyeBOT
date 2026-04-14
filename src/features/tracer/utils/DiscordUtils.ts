import { Guild, GuildMember } from 'discord.js';
import { LoggerService } from '../../../shared/services/LoggerService';
import { buildGuildTag } from './GuildUtils';

/**
 * Renomme un membre sur un serveur Discord avec le format: `[TAG] CharacterName`
 *
 * @param guild - Le serveur Discord où renommer le membre (null = skip)
 * @param userId - L'ID Discord du membre à renommer
 * @param characterName - Le nom du personnage Albion à utiliser
 * @param guildName - Le nom de la guilde Albion (optionnel, utilisé pour le tag)
 * @param logger - LoggerService pour logger les erreurs (optionnel)
 * @returns true si le renommage a réussi, false sinon
 *
 * @remarks
 * **Format du pseudo**:
 * - Si guilde: `[GUILD] CharacterName`
 * - Si pas de guilde: `CharacterName`
 *
 * **Gestion des permissions**:
 * - Si le bot n'a pas la permission MANAGE_NICKNAMES: Return false
 * - Si le membre est owner du serveur: Discord interdit le renommage (return false)
 * - Si le rôle du bot est inférieur au rôle du membre: Return false
 *
 * **Gestion des erreurs**:
 * - Membre introuvable: Log warn + return false (pas de throw)
 * - Permission refusée: Log warn + return false
 * - Erreur Discord: Log debug + return false
 *
 * **Utilisation typique**:
 * - Après enregistrement d'un personnage (/register)
 * - Après mise à jour d'un personnage (/update, /updateall)
 * - Après vérification d'un personnage (/verify)
 *
 * **Note**: Cette fonction est fail-safe (jamais de throw)
 *
 * @example
 * ```typescript
 * const guild = interaction.guild;
 * const userId = interaction.user.id;
 * const success = await updateMemberNickname(
 *     guild,
 *     userId,
 *     'PlayerName',
 *     'MyGuild',
 *     logger
 * );
 * if (success) {
 *     console.log('Pseudo mis à jour: [MYGUI] PlayerName');
 * } else {
 *     console.log('Impossible de mettre à jour le pseudo');
 * }
 * ```
 *
 * @see buildGuildTag - Fonction qui construit le tag de guilde
 */
export async function updateMemberNickname(
    guild: Guild | null,
    userId: string,
    characterName: string,
    guildName?: string | null,
    logger?: LoggerService
): Promise<boolean> {
    if (!guild) {
        return false;
    }

    try {
        const member = await guild.members.fetch(userId);
        const tag = buildGuildTag(guildName);
        const nickname = `${tag} ${characterName}`;

        await member.setNickname(nickname);
        return true;
    } catch (error) {
        if (logger) {
            logger.warn(`Impossible de renommer le membre ${userId}`);
            if (error instanceof Error) {
                logger.debug(`Détails de l'erreur: ${error.message}`);
            }
        }
        return false;
    }
}

import { Guild, GuildMember } from 'discord.js';
import { LoggerService } from '../../../shared/services/LoggerService';
import { buildGuildTag } from './GuildUtils';

/**
 * Renomme un membre sur un serveur Discord avec le tag de guilde et le nom du personnage Albion
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

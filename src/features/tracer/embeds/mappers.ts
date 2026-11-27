import { AlbionPlayer, AlbionPlayerDetailed, TracerUser } from '../models/AlbionTypes';
import { CharacterView } from './types';

/**
 * Conversions des formats sources (API Albion, base de données) vers CharacterView
 *
 * @remarks
 * Les embeds ne connaissent qu'un seul format : si l'API ou le schéma SQL change,
 * seul ce fichier est à adapter.
 */

/** Joueur issu de la recherche API (ou du détail joueur) */
export function fromAlbionPlayer(player: AlbionPlayer | AlbionPlayerDetailed): CharacterView & { id: string } {
    return {
        id: player.Id,
        name: player.Name,
        killFame: player.KillFame,
        deathFame: player.DeathFame,
        guildName: player.GuildName,
        allianceName: player.AllianceName,
    };
}

/** Personnage enregistré en base (table tracer_users) */
export function fromTracerUser(user: TracerUser): CharacterView & { id: string; isVerified: boolean } {
    return {
        id: user.albion_id,
        name: user.albion_name,
        killFame: user.kill_fame,
        deathFame: user.death_fame,
        guildName: user.guild_name,
        allianceName: user.alliance_name,
        isVerified: user.is_verified === 1,
    };
}

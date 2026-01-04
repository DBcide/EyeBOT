/**
 * Réponse de l'API de recherche Albion Online
 */
export interface AlbionSearchResponse {
    guilds: AlbionGuild[];
    players: AlbionPlayer[];
}

/**
 * Informations sur une guilde Albion
 */
export interface AlbionGuild {
    Id: string;
    Name: string;
    AllianceId: string;
    AllianceName: string;
    KillFame: number | null;
    DeathFame: number;
}

/**
 * Informations sur un joueur Albion
 */
export interface AlbionPlayer {
    Id: string;
    Name: string;
    GuildId: string;
    GuildName: string;
    AllianceId: string;
    AllianceName: string;
    Avatar: string;
    AvatarRing: string;
    KillFame: number;
    DeathFame: number;
    FameRatio: number;
    totalKills: number | null;
    gvgKills: number | null;
    gvgWon: number | null;
}

/**
 * Réponse détaillée de l'API pour un joueur spécifique (/players/{id})
 */
export interface AlbionPlayerDetailed {
    Name: string;
    Id: string;
    GuildName: string;
    GuildId: string;
    AllianceName: string;
    AllianceId: string;
    AllianceTag: string;
    Avatar: string;
    AvatarRing: string;
    DeathFame: number;
    KillFame: number;
    FameRatio: number;
    LifetimeStatistics: {
        PvE: {
            Total: number;
            Royal: number;
            Outlands: number;
            Avalon: number;
            Hellgate: number;
            CorruptedDungeon: number;
            Mists: number;
        };
        Gathering: any;
        Crafting: any;
        CrystalLeague: number;
        FishingFame: number;
        FarmingFame: number;
        Timestamp: string;
    };
    AverageItemPower: number;
    Equipment: any;
    Inventory: any[];
}

/**
 * Données d'un utilisateur enregistré dans notre base
 */
export interface TracerUser {
    id: number;
    discord_id: string;
    albion_id: string;
    albion_name: string;
    kill_fame: number;
    death_fame: number;
    guild_name: string | null;
    alliance_name: string | null;
    registered_at: Date;
    updated_at: Date;
}
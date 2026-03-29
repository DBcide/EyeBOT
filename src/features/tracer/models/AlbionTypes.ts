/**
 * Réponse de l'API de recherche Albion Online
 *
 * @remarks
 * Retournée par l'endpoint GET `/search?q={query}` de l'API Albion.
 *
 * **Structure**:
 * - guilds: Liste des guildes correspondant à la recherche
 * - players: Liste des joueurs correspondant à la recherche
 *
 * **Utilisation**:
 * - AlbionService.searchPlayer() retourne uniquement le tableau `players`
 * - L'API peut retourner plusieurs résultats (recherche partielle supportée)
 *
 * @example
 * ```typescript
 * // Réponse typique de l'API
 * {
 *   "guilds": [],
 *   "players": [
 *     { "Id": "abc123", "Name": "PlayerName", ... }
 *   ]
 * }
 * ```
 */
export interface AlbionSearchResponse {
    /** Liste des guildes trouvées (non utilisé actuellement) */
    guilds: AlbionGuild[];
    /** Liste des joueurs trouvés */
    players: AlbionPlayer[];
}

/**
 * Informations sur une guilde Albion Online
 *
 * @remarks
 * Structure retournée par l'API Albion pour les guildes.
 * **Note**: Non utilisé actuellement par EyeBOT (seul `players` est exploité).
 *
 * **Champs**:
 * - **Id**: Identifiant unique de la guilde (UUID)
 * - **Name**: Nom de la guilde
 * - **AllianceId**: ID de l'alliance (vide si pas d'alliance)
 * - **AllianceName**: Nom de l'alliance (vide si pas d'alliance)
 * - **KillFame**: Fame totale de kills PvP (peut être null)
 * - **DeathFame**: Fame totale de morts PvP
 */
export interface AlbionGuild {
    /** Identifiant unique de la guilde */
    Id: string;
    /** Nom de la guilde */
    Name: string;
    /** ID de l'alliance (vide si aucune) */
    AllianceId: string;
    /** Nom de l'alliance (vide si aucune) */
    AllianceName: string;
    /** Fame de kills PvP (peut être null) */
    KillFame: number | null;
    /** Fame de morts PvP */
    DeathFame: number;
}

/**
 * Informations sur un joueur Albion Online (format API de recherche)
 *
 * @remarks
 * Structure retournée par l'endpoint GET `/search?q={query}`.
 * Utilisée par AlbionService.searchPlayer() pour trouver des joueurs.
 *
 * **Champs principaux**:
 * - **Id**: Identifiant unique du joueur (UUID) - Clé primaire dans notre DB
 * - **Name**: Pseudo du joueur dans Albion
 * - **GuildId**: ID de la guilde (vide si pas de guilde)
 * - **GuildName**: Nom de la guilde (vide si pas de guilde)
 * - **AllianceId**: ID de l'alliance (vide si pas d'alliance)
 * - **AllianceName**: Nom de l'alliance (vide si pas d'alliance)
 *
 * **Stats PvP**:
 * - **KillFame**: Fame totale de kills PvP
 * - **DeathFame**: Fame totale de morts PvP
 * - **FameRatio**: Ratio Kill/Death (KillFame / DeathFame)
 *
 * **Stats optionnelles** (peuvent être null):
 * - **totalKills**: Nombre total de kills
 * - **gvgKills**: Kills en GvG (Guild vs Guild)
 * - **gvgWon**: Victoires en GvG
 *
 * **Champs Avatar**:
 * - **Avatar**: URL de l'avatar du joueur
 * - **AvatarRing**: URL du ring d'avatar (cadre décoratif)
 *
 * **Utilisation typique**:
 * - Recherche de joueur dans /register
 * - Affichage dans les menus de sélection
 * - Enregistrement initial dans tracer_users
 *
 * @example
 * ```typescript
 * const player: AlbionPlayer = {
 *   Id: "abc123xyz",
 *   Name: "PlayerName",
 *   GuildId: "guild456",
 *   GuildName: "Elite Warriors",
 *   AllianceId: "ally789",
 *   AllianceName: "Big Alliance",
 *   Avatar: "https://...",
 *   AvatarRing: "https://...",
 *   KillFame: 1000000,
 *   DeathFame: 50000,
 *   FameRatio: 20.0,
 *   totalKills: 500,
 *   gvgKills: 50,
 *   gvgWon: 10
 * };
 * ```
 */
export interface AlbionPlayer {
    /** Identifiant unique du joueur (UUID) */
    Id: string;
    /** Pseudo du joueur dans Albion */
    Name: string;
    /** ID de la guilde (vide si aucune) */
    GuildId: string;
    /** Nom de la guilde (vide si aucune) */
    GuildName: string;
    /** ID de l'alliance (vide si aucune) */
    AllianceId: string;
    /** Nom de l'alliance (vide si aucune) */
    AllianceName: string;
    /** URL de l'avatar du joueur */
    Avatar: string;
    /** URL du ring d'avatar (cadre décoratif) */
    AvatarRing: string;
    /** Fame totale de kills PvP */
    KillFame: number;
    /** Fame totale de morts PvP */
    DeathFame: number;
    /** Ratio Kill/Death (KillFame / DeathFame) */
    FameRatio: number;
    /** Nombre total de kills (peut être null) */
    totalKills: number | null;
    /** Kills en GvG - Guild vs Guild (peut être null) */
    gvgKills: number | null;
    /** Victoires en GvG (peut être null) */
    gvgWon: number | null;
}

/**
 * Réponse détaillée de l'API Albion pour un joueur spécifique
 *
 * @remarks
 * Structure retournée par l'endpoint GET `/players/{id}`.
 * Utilisée par AlbionService.getPlayerDetailsById() pour obtenir les stats complètes.
 *
 * **Différence avec AlbionPlayer**:
 * - AlbionPlayer: Données de recherche (légères)
 * - AlbionPlayerDetailed: Données complètes avec statistiques détaillées
 *
 * **Sections principales**:
 *
 * **Informations de base**:
 * - Name, Id, GuildName, AllianceName, Avatar, etc.
 *
 * **Stats PvP**:
 * - KillFame, DeathFame, FameRatio
 *
 * **Statistiques de vie (LifetimeStatistics)**:
 * - PvE: Fame PvE par zone (Royal, Outlands, Avalon, Hellgate, etc.)
 * - Gathering: Stats de récolte (non typé, any)
 * - Crafting: Stats de craft (non typé, any)
 * - CrystalLeague: Fame en Crystal League
 * - FishingFame: Fame de pêche
 * - FarmingFame: Fame de farming
 *
 * **Équipement**:
 * - Equipment: Équipement actuellement porté (non typé)
 * - Inventory: Inventaire (non typé)
 * - AverageItemPower: Item power moyen
 *
 * **Utilisation typique**:
 * - Mise à jour de personnage (/update, /updateall)
 * - Affichage de stats détaillées
 * - Synchronisation avec tracer_users
 *
 * @example
 * ```typescript
 * const details: AlbionPlayerDetailed = {
 *   Name: "PlayerName",
 *   Id: "abc123",
 *   GuildName: "Elite Warriors",
 *   KillFame: 1000000,
 *   DeathFame: 50000,
 *   FameRatio: 20.0,
 *   LifetimeStatistics: {
 *     PvE: {
 *       Total: 5000000,
 *       Royal: 1000000,
 *       Outlands: 4000000,
 *       ...
 *     },
 *     ...
 *   },
 *   AverageItemPower: 1250.5,
 *   ...
 * };
 * ```
 */
export interface AlbionPlayerDetailed {
    /** Pseudo du joueur dans Albion */
    Name: string;
    /** Identifiant unique du joueur (UUID) */
    Id: string;
    /** Nom de la guilde (vide si aucune) */
    GuildName: string;
    /** ID de la guilde (vide si aucune) */
    GuildId: string;
    /** Nom de l'alliance (vide si aucune) */
    AllianceName: string;
    /** ID de l'alliance (vide si aucune) */
    AllianceId: string;
    /** Tag de l'alliance (ex: "ELITE") */
    AllianceTag: string;
    /** URL de l'avatar du joueur */
    Avatar: string;
    /** URL du ring d'avatar (cadre décoratif) */
    AvatarRing: string;
    /** Fame totale de morts PvP */
    DeathFame: number;
    /** Fame totale de kills PvP */
    KillFame: number;
    /** Ratio Kill/Death (KillFame / DeathFame) */
    FameRatio: number;
    /** Statistiques de vie complètes du joueur */
    LifetimeStatistics: {
        /** Fame PvE par zone */
        PvE: {
            /** Fame PvE totale */
            Total: number;
            /** Fame Royal (zones bleues/jaunes) */
            Royal: number;
            /** Fame Outlands (zones rouges/noires) */
            Outlands: number;
            /** Fame Avalon (routes d'Avalon) */
            Avalon: number;
            /** Fame Hellgate (portes infernales) */
            Hellgate: number;
            /** Fame Corrupted Dungeon (donjons corrompus) */
            CorruptedDungeon: number;
            /** Fame Mists (brumes) */
            Mists: number;
        };
        /** Stats de récolte (structure non typée) */
        Gathering: any;
        /** Stats de craft (structure non typée) */
        Crafting: any;
        /** Fame Crystal League */
        CrystalLeague: number;
        /** Fame de pêche */
        FishingFame: number;
        /** Fame de farming (îles) */
        FarmingFame: number;
        /** Timestamp de la dernière mise à jour */
        Timestamp: string;
    };
    /** Item power moyen de l'équipement */
    AverageItemPower: number;
    /** Équipement actuellement porté (structure non typée) */
    Equipment: any;
    /** Inventaire du joueur (structure non typée) */
    Inventory: any[];
}

/**
 * Données d'un personnage Albion enregistré dans la base de données (table tracer_users)
 *
 * @remarks
 * Structure de la table `tracer_users` dans MySQL.
 * Lie un utilisateur Discord à un ou plusieurs personnages Albion.
 *
 * **Clés et index**:
 * - id: PRIMARY KEY AUTO_INCREMENT
 * - albion_id: INDEX (recherche rapide par personnage Albion)
 * - discord_id: INDEX (recherche rapide par utilisateur Discord)
 * - UNIQUE (discord_id, albion_id): Empêche les doublons
 *
 * **Système de multi-claim**:
 * - Un personnage Albion peut être "claimed" par plusieurs utilisateurs Discord
 * - Mais un seul peut être "vérifié" (is_verified = 1)
 * - La vérification supprime automatiquement les autres claims
 *
 * **Système de personnage principal**:
 * - Un utilisateur peut avoir plusieurs personnages enregistrés
 * - Un seul peut être marqué is_main = 1 (personnage principal)
 * - Le personnage principal est priorisé pour les logs et affichages
 *
 * **Dates**:
 * - registered_at: Date du premier enregistrement (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
 * - updated_at: Date de la dernière mise à jour (TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)
 *
 * **Utilisation**:
 * - Retourné par TracerService.getRegisteredUsers()
 * - Retourné par TracerService.getAllClaimsForCharacter()
 * - Utilisé pour la mise à jour automatique des pseudos Discord
 * - Utilisé pour le logging des commandes (albion_character_id)
 *
 * @example
 * ```typescript
 * const user: TracerUser = {
 *   id: 1,
 *   discord_id: "123456789",
 *   albion_id: "abc123xyz",
 *   albion_name: "PlayerName",
 *   kill_fame: 1000000,
 *   death_fame: 50000,
 *   guild_name: "Elite Warriors",
 *   alliance_name: "Big Alliance",
 *   is_verified: 1,
 *   is_main: 1,
 *   registered_at: new Date('2026-01-01'),
 *   updated_at: new Date('2026-03-29')
 * };
 * ```
 */
export interface TracerUser {
    /** ID auto-incrémenté (clé primaire) */
    id: number;
    /** ID Discord de l'utilisateur */
    discord_id: string;
    /** ID du personnage Albion (UUID) */
    albion_id: string;
    /** Pseudo du personnage Albion */
    albion_name: string;
    /** Fame de kills PvP */
    kill_fame: number;
    /** Fame de morts PvP */
    death_fame: number;
    /** Nom de la guilde (null si aucune) */
    guild_name: string | null;
    /** Nom de l'alliance (null si aucune) */
    alliance_name: string | null;
    /** Statut de vérification: 0 = non vérifié, 1 = vérifié (exclusif) */
    is_verified: number;
    /** Personnage principal: 0 = secondaire, 1 = principal */
    is_main: number;
    /** Date du premier enregistrement */
    registered_at: Date;
    /** Date de la dernière mise à jour */
    updated_at: Date;
}
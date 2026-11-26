/**
 * Données affichées d'un personnage Albion dans un embed
 *
 * @remarks
 * Type d'entrée commun aux builders : il découple les embeds des formats sources
 * (AlbionPlayer de la recherche API, AlbionPlayerDetailed, ou TracerUser en base).
 * Le formatage (fame, "Aucune" pour une guilde vide...) est fait par le builder.
 */
export interface CharacterView {
    name: string;
    killFame: number;
    deathFame?: number;
    guildName?: string | null;
    allianceName?: string | null;
}

/** Progression de /updateall après un batch */
export interface UpdateAllProgress {
    total: number;
    processed: number;
    success: number;
    skipped: number;
    failures: number;
    batch: number;
    totalBatches: number;
}

/** Résultat final de /updateall */
export interface UpdateAllResults {
    success: number;
    failures: number;
    skipped: number;
    /** Une ligne par échec : "Tag (Personnage): message d'erreur" */
    details: string[];
}

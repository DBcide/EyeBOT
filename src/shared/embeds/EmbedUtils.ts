/** Longueur maximale de la valeur d'un champ d'embed Discord */
export const EMBED_FIELD_MAX_LENGTH = 1024;

/**
 * Tronque un texte à la taille maximale d'un champ d'embed
 *
 * @param value - Le texte du champ
 * @param maxLength - Limite (1024 par défaut, limite Discord d'un champ)
 * @returns Le texte, terminé par "..." s'il a été coupé
 *
 * @remarks
 * Discord rejette tout le message si un champ dépasse la limite : mieux vaut couper.
 */
export function truncateField(value: string, maxLength: number = EMBED_FIELD_MAX_LENGTH): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

/**
 * Formate une date en timestamp Discord (`<t:...:d>`)
 *
 * @param date - La date à afficher
 * @returns Une balise que Discord affiche dans la langue et le fuseau du lecteur
 *
 * @remarks
 * Évite de formater les dates côté bot (toLocaleDateString('fr-FR')), ce qui
 * figerait la langue et le fuseau horaire.
 */
export function discordDate(date: Date | string | number): string {
    return `<t:${Math.floor(new Date(date).getTime() / 1000)}:d>`;
}

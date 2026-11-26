/**
 * Formate une valeur de fame pour l'affichage (B, M, K)
 *
 * @param fame - La valeur de fame (nombre entier)
 * @returns La valeur formatée avec 2 décimales et son unité, ou le nombre brut si < 1000
 *
 * @remarks
 * Fonction pure (sans service) : utilisable directement par les builders d'embeds.
 *
 * @example
 * ```typescript
 * formatFame(1234567890); // "1.23B"
 * formatFame(12345678);   // "12.35M"
 * formatFame(12345);      // "12.35K"
 * formatFame(999);        // "999"
 * ```
 */
export function formatFame(fame: number): string {
    if (fame >= 1_000_000_000) {
        return `${(fame / 1_000_000_000).toFixed(2)}B`;
    } else if (fame >= 1_000_000) {
        return `${(fame / 1_000_000).toFixed(2)}M`;
    } else if (fame >= 1_000) {
        return `${(fame / 1_000).toFixed(2)}K`;
    }
    return fame.toString();
}

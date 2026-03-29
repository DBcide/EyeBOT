/**
 * Convertit une erreur API Albion en message utilisateur lisible et convivial
 *
 * @param error - L'objet d'erreur capturé depuis AlbionService (peut être null/undefined)
 * @returns Message d'erreur formaté pour Discord avec émoji ❌
 *
 * @remarks
 * **Catégories d'erreurs détectées**:
 * - **Timeout**: Message contient "timeout"
 *   → "L'API Albion met trop de temps à répondre"
 *
 * - **Rate limit**: Message contient "rate limit"
 *   → "Trop de requêtes à l'API Albion"
 *
 * - **Network**: Message contient "fetch" ou "network"
 *   → "Impossible de contacter l'API Albion"
 *
 * - **Erreur inconnue**: Pas de message ou erreur non reconnue
 *   → Message générique
 *
 * **Utilisation typique**:
 * - Wrapper pour les erreurs de AlbionService.searchPlayer()
 * - Wrapper pour les erreurs de AlbionService.getPlayerDetailsById()
 * - Affichage direct dans les embeds Discord
 *
 * **Principe**: Masquer les détails techniques et afficher un message convivial
 *
 * **Note**: Retourne toujours un message (jamais de throw), safe pour interaction.reply()
 *
 * @example
 * ```typescript
 * try {
 *     const player = await albionService.searchPlayer('PlayerName');
 * } catch (error) {
 *     const userMessage = getAlbionApiErrorMessage(error);
 *     await interaction.reply({ content: userMessage, ephemeral: true });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Timeout error
 * const error = new Error('Request timeout after 10000ms');
 * console.log(getAlbionApiErrorMessage(error));
 * // Output: "❌ L'API Albion met trop de temps à répondre..."
 *
 * // Rate limit error
 * const error2 = new Error('Rate limit exceeded');
 * console.log(getAlbionApiErrorMessage(error2));
 * // Output: "❌ Trop de requêtes à l'API Albion..."
 * ```
 */
export function getAlbionApiErrorMessage(error: any): string {
    if (!error || !error.message) {
        return '❌ Une erreur inconnue est survenue.';
    }

    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
        return '❌ L\'API Albion met trop de temps à répondre. Réessayez dans quelques instants.';
    }

    if (message.includes('rate limit')) {
        return '❌ Trop de requêtes à l\'API Albion. Veuillez patienter quelques instants avant de réessayer.';
    }

    if (message.includes('fetch') || message.includes('network')) {
        return '❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.';
    }

    return '❌ Une erreur est survenue lors de la communication avec l\'API Albion.';
}

/**
 * Convertit une erreur API Albion en message utilisateur lisible
 */
export function getAlbionApiErrorMessage(error: any): string {
    if (!error?.message) {
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

import { TracerTranslator } from '../translations';

/**
 * Convertit une erreur de l'API Albion en message utilisateur traduit
 *
 * @param error - L'erreur capturée depuis AlbionService (peut être null/undefined)
 * @param translate - Traductions dans la langue de l'utilisateur
 * @returns Message prêt à afficher (jamais de throw)
 *
 * @remarks
 * Catégories détectées d'après le message technique de l'erreur :
 * - "timeout" → errors.albion.timeout
 * - "rate limit" → errors.albion.rateLimit
 * - "fetch" / "network" → errors.albion.network
 * - pas de message → errors.albion.unknown
 * - autre → errors.albion.generic
 *
 * @example
 * ```typescript
 * try {
 *     await albionService.searchPlayer('PlayerName');
 * } catch (error) {
 *     await interaction.editReply(getAlbionApiErrorMessage(error, translate));
 * }
 * ```
 */
export function getAlbionApiErrorMessage(error: any, translate: TracerTranslator): string {
    if (!error?.message) {
        return translate('errors.albion.unknown');
    }

    const message = String(error.message).toLowerCase();

    if (message.includes('timeout')) {
        return translate('errors.albion.timeout');
    }

    if (message.includes('rate limit')) {
        return translate('errors.albion.rateLimit');
    }

    if (message.includes('fetch') || message.includes('network')) {
        return translate('errors.albion.network');
    }

    return translate('errors.albion.generic');
}

import { TracerTranslator } from '../i18n';

/**
 * Convertit une erreur de l'API Albion en message utilisateur traduit
 *
 * @param error - L'erreur capturée depuis AlbionService (peut être null/undefined)
 * @param t - Traductions dans la langue de l'utilisateur
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
 *     await interaction.editReply(getAlbionApiErrorMessage(error, t));
 * }
 * ```
 */
<<<<<<< HEAD
export function getAlbionApiErrorMessage(error: any, t: TracerTranslator): string {
    if (!error || !error.message) {
        return t('errors.albion.unknown');
=======
export function getAlbionApiErrorMessage(error: any): string {
    if (!error?.message) {
        return '❌ Une erreur inconnue est survenue.';
>>>>>>> fc702880329b712be25dc0220687c57c247aaf1a
    }

    const message = String(error.message).toLowerCase();

    if (message.includes('timeout')) {
        return t('errors.albion.timeout');
    }

    if (message.includes('rate limit')) {
        return t('errors.albion.rateLimit');
    }

    if (message.includes('fetch') || message.includes('network')) {
        return t('errors.albion.network');
    }

    return t('errors.albion.generic');
}

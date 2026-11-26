import { getAlbionApiErrorMessage } from '@/features/tracer/utils/ErrorHandlers';

describe('getAlbionApiErrorMessage', () => {

    // ─── Erreur sans message ──────────────────────────────────────────────────

    describe('erreur sans message exploitable', () => {
        it('[extrême] retourne le message inconnu si error est null', () => {
            expect(getAlbionApiErrorMessage(null)).toBe('❌ Une erreur inconnue est survenue.');
        });

        it('[extrême] retourne le message inconnu si error est undefined', () => {
            expect(getAlbionApiErrorMessage(undefined)).toBe('❌ Une erreur inconnue est survenue.');
        });

        it('[extrême] retourne le message inconnu si error est un objet sans propriété message', () => {
            expect(getAlbionApiErrorMessage({ code: 500 })).toBe('❌ Une erreur inconnue est survenue.');
        });
    });

    // ─── Types d'erreurs connus ───────────────────────────────────────────────

    describe('timeout', () => {
        it('[positif] retourne le message timeout si error.message contient "timeout"', () => {
            expect(getAlbionApiErrorMessage({ message: 'Request timeout' }))
                .toBe("❌ L'API Albion met trop de temps à répondre. Réessayez dans quelques instants.");
        });

        it('[positif] la détection est insensible à la casse ("TIMEOUT")', () => {
            expect(getAlbionApiErrorMessage({ message: 'TIMEOUT' }))
                .toBe("❌ L'API Albion met trop de temps à répondre. Réessayez dans quelques instants.");
        });
    });

    describe('rate limit', () => {
        it('[positif] retourne le message rate limit si error.message contient "rate limit"', () => {
            expect(getAlbionApiErrorMessage({ message: 'rate limit exceeded' }))
                .toBe('❌ Trop de requêtes à l\'API Albion. Veuillez patienter quelques instants avant de réessayer.');
        });
    });

    describe('erreur réseau', () => {
        it('[positif] retourne le message réseau si error.message contient "fetch"', () => {
            expect(getAlbionApiErrorMessage({ message: 'fetch failed' }))
                .toBe('❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.');
        });

        it('[positif] retourne le message réseau si error.message contient "network"', () => {
            expect(getAlbionApiErrorMessage({ message: 'network error' }))
                .toBe('❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.');
        });
    });

    // ─── Erreur générique ─────────────────────────────────────────────────────

    describe('erreur générique', () => {
        it('[positif] retourne le message générique si l\'erreur ne correspond à aucun type connu', () => {
            expect(getAlbionApiErrorMessage({ message: 'unknown crash' }))
                .toBe('❌ Une erreur est survenue lors de la communication avec l\'API Albion.');
        });
    });
});

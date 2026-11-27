import { getAlbionApiErrorMessage } from '@/features/tracer/utils/ErrorHandlers';
import { tracerI18n } from '@/features/tracer/i18n';

// Les messages viennent des fichiers de traduction : on teste la langue de référence (fr)
// et on vérifie qu'une autre langue est bien prise en compte.
const fr = tracerI18n.for('fr');
const en = tracerI18n.for('en');

describe('getAlbionApiErrorMessage', () => {

    // ─── Erreur sans message ──────────────────────────────────────────────────

    describe('erreur sans message exploitable', () => {
        it('[extrême] retourne le message inconnu si error est null', () => {
            expect(getAlbionApiErrorMessage(null, fr)).toBe('❌ Une erreur inconnue est survenue.');
        });

        it('[extrême] retourne le message inconnu si error est undefined', () => {
            expect(getAlbionApiErrorMessage(undefined, fr)).toBe('❌ Une erreur inconnue est survenue.');
        });

        it('[extrême] retourne le message inconnu si error est un objet sans propriété message', () => {
            expect(getAlbionApiErrorMessage({ code: 500 }, fr)).toBe('❌ Une erreur inconnue est survenue.');
        });
    });

    // ─── Types d'erreurs connus ───────────────────────────────────────────────

    describe('timeout', () => {
        it('[positif] retourne le message timeout si error.message contient "timeout"', () => {
            expect(getAlbionApiErrorMessage({ message: 'Request timeout' }, fr))
                .toBe("❌ L'API Albion met trop de temps à répondre. Réessayez dans quelques instants.");
        });

        it('[positif] la détection est insensible à la casse ("TIMEOUT")', () => {
            expect(getAlbionApiErrorMessage({ message: 'TIMEOUT' }, fr))
                .toBe("❌ L'API Albion met trop de temps à répondre. Réessayez dans quelques instants.");
        });
    });

    describe('rate limit', () => {
        it('[positif] retourne le message rate limit si error.message contient "rate limit"', () => {
            expect(getAlbionApiErrorMessage({ message: 'rate limit exceeded' }, fr))
                .toBe('❌ Trop de requêtes à l\'API Albion. Veuillez patienter quelques instants avant de réessayer.');
        });
    });

    describe('erreur réseau', () => {
        it('[positif] retourne le message réseau si error.message contient "fetch"', () => {
            expect(getAlbionApiErrorMessage({ message: 'fetch failed' }, fr))
                .toBe('❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.');
        });

        it('[positif] retourne le message réseau si error.message contient "network"', () => {
            expect(getAlbionApiErrorMessage({ message: 'network error' }, fr))
                .toBe('❌ Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.');
        });
    });

    // ─── Erreur générique ─────────────────────────────────────────────────────

    describe('erreur générique', () => {
        it('[positif] retourne le message générique si l\'erreur ne correspond à aucun type connu', () => {
            expect(getAlbionApiErrorMessage({ message: 'unknown crash' }, fr))
                .toBe('❌ Une erreur est survenue lors de la communication avec l\'API Albion.');
        });
    });

    // ─── Traduction ───────────────────────────────────────────────────────────

    describe('traduction', () => {
        it('[positif] retourne le message dans la langue du traducteur fourni (en)', () => {
            expect(getAlbionApiErrorMessage({ message: 'Request timeout' }, en))
                .toBe('❌ The Albion API is taking too long to respond. Please try again in a moment.');
        });
    });
});

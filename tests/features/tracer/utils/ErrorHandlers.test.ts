import { getAlbionApiErrorMessage } from '@/features/tracer/utils/ErrorHandlers';
import { tracerTranslations } from '@/features/tracer/translations';

// Les messages viennent des fichiers de traduction : on teste la langue de référence (fr)
// et on vérifie qu'une autre langue est bien prise en compte.
const translateFr = tracerTranslations.forLocale('fr');
const translateEn = tracerTranslations.forLocale('en');

describe('getAlbionApiErrorMessage', () => {

    // ─── Erreur sans message ──────────────────────────────────────────────────

    describe('erreur sans message exploitable', () => {
        it('[extrême] retourne le message inconnu si error est null', () => {
            expect(getAlbionApiErrorMessage(null, translateFr)).toBe('\u{274C} Une erreur inconnue est survenue.');
        });

        it('[extrême] retourne le message inconnu si error est undefined', () => {
            expect(getAlbionApiErrorMessage(undefined, translateFr)).toBe('\u{274C} Une erreur inconnue est survenue.');
        });

        it('[extrême] retourne le message inconnu si error est un objet sans propriété message', () => {
            expect(getAlbionApiErrorMessage({ code: 500 }, translateFr)).toBe('\u{274C} Une erreur inconnue est survenue.');
        });
    });

    // ─── Types d'erreurs connus ───────────────────────────────────────────────

    describe('timeout', () => {
        it('[positif] retourne le message timeout si error.message contient "timeout"', () => {
            expect(getAlbionApiErrorMessage({ message: 'Request timeout' }, translateFr))
                .toBe("\u{274C} L'API Albion met trop de temps à répondre. Réessayez dans quelques instants.");
        });

        it('[positif] la détection est insensible à la casse ("TIMEOUT")', () => {
            expect(getAlbionApiErrorMessage({ message: 'TIMEOUT' }, translateFr))
                .toBe("\u{274C} L'API Albion met trop de temps à répondre. Réessayez dans quelques instants.");
        });
    });

    describe('rate limit', () => {
        it('[positif] retourne le message rate limit si error.message contient "rate limit"', () => {
            expect(getAlbionApiErrorMessage({ message: 'rate limit exceeded' }, translateFr))
                .toBe('\u{274C} Trop de requêtes à l\'API Albion. Veuillez patienter quelques instants avant de réessayer.');
        });
    });

    describe('erreur réseau', () => {
        it('[positif] retourne le message réseau si error.message contient "fetch"', () => {
            expect(getAlbionApiErrorMessage({ message: 'fetch failed' }, translateFr))
                .toBe('\u{274C} Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.');
        });

        it('[positif] retourne le message réseau si error.message contient "network"', () => {
            expect(getAlbionApiErrorMessage({ message: 'network error' }, translateFr))
                .toBe('\u{274C} Impossible de contacter l\'API Albion. Vérifiez votre connexion internet.');
        });
    });

    // ─── Erreur générique ─────────────────────────────────────────────────────

    describe('erreur générique', () => {
        it('[positif] retourne le message générique si l\'erreur ne correspond à aucun type connu', () => {
            expect(getAlbionApiErrorMessage({ message: 'unknown crash' }, translateFr))
                .toBe('\u{274C} Une erreur est survenue lors de la communication avec l\'API Albion.');
        });
    });

    // ─── Traduction ───────────────────────────────────────────────────────────

    describe('traduction', () => {
        it('[positif] retourne le message dans la langue du traducteur fourni (en)', () => {
            expect(getAlbionApiErrorMessage({ message: 'Request timeout' }, translateEn))
                .toBe('\u{274C} The Albion API is taking too long to respond. Please try again in a moment.');
        });
    });
});

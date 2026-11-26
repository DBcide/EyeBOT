import { LoggerService } from '@/shared/services/LoggerService';

describe('LoggerService', () => {
    let logger: LoggerService;

    beforeEach(() => {
        logger = new LoggerService();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ─── info() ───────────────────────────────────────────────────────────────

    describe('info()', () => {
        it('[positif] appelle console.log une fois avec [INFO] et le message', () => {
            logger.info('Connexion établie');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Connexion établie'));
        });

        it('[extrême] appelle console.log même si le message est une chaîne vide', () => {
            logger.info('');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
        });
    });

    // ─── success() ────────────────────────────────────────────────────────────

    describe('success()', () => {
        it('[positif] appelle console.log une fois avec [SUCCESS] et le message', () => {
            logger.success('Personnage enregistré');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[SUCCESS]'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Personnage enregistré'));
        });

        it('[extrême] appelle console.log même si le message est une chaîne vide', () => {
            logger.success('');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[SUCCESS]'));
        });
    });

    // ─── warn() ───────────────────────────────────────────────────────────────

    describe('warn()', () => {
        it('[positif] appelle console.warn une fois avec [WARN] et le message', () => {
            logger.warn('Mémoire élevée');

            expect(console.warn).toHaveBeenCalledTimes(1);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Mémoire élevée'));
        });

        it('[extrême] appelle console.warn même si le message est une chaîne vide', () => {
            logger.warn('');

            expect(console.warn).toHaveBeenCalledTimes(1);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
        });
    });

    // ─── error() ──────────────────────────────────────────────────────────────

    describe('error()', () => {
        it('[positif] appelle console.error une fois si aucune erreur n\'est fournie', () => {
            logger.error('Opération échouée');

            expect(console.error).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Opération échouée'));
        });

        it('[positif] appelle console.error deux fois et affiche la stack si une Error est fournie', () => {
            const err = new Error('crash inattendu');
            logger.error('Opération échouée', err);

            expect(console.error).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenNthCalledWith(1, expect.stringContaining('[ERROR]'));
            expect(console.error).toHaveBeenNthCalledWith(2, expect.stringContaining(err.stack!));
        });

        it('[positif] appelle console.error deux fois et affiche le JSON si un objet plain est fourni', () => {
            const payload = { code: 503, reason: 'timeout' };
            logger.error('Opération échouée', payload);

            expect(console.error).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenNthCalledWith(1, expect.stringContaining('[ERROR]'));
            expect(console.error).toHaveBeenNthCalledWith(2, expect.stringContaining(JSON.stringify(payload, null, 2)));
        });

        it('[extrême] appelle console.error une seule fois si error est null (valeur falsy)', () => {
            logger.error('Opération échouée', null);

            expect(console.error).toHaveBeenCalledTimes(1);
        });

        it('[extrême] appelle console.error une seule fois si error est une chaîne vide (valeur falsy)', () => {
            logger.error('Opération échouée', '');

            expect(console.error).toHaveBeenCalledTimes(1);
        });

        it('[extrême] appelle console.error une seule fois si error est 0 (valeur falsy)', () => {
            logger.error('Opération échouée', 0);

            expect(console.error).toHaveBeenCalledTimes(1);
        });
    });

    // ─── debug() ──────────────────────────────────────────────────────────────

    describe('debug()', () => {
        it('[positif] appelle console.log une fois en mode développement', () => {
            delete process.env.NODE_ENV;

            logger.debug('Appel API: /search');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Appel API: /search'));
        });

        it('[positif] appelle console.log deux fois si des données sont fournies', () => {
            delete process.env.NODE_ENV;
            const data = { players: 3, guild: 'Sunfall' };

            logger.debug('Résultats', data);

            expect(console.log).toHaveBeenCalledTimes(2);
            expect(console.log).toHaveBeenNthCalledWith(2, expect.stringContaining(JSON.stringify(data, null, 2)));
        });

        it('[extrême] n\'appelle pas console.log en mode production', () => {
            process.env.NODE_ENV = 'production';

            logger.debug('Ce message ne doit pas apparaître');

            expect(console.log).not.toHaveBeenCalled();

            delete process.env.NODE_ENV;
        });

        it('[extrême] appelle console.log une seule fois si data est null (valeur falsy)', () => {
            delete process.env.NODE_ENV;

            logger.debug('Message', null);

            expect(console.log).toHaveBeenCalledTimes(1);
        });

        it('[extrême] appelle console.log une seule fois si data est 0 (valeur falsy)', () => {
            delete process.env.NODE_ENV;

            logger.debug('Message', 0);

            expect(console.log).toHaveBeenCalledTimes(1);
        });
    });

    // ─── raw() ────────────────────────────────────────────────────────────────

    describe('raw()', () => {
        it('[positif] appelle console.log avec le message brut, sans formatage [LEVEL]', () => {
            logger.raw('=== Démarrage du bot ===');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith('=== Démarrage du bot ===');
            expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
        });

        it('[extrême] appelle console.log avec une chaîne vide sans erreur', () => {
            logger.raw('');

            expect(console.log).toHaveBeenCalledTimes(1);
            expect(console.log).toHaveBeenCalledWith('');
        });
    });
});

import { DatabaseService } from '@/shared/services/DatabaseService';

// Mock mysql2/promise pour éviter de vraies connexions BDD.
// createPool() est appelé dans le constructeur de DatabaseService,
// donc le mock doit être déclaré avant tout import de la classe.
jest.mock('mysql2/promise', () => {
    const mockPool = {
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn(),
    };
    return {
        createPool: jest.fn(() => mockPool),
    };
});

describe('DatabaseService', () => {
    let db: DatabaseService;
    let mockPool: {
        execute: jest.Mock;
        getConnection: jest.Mock;
        end: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mockPool = require('mysql2/promise').createPool();
        db = new DatabaseService();
    });

    // ─── select() ─────────────────────────────────────────────────────────────

    describe('select()', () => {
        it('[positif] retourne un tableau de résultats', async () => {
            const rows = [{ id: 1, name: 'DBcide' }, { id: 2, name: 'Sunfall' }];
            mockPool.execute.mockResolvedValue([rows]);

            const result = await db.select('SELECT * FROM tracer_users');

            expect(result).toEqual(rows);
        });

        it('[extrême] retourne un tableau vide si aucune ligne', async () => {
            mockPool.execute.mockResolvedValue([[]]);

            const result = await db.select('SELECT * FROM tracer_users WHERE discord_id = ?', ['999']);

            expect(result).toEqual([]);
        });

        it('[extrême] propage l\'erreur si pool.execute lance une exception', async () => {
            const dbError = new Error('Table inexistante');
            mockPool.execute.mockRejectedValue(dbError);

            await expect(db.select('SELECT * FROM inexistant')).rejects.toThrow('Table inexistante');
        });
    });

    // ─── selectOne() ──────────────────────────────────────────────────────────

    describe('selectOne()', () => {
        it('[positif] retourne le premier élément si des lignes existent', async () => {
            const rows = [{ id: 1, albion_name: 'DBcide' }, { id: 2, albion_name: 'Other' }];
            mockPool.execute.mockResolvedValue([rows]);

            const result = await db.selectOne('SELECT * FROM tracer_users WHERE discord_id = ?', ['123']);

            expect(result).toEqual({ id: 1, albion_name: 'DBcide' });
        });

        it('[extrême] retourne null si le tableau est vide', async () => {
            mockPool.execute.mockResolvedValue([[]]);

            const result = await db.selectOne('SELECT * FROM tracer_users WHERE discord_id = ?', ['999']);

            expect(result).toBeNull();
        });

        it('[extrême] propage l\'erreur si pool.execute lance une exception', async () => {
            const dbError = new Error('Connexion perdue');
            mockPool.execute.mockRejectedValue(dbError);

            await expect(db.selectOne('SELECT * FROM tracer_users')).rejects.toThrow('Connexion perdue');
        });
    });

    // ─── insert() ─────────────────────────────────────────────────────────────

    describe('insert()', () => {
        it('[positif] retourne l\'insertId de la ligne insérée', async () => {
            mockPool.execute.mockResolvedValue([{ insertId: 42 }]);

            const id = await db.insert('INSERT INTO tracer_users (discord_id) VALUES (?)', ['123']);

            expect(id).toBe(42);
        });

        it('[extrême] propage l\'erreur si pool.execute lance une exception', async () => {
            const dbError = new Error('Duplicate entry');
            mockPool.execute.mockRejectedValue(dbError);

            await expect(
                db.insert('INSERT INTO tracer_users (discord_id) VALUES (?)', ['123'])
            ).rejects.toThrow('Duplicate entry');
        });
    });

    // ─── execute() ────────────────────────────────────────────────────────────

    describe('execute()', () => {
        it('[positif] retourne le nombre de lignes affectées', async () => {
            mockPool.execute.mockResolvedValue([{ affectedRows: 3 }]);

            const affected = await db.execute('UPDATE tracer_users SET is_verified = 1 WHERE discord_id = ?', ['123']);

            expect(affected).toBe(3);
        });

        it('[extrême] retourne 0 si aucune ligne n\'est affectée', async () => {
            mockPool.execute.mockResolvedValue([{ affectedRows: 0 }]);

            const affected = await db.execute('UPDATE tracer_users SET is_verified = 1 WHERE discord_id = ?', ['999']);

            expect(affected).toBe(0);
        });

        it('[extrême] propage l\'erreur si pool.execute lance une exception', async () => {
            const dbError = new Error('Lock wait timeout');
            mockPool.execute.mockRejectedValue(dbError);

            await expect(
                db.execute('DELETE FROM tracer_users WHERE discord_id = ?', ['123'])
            ).rejects.toThrow('Lock wait timeout');
        });
    });

    // ─── testConnection() ─────────────────────────────────────────────────────

    describe('testConnection()', () => {
        it('[positif] marque isConnected à true si la connexion réussit', async () => {
            const mockConnection = { ping: jest.fn().mockResolvedValue(undefined), release: jest.fn() };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            await db.testConnection();

            expect(db.isConnectionActive()).toBe(true);
        });

        it('[positif] appelle ping() puis release() sur la connexion', async () => {
            const mockConnection = { ping: jest.fn().mockResolvedValue(undefined), release: jest.fn() };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            await db.testConnection();

            expect(mockConnection.ping).toHaveBeenCalledTimes(1);
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });

        it('[extrême] marque isConnected à false et propage l\'erreur si la connexion échoue', async () => {
            const dbError = new Error('ECONNREFUSED');
            mockPool.getConnection.mockRejectedValue(dbError);

            await expect(db.testConnection()).rejects.toThrow('ECONNREFUSED');
            expect(db.isConnectionActive()).toBe(false);
        });

        it('[extrême] libère la connexion même si ping() échoue', async () => {
            const mockConnection = { ping: jest.fn().mockRejectedValue(new Error('ping KO')), release: jest.fn() };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            await expect(db.testConnection()).rejects.toThrow('ping KO');
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });

        it('[extrême] retente la connexion au prochain appel après un échec (pas de promesse en échec mémorisée)', async () => {
            const mockConnection = { ping: jest.fn().mockResolvedValue(undefined), release: jest.fn() };
            mockPool.getConnection
                .mockRejectedValueOnce(new Error('ECONNREFUSED'))
                .mockResolvedValueOnce(mockConnection);

            await expect(db.testConnection()).rejects.toThrow('ECONNREFUSED');
            await expect(db.testConnection()).resolves.toBeUndefined();
            expect(db.isConnectionActive()).toBe(true);
        });

        it('[extrême] ne rappelle pas getConnection si testConnection est déjà en cours (promise partagée)', async () => {
            const mockConnection = { ping: jest.fn().mockResolvedValue(undefined), release: jest.fn() };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            await Promise.all([db.testConnection(), db.testConnection(), db.testConnection()]);

            expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
        });
    });

    // ─── isConnectionActive() ─────────────────────────────────────────────────

    describe('isConnectionActive()', () => {
        it('[positif] retourne false avant tout appel à testConnection()', () => {
            expect(db.isConnectionActive()).toBe(false);
        });

        it('[positif] retourne true après un testConnection() réussi', async () => {
            const mockConnection = { ping: jest.fn().mockResolvedValue(undefined), release: jest.fn() };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            await db.testConnection();

            expect(db.isConnectionActive()).toBe(true);
        });
    });

    // ─── beginTransaction() ───────────────────────────────────────────────────

    describe('beginTransaction()', () => {
        it('[positif] retourne la connexion après avoir démarré une transaction', async () => {
            const mockConnection = {
                beginTransaction: jest.fn().mockResolvedValue(undefined),
                release: jest.fn(),
            };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            const connection = await db.beginTransaction();

            expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
            expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
            expect(connection).toBe(mockConnection);
        });

        it('[extrême] libère la connexion si la transaction ne peut pas démarrer', async () => {
            const mockConnection = {
                beginTransaction: jest.fn().mockRejectedValue(new Error('Lock')),
                release: jest.fn(),
            };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            await expect(db.beginTransaction()).rejects.toThrow('Lock');
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });
    });

    // ─── commit() ─────────────────────────────────────────────────────────────

    describe('commit()', () => {
        it('[positif] commit la transaction et libère la connexion', async () => {
            const mockConnection = {
                commit: jest.fn().mockResolvedValue(undefined),
                release: jest.fn(),
            };

            await db.commit(mockConnection as any);

            expect(mockConnection.commit).toHaveBeenCalledTimes(1);
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });

        it('[extrême] libère la connexion même si le commit échoue (sinon le pool se vide)', async () => {
            const mockConnection = { commit: jest.fn().mockRejectedValue(new Error('Deadlock')), release: jest.fn() };

            await expect(db.commit(mockConnection as any)).rejects.toThrow('Deadlock');
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });
    });

    // ─── rollback() ───────────────────────────────────────────────────────────

    describe('rollback()', () => {
        it('[positif] rollback la transaction et libère la connexion', async () => {
            const mockConnection = {
                rollback: jest.fn().mockResolvedValue(undefined),
                release: jest.fn(),
            };

            await db.rollback(mockConnection as any);

            expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });

        it('[extrême] libère la connexion même si le rollback échoue', async () => {
            const mockConnection = { rollback: jest.fn().mockRejectedValue(new Error('Connexion perdue')), release: jest.fn() };

            await expect(db.rollback(mockConnection as any)).rejects.toThrow('Connexion perdue');
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Erreurs SQL ──────────────────────────────────────────────────────────

    describe('erreurs SQL', () => {
        it('[positif] rattache la requête (sur une ligne) à l\'erreur pour le log unique de l\'appelant', async () => {
            mockPool.execute.mockRejectedValue(new Error('Table inexistante'));

            const error = await db.select('SELECT *\n            FROM inconnue  WHERE id = ?', [1]).catch(e => e);

            expect(error.sql).toBe('SELECT * FROM inconnue WHERE id = ?');
        });

        it('[extrême] conserve le SQL déjà fourni par mysql2', async () => {
            mockPool.execute.mockRejectedValue(Object.assign(new Error('Syntax'), { sql: 'SQL de mysql2' }));

            const error = await db.select('SELECT 1').catch(e => e);

            expect(error.sql).toBe('SQL de mysql2');
        });

        it('[extrême] complète une propriété sql présente mais vide (erreurs de connexion mysql2)', async () => {
            mockPool.execute.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { sql: undefined }));

            const error = await db.select('SELECT 1').catch(e => e);

            expect(error.sql).toBe('SELECT 1');
        });
    });

    // ─── close() ──────────────────────────────────────────────────────────────

    describe('close()', () => {
        it('[positif] appelle pool.end() pour fermer le pool de connexions', async () => {
            mockPool.end.mockResolvedValue(undefined);

            await db.close();

            expect(mockPool.end).toHaveBeenCalledTimes(1);
        });

        it('[extrême] ne propage pas l\'erreur si pool.end() échoue (catch silencieux)', async () => {
            mockPool.end.mockRejectedValue(new Error('Déjà fermé'));

            await expect(db.close()).resolves.not.toThrow();
        });

        it('[positif] isClosed() passe à true et la connexion n\'est plus active', async () => {
            mockPool.end.mockResolvedValue(undefined);
            expect(db.isClosed()).toBe(false);

            await db.close();

            expect(db.isClosed()).toBe(true);
            expect(db.isConnectionActive()).toBe(false);
        });

        it('[extrême] un second close() ne rappelle pas pool.end()', async () => {
            mockPool.end.mockResolvedValue(undefined);

            await db.close();
            await db.close();

            expect(mockPool.end).toHaveBeenCalledTimes(1);
        });
    });
});

import { DatabaseLoggingService } from '@/shared/services/DatabaseLoggingService';
import { DatabaseService } from '@/shared/services/DatabaseService';

describe('DatabaseLoggingService', () => {
    let service: DatabaseLoggingService;
    let mockDb: jest.Mocked<Pick<DatabaseService, 'execute' | 'select'>>;

    beforeEach(() => {
        mockDb = {
            execute: jest.fn().mockResolvedValue(1),
            select: jest.fn().mockResolvedValue([]),
        };
        service = new DatabaseLoggingService(mockDb as unknown as DatabaseService);

        // Le service logue ses propres échecs en console : on garde la sortie de test propre
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ─── logCommand() ─────────────────────────────────────────────────────────

    describe('logCommand()', () => {
        it('[positif] insère la commande avec ses options sérialisées en JSON', async () => {
            await service.logCommand({
                userId: 'u1',
                guildId: 'g1',
                commandName: 'register',
                commandOptions: { pseudo: 'DBcide' },
                albionCharacterId: 'player-abc',
                status: 'success',
            });

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO command_logs'),
                ['u1', 'g1', 'register', '{"pseudo":"DBcide"}', 'player-abc', 'success', null]
            );
        });

        it('[extrême] remplace les champs optionnels absents par NULL', async () => {
            await service.logCommand({
                userId: 'u1',
                guildId: null,
                commandName: 'update',
                status: 'error',
                errorMessage: 'boom',
            });

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.any(String),
                ['u1', null, 'update', null, null, 'error', 'boom']
            );
        });

        it('[extrême] ne propage jamais une erreur de base (le log est perdu, pas la commande)', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.logCommand({
                userId: 'u1', guildId: null, commandName: 'update', status: 'success',
            })).resolves.toBeUndefined();
            expect(console.error).toHaveBeenCalled();
        });
    });

    // ─── logSystem() ──────────────────────────────────────────────────────────

    describe('logSystem()', () => {
        it('[positif] insère le log système avec son contexte JSON', async () => {
            await service.logSystem({ level: 'warn', category: 'monitoring', message: 'CPU élevé', context: { cpu: 91 } });

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO system_logs'),
                ['warn', 'monitoring', 'CPU élevé', '{"cpu":91}']
            );
        });

        it('[extrême] contexte absent → NULL', async () => {
            await service.logSystem({ level: 'info', category: 'startup', message: 'Démarrage' });

            expect(mockDb.execute).toHaveBeenCalledWith(expect.any(String), ['info', 'startup', 'Démarrage', null]);
        });

        it('[extrême] ne propage jamais une erreur de base', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.logSystem({ level: 'info', category: 'c', message: 'm' })).resolves.toBeUndefined();
        });
    });

    // ─── logEvent() ───────────────────────────────────────────────────────────

    describe('logEvent()', () => {
        it('[positif] insère l\'événement Discord avec ses détails JSON', async () => {
            await service.logEvent({ eventType: 'guild_create', guildId: 'g1', details: { guildName: 'Sunfall' } });

            expect(mockDb.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO event_logs'),
                ['guild_create', null, 'g1', '{"guildName":"Sunfall"}']
            );
        });

        it('[extrême] champs optionnels absents → NULL', async () => {
            await service.logEvent({ eventType: 'member_add', userId: 'u1' });

            expect(mockDb.execute).toHaveBeenCalledWith(expect.any(String), ['member_add', 'u1', null, null]);
        });

        it('[extrême] ne propage jamais une erreur de base', async () => {
            mockDb.execute.mockRejectedValue(new Error('DB down'));

            await expect(service.logEvent({ eventType: 'guild_delete' })).resolves.toBeUndefined();
        });
    });

    // ─── Lecture des logs récents ─────────────────────────────────────────────

    describe('getRecent*Logs()', () => {
        it.each([
            ['getRecentCommandLogs', 'command_logs', 'executed_at'],
            ['getRecentSystemLogs', 'system_logs', 'created_at'],
            ['getRecentEventLogs', 'event_logs', 'created_at'],
        ] as const)('[positif] %s lit %s triés par %s décroissant', async (method, table, column) => {
            const rows = [{ id: 1 }];
            mockDb.select.mockResolvedValue(rows);

            const result = await service[method](25);

            expect(result).toBe(rows);
            const sql = mockDb.select.mock.calls[0][0];
            expect(sql).toContain(`FROM ${table}`);
            expect(sql).toContain(`ORDER BY ${column} DESC`);
            expect(sql).toContain('LIMIT 25');
        });

        it('[positif] limite par défaut de 100', async () => {
            await service.getRecentCommandLogs();

            expect(mockDb.select.mock.calls[0][0]).toContain('LIMIT 100');
        });

        // LIMIT est injecté dans la requête (mysql2 refuse "LIMIT ?" en requête préparée) :
        // la valeur doit donc toujours être un entier positif, jamais du texte arbitraire
        it.each([
            [25.9, 'LIMIT 25'],
            [0, 'LIMIT 100'],
            [-5, 'LIMIT 100'],
            [Number.NaN, 'LIMIT 100'],
            ['1; DROP TABLE command_logs' as unknown as number, 'LIMIT 100'],
        ])('[extrême] limite %p → %s', async (limit, expected) => {
            await service.getRecentSystemLogs(limit);

            const sql: string = mockDb.select.mock.calls[0][0];
            expect(sql).toContain(expected);
            expect(sql).not.toContain('DROP');
        });
    });

    // ─── getCommandStats() ────────────────────────────────────────────────────

    describe('getCommandStats()', () => {
        it('[positif] agrège par commande sur la période demandée', async () => {
            const stats = [{ command_name: 'register', total_executions: 3 }];
            mockDb.select.mockResolvedValue(stats);

            const result = await service.getCommandStats(30);

            expect(result).toBe(stats);
            expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining('GROUP BY command_name'), [30]);
        });

        it('[positif] période par défaut de 7 jours', async () => {
            await service.getCommandStats();

            expect(mockDb.select).toHaveBeenCalledWith(expect.any(String), [7]);
        });
    });

    // ─── cleanOldLogs() ───────────────────────────────────────────────────────

    describe('cleanOldLogs()', () => {
        it('[positif] purge les 3 tables avec leur colonne de date respective', async () => {
            await service.cleanOldLogs(60);

            expect(mockDb.execute).toHaveBeenCalledTimes(3);
            expect(mockDb.execute).toHaveBeenNthCalledWith(1, expect.stringMatching(/DELETE FROM command_logs\s+WHERE executed_at/), [60]);
            expect(mockDb.execute).toHaveBeenNthCalledWith(2, expect.stringMatching(/DELETE FROM system_logs\s+WHERE created_at/), [60]);
            expect(mockDb.execute).toHaveBeenNthCalledWith(3, expect.stringMatching(/DELETE FROM event_logs\s+WHERE created_at/), [60]);
        });

        it('[positif] conserve 90 jours par défaut', async () => {
            await service.cleanOldLogs();

            expect(mockDb.execute).toHaveBeenCalledWith(expect.any(String), [90]);
        });

        it('[extrême] s\'arrête sans propager l\'erreur si une suppression échoue', async () => {
            mockDb.execute.mockRejectedValueOnce(new Error('Lock wait timeout'));

            await expect(service.cleanOldLogs()).resolves.toBeUndefined();
            expect(mockDb.execute).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalled();
        });
    });
});

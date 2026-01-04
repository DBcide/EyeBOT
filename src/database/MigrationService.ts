import { DatabaseService } from '../shared/services/DatabaseService';
import { LoggerService } from '../shared/services/LoggerService';
import { Migration } from './Migration';
import mysql from 'mysql2/promise';

/**
 * Service de gestion des migrations de base de données
 */
export class MigrationService {
    private db: DatabaseService;
    private logger: LoggerService;

    constructor() {
        this.db = new DatabaseService();
        this.logger = new LoggerService();
    }

    /**
     * Crée la table de suivi des migrations si elle n'existe pas
     */
    private async ensureMigrationsTable(): Promise<void> {
        const sql = `
            CREATE TABLE IF NOT EXISTS migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await this.db.query(sql);
        this.logger.debug('Table migrations vérifiée/créée');
    }

    /**
     * Vérifie si une migration a déjà été exécutée
     */
    private async isMigrationExecuted(name: string): Promise<boolean> {
        const result = await this.db.selectOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM migrations WHERE name = ?',
            [name]
        );
        return (result?.count || 0) > 0;
    }

    /**
     * Enregistre une migration comme exécutée
     */
    private async recordMigration(name: string): Promise<void> {
        await this.db.insert(
            'INSERT INTO migrations (name) VALUES (?)',
            [name]
        );
    }

    /**
     * Supprime l'enregistrement d'une migration
     */
    private async removeMigration(name: string): Promise<void> {
        await this.db.execute(
            'DELETE FROM migrations WHERE name = ?',
            [name]
        );
    }

    /**
     * Exécute toutes les migrations en attente
     */
    public async runMigrations(migrations: Migration[]): Promise<void> {
        await this.db.testConnection();
        await this.ensureMigrationsTable();

        this.logger.info(`📊 Vérification de ${migrations.length} migration(s)...`);

        let executedCount = 0;

        for (const migration of migrations) {
            if (await this.isMigrationExecuted(migration.name)) {
                this.logger.debug(`⏭️  Migration déjà exécutée: ${migration.name}`);
                continue;
            }

            this.logger.info(`🔄 Exécution de la migration: ${migration.name}`);

            const connection = await this.db.beginTransaction();

            try {
                await migration.up(connection);
                await this.recordMigration(migration.name);
                await this.db.commit(connection);

                this.logger.success(`✅ Migration réussie: ${migration.name}`);
                executedCount++;
            } catch (error) {
                await this.db.rollback(connection);
                this.logger.error(`❌ Échec de la migration: ${migration.name}`, error);
                throw error;
            }
        }

        if (executedCount === 0) {
            this.logger.info('✅ Toutes les migrations sont à jour');
        } else {
            this.logger.success(`✅ ${executedCount} migration(s) exécutée(s) avec succès`);
        }
    }

    /**
     * Annule la dernière migration exécutée
     */
    public async rollbackLastMigration(migrations: Migration[]): Promise<void> {
        await this.db.testConnection();
        await this.ensureMigrationsTable();

        // Récupérer la dernière migration exécutée
        const lastMigration = await this.db.selectOne<{ name: string }>(
            'SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1'
        );

        if (!lastMigration) {
            this.logger.warn('⚠️  Aucune migration à annuler');
            return;
        }

        const migration = migrations.find(m => m.name === lastMigration.name);

        if (!migration) {
            this.logger.error(`❌ Migration introuvable: ${lastMigration.name}`);
            throw new Error(`Migration introuvable: ${lastMigration.name}`);
        }

        this.logger.info(`🔄 Annulation de la migration: ${migration.name}`);

        const connection = await this.db.beginTransaction();

        try {
            await migration.down(connection);
            await this.removeMigration(migration.name);
            await this.db.commit(connection);

            this.logger.success(`✅ Migration annulée: ${migration.name}`);
        } catch (error) {
            await this.db.rollback(connection);
            this.logger.error(`❌ Échec de l'annulation: ${migration.name}`, error);
            throw error;
        }
    }

    /**
     * Liste toutes les migrations exécutées
     */
    public async listExecutedMigrations(): Promise<void> {
        await this.db.testConnection();
        await this.ensureMigrationsTable();

        const migrations = await this.db.select<{ name: string; executed_at: Date }>(
            'SELECT name, executed_at FROM migrations ORDER BY executed_at ASC'
        );

        if (migrations.length === 0) {
            this.logger.info('Aucune migration exécutée');
            return;
        }

        this.logger.info(`📊 Migrations exécutées (${migrations.length}):`);
        migrations.forEach((m, i) => {
            this.logger.info(`   ${i + 1}. ${m.name} - ${m.executed_at}`);
        });
    }
}
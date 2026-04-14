import { DatabaseService } from '../shared/services/DatabaseService';
import { LoggerService } from '../shared/services/LoggerService';
import { Migration } from './Migration';
import mysql from 'mysql2/promise';

/**
 * Service de gestion des migrations de base de données avec tracking et rollback
 *
 * @remarks
 * Implémente un système de migration custom (sans ORM) pour gérer l'évolution du schéma DB.
 *
 * **Fonctionnalités**:
 * - Suivi des migrations exécutées dans la table `migrations`
 * - Exécution séquentielle des migrations en attente
 * - Rollback de la dernière migration exécutée
 * - Support des transactions (commit/rollback automatique)
 * - Listing des migrations avec dates d'exécution
 *
 * **Table de tracking**:
 * ```sql
 * CREATE TABLE migrations (
 *   id INT AUTO_INCREMENT PRIMARY KEY,
 *   name VARCHAR(255) NOT NULL UNIQUE,
 *   executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   INDEX idx_name (name)
 * );
 * ```
 *
 * **Format des migrations**:
 * - Fichiers: `src/database/migrations/YYYYMMDD_HHMMSS_description.ts`
 * - Ordre: Déterminé par le tableau dans `src/database/migrations/index.ts`
 * - Chaque migration exporte un objet avec: `name`, `up(connection)`, `down(connection)`
 *
 * **Sécurité**:
 * - Chaque migration s'exécute dans une transaction isolée
 * - En cas d'erreur: rollback automatique + arrêt du processus
 * - Pas d'exécution partielle: tout ou rien par migration
 *
 * **Cas d'usage**:
 * - `npm run migrate`: Exécute toutes les migrations en attente
 * - `npm run migrate:rollback`: Annule la dernière migration
 * - `npm run migrate:list`: Liste toutes les migrations exécutées
 *
 * @see Migration - Interface définissant le contrat d'une migration
 * @see src/database/migrations/index.ts - Liste ordonnée des migrations
 */
export class MigrationService {
    private db: DatabaseService;
    private logger: LoggerService;

    /**
     * Crée une instance du service de migrations
     *
     * @remarks
     * Initialise ses propres instances de DatabaseService et LoggerService.
     * Ces instances sont indépendantes de ServiceContainer (isolation).
     */
    constructor() {
        this.db = new DatabaseService();
        this.logger = new LoggerService();
    }

    /**
     * Crée la table `migrations` si elle n'existe pas déjà
     *
     * @returns Promise qui se résout après création/vérification de la table
     *
     * @remarks
     * Cette table sert à tracker quelles migrations ont été exécutées.
     *
     * **Schéma**:
     * - id: Clé primaire auto-incrémentée
     * - name: Nom unique de la migration (ex: "20260326_000001_create_users_table")
     * - executed_at: Timestamp d'exécution (CURRENT_TIMESTAMP par défaut)
     * - INDEX sur name pour les lookups rapides
     *
     * **Charset**: utf8mb4_unicode_ci pour supporter les emojis et caractères spéciaux
     * **Engine**: InnoDB pour le support des transactions et contraintes
     *
     * Appelée automatiquement avant chaque opération de migration.
     * Idempotente: Peut être appelée plusieurs fois sans effet de bord (CREATE IF NOT EXISTS).
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
        this.logger.debug('Table migrations vérifiée/créée', 'database');
    }

    /**
     * Vérifie si une migration a déjà été exécutée
     *
     * @param name - Nom de la migration à vérifier
     * @returns true si la migration a déjà été exécutée, false sinon
     *
     * @remarks
     * Effectue un COUNT(*) sur la table `migrations` avec le nom de la migration.
     * Utilisé par runMigrations() pour sauter les migrations déjà exécutées.
     *
     * Une migration est considérée exécutée si son nom existe dans la table `migrations`.
     */
    private async isMigrationExecuted(name: string): Promise<boolean> {
        const result = await this.db.selectOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM migrations WHERE name = ?',
            [name]
        );
        return (result?.count || 0) > 0;
    }

    /**
     * Enregistre une migration comme exécutée dans la table de tracking
     *
     * @param name - Nom de la migration exécutée
     * @returns Promise qui se résout après insertion
     *
     * @remarks
     * Insère un enregistrement dans la table `migrations` avec le nom et timestamp actuel.
     * Appelée automatiquement après le succès d'une migration (avant commit).
     *
     * Si le nom existe déjà (contrainte UNIQUE), lève une erreur MySQL.
     * Cette erreur provoque un rollback de la transaction en cours.
     */
    private async recordMigration(name: string): Promise<void> {
        await this.db.insert(
            'INSERT INTO migrations (name) VALUES (?)',
            [name]
        );
    }

    /**
     * Supprime l'enregistrement d'une migration de la table de tracking
     *
     * @param name - Nom de la migration à supprimer
     * @returns Promise qui se résout après suppression
     *
     * @remarks
     * Supprime l'enregistrement de la table `migrations` pour permettre une ré-exécution.
     * Appelée automatiquement après le succès d'un rollback (avant commit).
     *
     * Si le nom n'existe pas, la requête s'exécute quand même sans erreur (DELETE silencieux).
     */
    private async removeMigration(name: string): Promise<void> {
        await this.db.execute(
            'DELETE FROM migrations WHERE name = ?',
            [name]
        );
    }

    /**
     * Exécute toutes les migrations en attente de manière séquentielle
     *
     * @param migrations - Tableau ordonné des migrations à exécuter
     * @returns Promise qui se résout après exécution de toutes les migrations en attente
     * @throws Error si une migration échoue (l'erreur de la migration est propagée)
     *
     * @remarks
     * **Flux d'exécution**:
     * 1. Test de connexion DB (testConnection)
     * 2. Vérification/création de la table migrations (ensureMigrationsTable)
     * 3. Pour chaque migration du tableau:
     *    - Vérifier si déjà exécutée (isMigrationExecuted)
     *    - Si oui: Skip avec log debug
     *    - Si non: Exécuter dans une transaction isolée
     *
     * **Gestion des transactions**:
     * - Chaque migration s'exécute dans sa propre transaction (isolation)
     * - En cas de succès: commit + enregistrement dans migrations
     * - En cas d'erreur: rollback automatique + arrêt du processus
     *
     * **Principe de sécurité**:
     * - Pas d'exécution partielle: Tout ou rien par migration
     * - Une erreur stoppe immédiatement le processus (pas de cascade)
     * - Les migrations précédentes restent committées (pas de rollback global)
     *
     * **Logging**:
     * - Info: Nombre de migrations à vérifier
     * - Debug: Migrations déjà exécutées (skipped)
     * - Info: Début d'exécution de chaque migration
     * - Success: Fin d'exécution réussie
     * - Error: Échec avec détails (puis throw)
     * - Summary: Nombre de migrations exécutées ou "à jour"
     *
     * **Métriques de succès**:
     * - executedCount = 0: "Toutes les migrations sont à jour"
     * - executedCount > 0: "X migration(s) exécutée(s) avec succès"
     *
     * @example
     * ```typescript
     * import { migrations } from './migrations';
     * const migrationService = new MigrationService();
     * await migrationService.runMigrations(migrations);
     * // Toutes les migrations en attente sont exécutées
     * ```
     */
    public async runMigrations(migrations: Migration[]): Promise<void> {
        await this.db.testConnection();
        await this.ensureMigrationsTable();

        this.logger.info(`📊 Vérification de ${migrations.length} migration(s)...`, 'database');

        let executedCount = 0;

        for (const migration of migrations) {
            if (await this.isMigrationExecuted(migration.name)) {
                this.logger.debug(`⏭️  Migration déjà exécutée: ${migration.name}`, 'database');
                continue;
            }

            this.logger.info(`🔄 Exécution de la migration: ${migration.name}`, 'database');

            const connection = await this.db.beginTransaction();

            try {
                await migration.up(connection);
                await this.recordMigration(migration.name);
                await this.db.commit(connection);

                this.logger.success(`✅ Migration réussie: ${migration.name}`, 'database');
                executedCount++;
            } catch (error) {
                await this.db.rollback(connection);
                this.logger.error(`❌ Échec de la migration: ${migration.name}`, 'database', error);
                throw error;
            }
        }

        if (executedCount === 0) {
            this.logger.info('✅ Toutes les migrations sont à jour', 'database');
        } else {
            this.logger.success(`✅ ${executedCount} migration(s) exécutée(s) avec succès`, 'database');
        }
    }

    /**
     * Annule la dernière migration exécutée (rollback)
     *
     * @param migrations - Tableau de migrations pour retrouver la méthode down() correspondante
     * @returns Promise qui se résout après rollback réussi ou si aucune migration à annuler
     * @throws Error si la migration est introuvable dans le tableau ou si le rollback échoue
     *
     * @remarks
     * **Flux d'exécution**:
     * 1. Test de connexion DB (testConnection)
     * 2. Vérification/création de la table migrations (ensureMigrationsTable)
     * 3. Récupération de la dernière migration exécutée (ORDER BY executed_at DESC LIMIT 1)
     * 4. Recherche de l'objet Migration correspondant dans le tableau
     * 5. Exécution de la méthode down() dans une transaction
     * 6. Suppression de l'enregistrement dans la table migrations
     *
     * **Cas particuliers**:
     * - Si aucune migration exécutée: Log warning + return (pas d'erreur)
     * - Si migration introuvable dans le tableau: Throw error (migration supprimée du code?)
     *
     * **Gestion des transactions**:
     * - Le rollback s'exécute dans une transaction isolée
     * - En cas de succès: commit + suppression de l'enregistrement
     * - En cas d'erreur: rollback + throw (état DB inchangé)
     *
     * **Principe de sécurité**:
     * - Une seule migration à la fois (pas de rollback en masse)
     * - Tout ou rien: Si down() échoue, l'enregistrement reste en place
     * - Permet de réessayer le rollback après correction de down()
     *
     * **Logging**:
     * - Info: Annulation en cours avec nom de la migration
     * - Success: Rollback réussi
     * - Warn: Aucune migration à annuler
     * - Error: Migration introuvable ou échec du rollback (puis throw)
     *
     * **Utilisation typique**:
     * - Après avoir découvert un bug dans une migration
     * - Pour revenir à l'état précédent avant re-migration corrigée
     * - Opération manuelle (npm run migrate:rollback)
     *
     * @example
     * ```typescript
     * import { migrations } from './migrations';
     * const migrationService = new MigrationService();
     * await migrationService.rollbackLastMigration(migrations);
     * // La dernière migration est annulée et peut être ré-exécutée
     * ```
     */
    public async rollbackLastMigration(migrations: Migration[]): Promise<void> {
        await this.db.testConnection();
        await this.ensureMigrationsTable();

        // Récupérer la dernière migration exécutée
        const lastMigration = await this.db.selectOne<{ name: string }>(
            'SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1'
        );

        if (!lastMigration) {
            this.logger.warn('⚠️  Aucune migration à annuler', 'database');
            return;
        }

        const migration = migrations.find(m => m.name === lastMigration.name);

        if (!migration) {
            this.logger.error(`❌ Migration introuvable: ${lastMigration.name}`, 'database');
            throw new Error(`Migration introuvable: ${lastMigration.name}`);
        }

        this.logger.info(`🔄 Annulation de la migration: ${migration.name}`, 'database');

        const connection = await this.db.beginTransaction();

        try {
            await migration.down(connection);
            await this.removeMigration(migration.name);
            await this.db.commit(connection);

            this.logger.success(`✅ Migration annulée: ${migration.name}`, 'database');
        } catch (error) {
            await this.db.rollback(connection);
            this.logger.error(`❌ Échec de l'annulation: ${migration.name}`, 'database', error);
            throw error;
        }
    }

    /**
     * Liste toutes les migrations exécutées avec leurs dates d'exécution
     *
     * @returns Promise qui se résout après affichage de la liste
     *
     * @remarks
     * **Flux d'exécution**:
     * 1. Test de connexion DB (testConnection)
     * 2. Vérification/création de la table migrations (ensureMigrationsTable)
     * 3. Récupération de toutes les migrations (ORDER BY executed_at ASC)
     * 4. Affichage formaté dans la console via LoggerService
     *
     * **Format d'affichage**:
     * - Si aucune migration: "Aucune migration exécutée"
     * - Si migrations présentes:
     *   ```
     *   📊 Migrations exécutées (X):
     *      1. YYYYMMDD_HHMMSS_description - YYYY-MM-DD HH:MM:SS
     *      2. YYYYMMDD_HHMMSS_description - YYYY-MM-DD HH:MM:SS
     *      ...
     *   ```
     *
     * **Ordre d'affichage**:
     * - Chronologique (ORDER BY executed_at ASC)
     * - Numérotation à partir de 1
     * - Permet de voir l'historique d'évolution du schéma DB
     *
     * **Utilisation typique**:
     * - Vérifier quelles migrations ont été appliquées sur un environnement
     * - Diagnostiquer des problèmes de migration
     * - Audit de l'historique des changements de schéma
     * - Exécuté via: npm run migrate:list
     *
     * **Note**:
     * - Cette méthode n'effectue aucune modification en base
     * - Utilise LoggerService pour l'affichage (pas de console.log direct)
     * - La date affichée est celle enregistrée dans migrations.executed_at
     *
     * @example
     * ```typescript
     * const migrationService = new MigrationService();
     * await migrationService.listExecutedMigrations();
     * // Affiche la liste complète des migrations exécutées
     * ```
     */
    public async listExecutedMigrations(): Promise<void> {
        await this.db.testConnection();
        await this.ensureMigrationsTable();

        const migrations = await this.db.select<{ name: string; executed_at: Date }>(
            'SELECT name, executed_at FROM migrations ORDER BY executed_at ASC'
        );

        if (migrations.length === 0) {
            this.logger.info('Aucune migration exécutée', 'database');
            return;
        }

        this.logger.info(`📊 Migrations exécutées (${migrations.length}):`, 'database');
        migrations.forEach((m, i) => {
            this.logger.info(`   ${i + 1}. ${m.name} - ${m.executed_at}`, 'database');
        });
    }
}
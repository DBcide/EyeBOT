import { MigrationService } from '../database/MigrationService';
import { migrations } from '../database/migrations';
import { LoggerService } from '../shared/services/LoggerService';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const logger = new LoggerService();

async function runMigrations() {
    try {
        logger.info('🚀 Démarrage des migrations...', 'database');

        const migrationService = new MigrationService();

        // Exécuter toutes les migrations en attente
        await migrationService.runMigrations(migrations);

        logger.success('🎉 Migrations terminées avec succès !', 'database');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors de l\'exécution des migrations', 'database', error);
        process.exit(1);
    }
}

// Exécuter le script
runMigrations();

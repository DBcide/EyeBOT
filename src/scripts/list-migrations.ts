// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { MigrationService } from '../database/MigrationService';
import { LoggerService } from '../shared/services/LoggerService';

const logger = new LoggerService();

async function listMigrations() {
    try {
        logger.info('📋 Liste des migrations exécutées...', 'database');

        const migrationService = new MigrationService();

        // Lister toutes les migrations exécutées
        await migrationService.listExecutedMigrations();

        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors de la récupération des migrations', 'database', error);
        process.exit(1);
    }
}

// Exécuter le script
listMigrations();

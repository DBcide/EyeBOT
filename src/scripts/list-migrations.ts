import { MigrationService } from '../database/MigrationService';
import { LoggerService } from '../shared/services/LoggerService';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const logger = new LoggerService();

async function listMigrations() {
    try {
        logger.info('📋 Liste des migrations exécutées...');

        const migrationService = new MigrationService();

        // Lister toutes les migrations exécutées
        await migrationService.listExecutedMigrations();

        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors de la récupération des migrations', error);
        process.exit(1);
    }
}

// Exécuter le script
listMigrations();

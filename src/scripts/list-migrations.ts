// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { MigrationService } from '../database/MigrationService';
import { LoggerService } from '../shared/services/LoggerService';
import { exitGracefully } from '../shared/utils/exitGracefully';

const logger = new LoggerService();

async function listMigrations(): Promise<void> {
    const migrationService = new MigrationService();

    try {
        logger.info('Liste des migrations exécutées...', 'database');
        await migrationService.listExecutedMigrations();
        await exitGracefully(0, () => migrationService.close());
    } catch (error) {
        logger.error('Erreur lors de la récupération des migrations', 'database', error);
        await exitGracefully(1, () => migrationService.close());
    }
}

void listMigrations();

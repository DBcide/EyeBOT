// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { MigrationService } from '../database/MigrationService';
import { migrations } from '../database/migrations';
import { LoggerService } from '../shared/services/LoggerService';
import { exitGracefully } from '../shared/utils/exitGracefully';

const logger = new LoggerService();

async function rollbackMigration(): Promise<void> {
    const migrationService = new MigrationService();

    try {
        logger.info('Annulation de la dernière migration...', 'database');
        await migrationService.rollbackLastMigration(migrations);
        logger.success('Rollback terminé avec succès !', 'database');
        await exitGracefully(0, () => migrationService.close());
    } catch (error) {
        logger.error('Erreur lors du rollback', 'database', error);
        await exitGracefully(1, () => migrationService.close());
    }
}

void rollbackMigration();

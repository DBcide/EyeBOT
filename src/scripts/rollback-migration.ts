// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { MigrationService } from '../database/MigrationService';
import { migrations } from '../database/migrations';
import { LoggerService } from '../shared/services/LoggerService';

const logger = new LoggerService();

async function rollbackMigration() {
    try {
        logger.info('🔄 Annulation de la dernière migration...', 'database');

        const migrationService = new MigrationService();

        // Annuler la dernière migration
        await migrationService.rollbackLastMigration(migrations);

        logger.success('🎉 Rollback terminé avec succès !', 'database');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors du rollback', 'database', error);
        process.exit(1);
    }
}

// Exécuter le script
rollbackMigration();

// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { Bot } from './core/Bot';
import { ServiceContainer } from './shared/services/ServiceContainer';

const logger = ServiceContainer.getInstance().logger;
const bot = new Bot();

let isShuttingDown = false;

/**
 * Arrête proprement le bot puis termine le processus
 *
 * @param signal - Raison de l'arrêt (affichée dans les logs)
 * @param exitCode - Code de sortie du processus (1 pour signaler un crash à PM2)
 */
async function gracefulShutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (isShuttingDown) {
        logger.warn('⚠️  Arrêt déjà en cours, ignoré', 'shutdown');
        return;
    }

    isShuttingDown = true;
    logger.warn(`🔴 Signal reçu: ${signal}`, 'shutdown');

    try {
        await bot.shutdown(signal);
        process.exit(exitCode);
    } catch (error) {
        logger.error('❌ Erreur lors de l\'arrêt propre', 'shutdown', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM - Arrêt demandé par le système');
});

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT - Interruption manuelle (Ctrl+C)');
});

process.on('uncaughtException', (error: Error) => {
    logger.error('💥 Exception non catchée détectée!', 'error', error);
    void gracefulShutdown('uncaughtException', 1);
});

// On log sans arrêter le bot : une promesse rejetée isolée n'est généralement pas fatale
process.on('unhandledRejection', (reason: unknown) => {
    logger.error('💥 Promise rejetée non catchée détectée!', 'error', reason);
});

bot.start().catch((error) => {
    logger.error('Erreur fatale lors du démarrage du bot', 'startup', error);
    process.exit(1);
});

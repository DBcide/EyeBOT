import { Bot } from './core/Bot';
import { LoggerService } from './shared/services/LoggerService';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier .env
dotenv.config();

// Initialiser le logger
const logger = new LoggerService();

// Créer une instance du bot
const bot = new Bot();

// Variable pour éviter les shutdowns multiples
let isShuttingDown = false;

/**
 * Gère l'arrêt propre du bot
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
        logger.warn('⚠️  Arrêt déjà en cours, ignoré', 'shutdown');
        return;
    }

    isShuttingDown = true;
    logger.warn(`\n🔴 Signal reçu: ${signal}`, 'shutdown');

    try {
        await bot.shutdown(signal);
        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors de l\'arrêt propre', 'shutdown', error);
        process.exit(1);
    }
}

// Handler pour SIGTERM (arrêt propre demandé par le système)
process.on('SIGTERM', async () => {
    await gracefulShutdown('SIGTERM - Arrêt demandé par le système');
});

// Handler pour SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT - Interruption manuelle (Ctrl+C)');
});

// Handler pour les exceptions non catchées
process.on('uncaughtException', (error: Error) => {
    logger.error('💥 Exception non catchée détectée!', 'error', error);
    logger.error(`Stack trace: ${error.stack}`, 'error');

    // Arrêt forcé après log
    gracefulShutdown('uncaughtException').then(() => {
        process.exit(1);
    });
});

// Handler pour les promises rejetées non catchées
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('💥 Promise rejetée non catchée détectée!', 'error', reason);
    logger.error(`Promise: ${promise}`, 'error');

    // On log mais on ne shutdown pas (peut être non critique)
    // Si c'est critique, l'erreur deviendra une uncaughtException
});

// Démarrer le bot
bot.start().catch((error) => {
    logger.error('Erreur fatale lors du démarrage du bot', 'startup', error);
    process.exit(1);
});
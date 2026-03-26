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
        logger.warn('⚠️  Arrêt déjà en cours, ignoré');
        return;
    }

    isShuttingDown = true;
    logger.warn(`\n🔴 Signal reçu: ${signal}`);

    try {
        await bot.shutdown(signal);
        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors de l\'arrêt propre', error);
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
    logger.error('💥 Exception non catchée détectée!', error);
    logger.error(`Stack trace: ${error.stack}`);

    // Arrêt forcé après log
    gracefulShutdown('uncaughtException').then(() => {
        process.exit(1);
    });
});

// Handler pour les promises rejetées non catchées
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('💥 Promise rejetée non catchée détectée!', reason);
    logger.error(`Promise: ${promise}`);

    // On log mais on ne shutdown pas (peut être non critique)
    // Si c'est critique, l'erreur deviendra une uncaughtException
});

// Démarrer le bot
bot.start().catch((error) => {
    logger.error('Erreur fatale lors du démarrage du bot', error);
    process.exit(1);
});
import { Bot } from './core/Bot';
import { LoggerService } from './shared/services/LoggerService';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis le fichier .env
dotenv.config();

// Initialiser le logger
const logger = new LoggerService();

// Créer une instance du bot
const bot = new Bot();

// Démarrer le bot
bot.start().catch((error) => {
    logger.error('Erreur fatale lors du démarrage du bot', error);
    process.exit(1);
});
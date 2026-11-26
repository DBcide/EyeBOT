// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { Bot } from './core/Bot';
import { startConsoleCommands } from './core/ConsoleCommands';
import { ServiceContainer } from './shared/services/ServiceContainer';
import { exitGracefully } from './shared/utils/exitGracefully';

/**
 * Délai maximal avant sortie forcée une fois l'arrêt propre terminé.
 * Inférieur au kill_timeout de PM2 (5000 ms, ecosystem.config.js) pour sortir avant un SIGKILL.
 */
const SHUTDOWN_FALLBACK_MS = 4000;

const logger = ServiceContainer.getInstance().logger;
const bot = new Bot();

let isShuttingDown = false;
let stopConsoleCommands: (() => void) | null = null;

/**
 * Arrête proprement le bot puis laisse le processus se terminer
 *
 * @param signal - Raison de l'arrêt (affichée dans les logs)
 * @param exitCode - Code de sortie du processus (1 pour signaler un crash à PM2)
 *
 * @remarks
 * Pas de process.exit() immédiat : sous Windows il fait planter Node si une connexion
 * (websocket Discord, MySQL) est encore en cours de fermeture. Voir exitGracefully().
 */
async function gracefulShutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (isShuttingDown) {
        logger.warn('Arrêt déjà en cours, ignoré', 'shutdown');
        return;
    }

    isShuttingDown = true;
    // La raison est loguée une seule fois, par bot.shutdown()

    // L'écoute du terminal retiendrait le processus en vie
    stopConsoleCommands?.();

    await exitGracefully(exitCode, () => bot.shutdown(signal), SHUTDOWN_FALLBACK_MS);
}

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM - Arrêt demandé par le système');
});

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT - Interruption manuelle (Ctrl+C)');
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Exception non catchée détectée!', 'error', error);
    void gracefulShutdown('uncaughtException', 1);
});

// On log sans arrêter le bot : une promesse rejetée isolée n'est généralement pas fatale
process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Promise rejetée non catchée détectée!', 'error', reason);
});

// Commandes tapées dans le terminal ("exit"...) : uniquement en interactif.
// Sous PM2 (ou si la sortie est redirigée), stdin n'est pas un TTY : rien n'est écouté.
if (process.stdin.isTTY) {
    stopConsoleCommands = startConsoleCommands({
        logger,
        onShutdown: (reason) => void gracefulShutdown(reason),
    });
}

bot.start().catch((error) => {
    // "exit" tapé pendant la connexion à Discord fait échouer login() : ce n'est pas une erreur
    if (isShuttingDown) return;

    logger.error('Erreur fatale lors du démarrage du bot', 'startup', error);
    void gracefulShutdown('Échec du démarrage', 1);
});

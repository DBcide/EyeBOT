import readline from 'readline';
import { Readable } from 'stream';
import { LoggerService } from '../shared/services/LoggerService';

/**
 * Options des commandes console
 */
export interface ConsoleCommandsOptions {
    /** Appelée pour `exit` / `stop` / `quit` */
    onShutdown: (reason: string) => void;
    logger: LoggerService;
    /** Flux lu (process.stdin par défaut, remplaçable pour les tests) */
    input?: Readable;
}

/**
 * Commandes tapées dans le terminal pendant que le bot tourne (`npm run dev` / `npm start`)
 *
 * @remarks
 * Commandes disponibles :
 * - `exit` (ou `stop`, `quit`) : arrêt propre du bot (même séquence que SIGTERM)
 * - `help` : liste des commandes
 *
 * **Ctrl+C** : readline est créé avec `terminal: false`, le terminal n'est donc pas passé
 * en mode brut. Ctrl+C reste un vrai signal SIGINT, géré par `process.on('SIGINT')` dans
 * index.ts (en mode `terminal: true`, readline l'intercepterait et Ctrl+C ne ferait plus rien).
 *
 * À n'activer que dans un terminal interactif : sous PM2, stdin n'est pas un TTY.
 *
 * @returns Une fonction qui arrête l'écoute du terminal (à appeler pendant l'arrêt)
 */
export function startConsoleCommands(options: ConsoleCommandsOptions): () => void {
    const { onShutdown, logger, input = process.stdin } = options;

    const rl = readline.createInterface({ input, terminal: false });

    rl.on('line', (line) => {
        const command = line.trim().toLowerCase();
        if (!command) return;

        switch (command) {
            case 'exit':
            case 'stop':
            case 'quit':
                onShutdown(`Commande "${command}" saisie dans le terminal`);
                break;
            case 'help':
                logger.raw('Commandes disponibles :');
                logger.raw('  exit (stop, quit)  Arrêt propre du bot');
                logger.raw('  help               Affiche cette aide');
                break;
            default:
                logger.warn(`Commande console inconnue: "${command}" (tapez "help")`, 'console');
        }
    });

    logger.info('Commandes console actives : tapez "exit" pour un arrêt propre, "help" pour l\'aide', 'console');

    return () => rl.close();
}

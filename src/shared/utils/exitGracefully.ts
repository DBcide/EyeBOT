/**
 * Termine le processus proprement, sans appeler process.exit() immédiatement
 *
 * @param exitCode - Code de sortie (0 = succès, 1 = erreur)
 * @param cleanup - Libère les ressources qui gardent le processus en vie (pool MySQL...)
 * @param fallbackMs - Délai avant sortie forcée si une ressource retient encore le processus
 *
 * @remarks
 * Appeler process.exit() alors qu'une connexion se ferme encore (socket HTTP keep-alive
 * de l'API Discord, websocket, connexions MySQL) fait planter Node sous Windows :
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c`.
 *
 * On libère donc les ressources puis on fixe process.exitCode : Node s'arrête de lui-même
 * une fois la boucle d'événements vide. Un minuteur de secours (unref, il ne retient pas
 * le processus) force la sortie si une ressource oubliée l'empêchait de se terminer.
 *
 * Utilisé par les scripts CLI (register, migrate) et par l'arrêt du bot (index.ts).
 */
export async function exitGracefully(
    exitCode: number,
    cleanup?: () => Promise<void>,
    fallbackMs: number = 10_000
): Promise<void> {
    try {
        await cleanup?.();
    } catch {
        // Le nettoyage ne doit pas masquer le code de sortie réel
    }

    process.exitCode = exitCode;
    setTimeout(() => process.exit(exitCode), fallbackMs).unref();
}

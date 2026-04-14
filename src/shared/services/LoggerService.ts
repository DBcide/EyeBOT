import { DatabaseService } from './DatabaseService';

/**
 * Service de logging centralisé pour toute l'application avec double écriture console + DB
 *
 * @remarks
 * Implémente un système de logging unifié pour toute l'application EyeBOT.
 *
 * **Caractéristiques**:
 * - Double écriture: Console (ANSI colorée) + Base de données (table system_logs)
 * - 6 niveaux de log: debug, info, success, warn, error, raw
 * - Fail-safe: N'interrompt jamais l'application en cas d'erreur DB
 * - Timestamps ISO 8601 sur tous les logs
 * - Catégorisation des logs (heartbeat, database, discord, tracer, etc.)
 * - Contexte JSON optionnel pour enrichir les logs
 *
 * **Architecture de dépendance**:
 * - Initialisé par ServiceContainer (singleton partagé)
 * - Connexion DB optionnelle via setDatabaseService() (évite dépendance circulaire)
 * - Fonctionne en mode console-only si DB non initialisé
 *
 * **Ordre d'initialisation (critique)**:
 * 1. LoggerService créé sans DB (console-only)
 * 2. DatabaseService créé séparément
 * 3. setDatabaseService() appelé pour activer le logging DB
 * 4. À partir de ce moment: Logs écrits en console ET en DB
 *
 * **Principe fail-safe**:
 * - Si writeToDatabase() échoue: Log console uniquement (pas de throw)
 * - Évite les boucles infinies (pas de this.error() dans catch de writeToDatabase)
 * - Garantit que le logging ne crashe jamais l'application
 *
 * **Table system_logs**:
 * ```sql
 * CREATE TABLE system_logs (
 *   id INT AUTO_INCREMENT PRIMARY KEY,
 *   level ENUM('debug','info','warn','error','success'),
 *   category VARCHAR(50),
 *   message TEXT,
 *   context JSON,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * ```
 *
 * **Utilisation**:
 * - Accessible via ServiceContainer.getInstance().logger
 * - Utilisé partout: Bot, Commands, Services, Events, Migrations
 *
 * @example
 * ```typescript
 * const services = ServiceContainer.getInstance();
 * services.logger.info('Bot démarré', 'bot');
 * services.logger.success('Commande exécutée', 'tracer', { userId: '123' });
 * services.logger.warn('Rate limit proche', 'albion-api');
 * services.logger.error('Échec de connexion DB', 'database', error);
 * services.logger.debug('État interne', 'debug', { state: {...} });
 * ```
 *
 * @see ServiceContainer - Initialisation de la dépendance DatabaseService
 * @see DatabaseLoggingService - Service complémentaire pour command_logs et event_logs
 */
export class LoggerService {
    private databaseService: DatabaseService | null = null;

    /**
     * Couleurs ANSI pour la console
     */
    private readonly colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        dim: '\x1b[2m',

        // Couleurs de texte
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        gray: '\x1b[90m',
    };

    /**
     * Active le logging en base de données en connectant le DatabaseService
     *
     * @param databaseService - L'instance de DatabaseService à utiliser pour les logs DB
     *
     * @remarks
     * Cette méthode résout la dépendance circulaire entre LoggerService et DatabaseService:
     * - LoggerService a besoin de DatabaseService pour écrire les logs
     * - DatabaseService pourrait avoir besoin de LoggerService pour logger ses erreurs
     *
     * **Solution**: Injection de dépendance retardée
     * 1. LoggerService créé avec databaseService = null (console-only)
     * 2. DatabaseService créé indépendamment
     * 3. setDatabaseService() appelé pour lier les deux
     *
     * **Appelée par**: ServiceContainer.constructor() après création des deux services
     *
     * **Avant l'appel**: Logs en console uniquement
     * **Après l'appel**: Logs en console + base de données (table system_logs)
     *
     * **Note**: Peut être appelée plusieurs fois sans effet de bord (reassignation)
     */
    public setDatabaseService(databaseService: DatabaseService): void {
        this.databaseService = databaseService;
    }

    /**
     * Génère un timestamp au format ISO 8601
     *
     * @returns Timestamp au format "YYYY-MM-DDTHH:mm:ss.sssZ"
     *
     * @remarks
     * Utilise Date.toISOString() pour garantir un format standard:
     * - Format: ISO 8601 avec millisecondes et timezone UTC
     * - Exemple: "2026-03-29T14:23:45.123Z"
     * - Compatible avec MySQL TIMESTAMP (parsing automatique)
     * - Facilite le tri chronologique des logs
     *
     * Ce format est utilisé pour:
     * - Affichage console (préfixe de chaque log)
     * - Recherche et tri dans les logs de production
     */
    private getTimestamp(): string {
        const now = new Date();
        return now.toISOString();
    }

    /**
     * Formatte un message de log avec timestamp, niveau et couleur ANSI
     *
     * @param level - Le niveau de log (INFO, ERROR, WARN, etc.)
     * @param color - Code couleur ANSI (this.colors.blue, this.colors.red, etc.)
     * @param message - Le message à logger
     * @returns Message formaté avec codes ANSI pour terminal
     *
     * @remarks
     * **Format de sortie**: `[timestamp] [LEVEL] message`
     *
     * **Codes ANSI utilisés**:
     * - Timestamp: Gris (this.colors.gray)
     * - Niveau: Couleur passée en paramètre (bleu, rouge, jaune, etc.)
     * - Message: Couleur par défaut du terminal
     * - Reset: this.colors.reset après chaque section colorée
     *
     * **Exemple de sortie**:
     * ```
     * [2026-03-29T14:23:45.123Z] [INFO] Bot démarré avec succès
     * ```
     *
     * **Compatibilité**: Fonctionne sur tous les terminaux modernes supportant ANSI
     */
    private formatMessage(level: string, color: string, message: string): string {
        const timestamp = this.getTimestamp();
        return `${this.colors.gray}[${timestamp}]${this.colors.reset} ${color}[${level}]${this.colors.reset} ${message}`;
    }

    /**
     * Écrit un log dans la table system_logs (écriture asynchrone)
     *
     * @param level - Niveau de log (correspond à l'ENUM de la colonne level)
     * @param category - Catégorie du log (ex: "heartbeat", "database", "discord", "tracer")
     * @param message - Message texte du log (stocké dans la colonne message)
     * @param context - Contexte additionnel (sera sérialisé en JSON)
     * @returns Promise qui se résout silencieusement (succès ou échec)
     *
     * @remarks
     * **Principe fail-safe (CRITIQUE)**:
     * - Si databaseService est null: Return silencieux (pas d'erreur)
     * - Si INSERT échoue: Catch + console.error (PAS de throw)
     * - Garantit que le logging ne crashe jamais l'application
     *
     * **Gestion des erreurs**:
     * - Pas de boucle infinie: Utilise console.error directement (pas this.error())
     * - Les erreurs DB sont loguées en console uniquement
     * - L'application continue même si la DB est down
     *
     * **Table system_logs**:
     * ```sql
     * CREATE TABLE system_logs (
     *   id INT AUTO_INCREMENT PRIMARY KEY,
     *   level ENUM('debug','info','warn','error','success') NOT NULL,
     *   category VARCHAR(50) NOT NULL,
     *   message TEXT NOT NULL,
     *   context JSON,
     *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     *   INDEX idx_level (level),
     *   INDEX idx_category (category),
     *   INDEX idx_created_at (created_at)
     * );
     * ```
     *
     * **Sérialisation du contexte**:
     * - Si context existe: JSON.stringify() puis INSERT dans colonne JSON
     * - Si context est null/undefined: NULL en base
     * - Permet de stocker des objets complexes (Error, metrics, etc.)
     *
     * **Appelée par**: Tous les méthodes publiques (info, success, warn, error, debug)
     *
     * **Note**: Méthode async mais catch() silencieux dans les appelants (fire-and-forget)
     */
    private async writeToDatabase(
        level: 'debug' | 'info' | 'warn' | 'error' | 'success',
        category: string,
        message: string,
        context?: any
    ): Promise<void> {
        // Si la base de données n'est pas initialisée, on skip silencieusement
        if (!this.databaseService) {
            return;
        }

        try {
            const sql = `
                INSERT INTO system_logs (level, category, message, context)
                VALUES (?, ?, ?, ?)
            `;
            const values = [
                level,
                category,
                message,
                context ? JSON.stringify(context) : null,
            ];
            await this.databaseService.insert(sql, values);
        } catch (error) {
            // On ne log pas les erreurs de base de données pour éviter une boucle infinie
            // On affiche juste un message dans la console
            console.error('[LoggerService] Failed to write log to database:', error);
        }
    }

    /**
     * Log un message d'information (usage général)
     *
     * @param message - Le message à logger
     * @param category - Catégorie du log (défaut: "general")
     * @param context - Contexte additionnel sérialisé en JSON
     *
     * @remarks
     * **Niveau**: INFO (affiché en bleu dans la console)
     *
     * **Utilisation typique**:
     * - Événements normaux de l'application (démarrage, arrêt, état)
     * - Opérations non-critiques en cours
     * - Informations de suivi pour diagnostics
     *
     * **Catégories courantes**:
     * - "bot": Événements du bot principal
     * - "database": Opérations de base de données
     * - "discord": Interactions Discord (guilds, membres)
     * - "tracer": Enregistrement de personnages Albion
     * - "heartbeat": Monitoring et health checks
     * - "general": Logs non catégorisés
     *
     * **Sortie**:
     * - Console: `[timestamp] [INFO] message` (en bleu)
     * - Base: INSERT dans system_logs avec level='info'
     *
     * @example
     * ```typescript
     * logger.info('Bot connecté à Discord', 'bot');
     * logger.info('Migration en cours', 'database', { migration: '20260326_000001' });
     * logger.info('Heartbeat envoyé', 'heartbeat', { status: 'ok' });
     * ```
     */
    public info(message: string, category: string = 'general', context?: any): void {
        console.log(this.formatMessage('INFO', this.colors.blue, message));
        this.writeToDatabase('info', category, message, context).catch(() => {});
    }

    /**
     * Log un message de succès (opération réussie)
     *
     * @param message - Le message à logger
     * @param category - Catégorie du log (défaut: "general")
     * @param context - Contexte additionnel sérialisé en JSON
     *
     * @remarks
     * **Niveau**: SUCCESS (affiché en vert dans la console)
     *
     * **Utilisation typique**:
     * - Opérations critiques terminées avec succès
     * - Confirmations de migrations
     * - Commandes Discord exécutées avec succès
     * - Enregistrements/vérifications de personnages réussis
     *
     * **Différence avec info()**:
     * - info(): État neutre, événement normal
     * - success(): Opération importante terminée avec succès
     *
     * **Sortie**:
     * - Console: `[timestamp] [SUCCESS] message` (en vert)
     * - Base: INSERT dans system_logs avec level='success'
     *
     * @example
     * ```typescript
     * logger.success('Migration exécutée avec succès', 'database');
     * logger.success('Personnage vérifié', 'tracer', { albionId: 'abc123' });
     * logger.success('Heartbeat envoyé', 'heartbeat', { retries: 0 });
     * logger.success('Commande /register exécutée', 'discord', { userId: '123' });
     * ```
     */
    public success(message: string, category: string = 'general', context?: any): void {
        console.log(this.formatMessage('SUCCESS', this.colors.green, message));
        this.writeToDatabase('success', category, message, context).catch(() => {});
    }

    /**
     * Log un avertissement (quelque chose d'anormal mais pas bloquant)
     *
     * @param message - Le message à logger
     * @param category - Catégorie du log (défaut: "general")
     * @param context - Contexte additionnel sérialisé en JSON
     *
     * @remarks
     * **Niveau**: WARN (affiché en jaune dans la console)
     *
     * **Utilisation typique**:
     * - Comportement anormal mais géré (non-bloquant)
     * - Ressources proches de la limite (CPU > 80%, RAM > 80%)
     * - Tentatives de retry en cours
     * - DMs Discord fermés (notification impossible)
     * - Rate limit API approché
     *
     * **Différence avec error()**:
     * - warn(): Problème non-bloquant, l'application continue normalement
     * - error(): Erreur critique, opération échouée
     *
     * **Sortie**:
     * - Console: `[timestamp] [WARN] message` (en jaune)
     * - Base: INSERT dans system_logs avec level='warn'
     *
     * @example
     * ```typescript
     * logger.warn('CPU usage > 80%', 'heartbeat', { cpu: 85.2 });
     * logger.warn('Impossible d\'envoyer un DM', 'discord', { userId: '123' });
     * logger.warn('Heartbeat retry #2', 'heartbeat', { attempt: 2 });
     * logger.warn('Aucune migration à annuler', 'database');
     * ```
     */
    public warn(message: string, category: string = 'general', context?: any): void {
        console.warn(this.formatMessage('WARN', this.colors.yellow, message));
        this.writeToDatabase('warn', category, message, context).catch(() => {});
    }

    /**
     * Log une erreur critique (opération échouée)
     *
     * @param message - Le message à logger
     * @param category - Catégorie du log (défaut: "general")
     * @param error - Objet Error (avec stack trace) ou contexte additionnel
     *
     * @remarks
     * **Niveau**: ERROR (affiché en rouge dans la console)
     *
     * **Utilisation typique**:
     * - Erreurs de base de données (connexion, requête)
     * - Erreurs d'API (Albion, Discord)
     * - Échec de migrations
     * - Exceptions non gérées dans les commandes
     * - Timeouts critiques
     *
     * **Gestion des objets Error**:
     * - Si error est une instance d'Error: Affiche stack trace complète en console
     * - Stocke en DB: { message, stack, name } dans la colonne context (JSON)
     * - Si error est un objet simple: JSON.stringify() direct
     *
     * **Sortie console**:
     * ```
     * [timestamp] [ERROR] message
     * Error: Original error message
     *     at functionName (file.ts:123)
     *     at ...
     * ```
     *
     * **Sortie base**:
     * - INSERT dans system_logs avec level='error'
     * - context JSON contient la stack trace si Error
     *
     * @example
     * ```typescript
     * try {
     *   await db.query('SELECT ...');
     * } catch (error) {
     *   logger.error('Échec de la requête', 'database', error);
     * }
     *
     * logger.error('Migration échouée', 'database', new Error('Constraint violation'));
     * logger.error('API timeout', 'albion-api', { timeout: 5000, url: '...' });
     * ```
     */
    public error(message: string, category: string = 'general', error?: any): void {
        const formattedMessage = this.formatMessage('ERROR', this.colors.red, message);
        console.error(formattedMessage);

        // Si un objet Error est fourni, afficher la stack trace
        let context: any = null;
        if (error) {
            if (error instanceof Error) {
                console.error(`${this.colors.red}${error.stack}${this.colors.reset}`);
                context = {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                };
            } else {
                console.error(`${this.colors.red}${JSON.stringify(error, null, 2)}${this.colors.reset}`);
                context = error;
            }
        }

        this.writeToDatabase('error', category, message, context).catch(() => {});
    }

    /**
     * Log un message de debug (informations détaillées pour le développement)
     *
     * @param message - Le message à logger
     * @param category - Catégorie du log (défaut: "general")
     * @param data - Données de debug sérialisées en JSON
     *
     * @remarks
     * **Niveau**: DEBUG (affiché en magenta dans la console)
     *
     * **Comportement selon environnement**:
     * - **NODE_ENV !== 'production'**: Log affiché en console + écrit en DB
     * - **NODE_ENV === 'production'**: Return immédiat (pas de log)
     *
     * **Utilisation typique**:
     * - Inspection d'état interne pendant le développement
     * - Débogage de flux complexes (migrations, transactions)
     * - Affichage de variables intermédiaires
     * - Vérification de données reçues d'API
     *
     * **Format d'affichage**:
     * ```
     * [timestamp] [DEBUG] message
     * {
     *   "key": "value",
     *   "nested": { ... }
     * }
     * ```
     * - Message principal en magenta
     * - Data JSON pretty-printed en gris (dim)
     *
     * **Différence avec info()**:
     * - debug(): Informations verboses pour développeurs uniquement
     * - info(): Informations importantes pour production
     *
     * **Performance**:
     * - En production: Return immédiat (ligne 158), aucun coût
     * - En développement: JSON.stringify() peut être coûteux sur gros objets
     *
     * @example
     * ```typescript
     * logger.debug('Table migrations vérifiée', 'database');
     * logger.debug('État avant transaction', 'database', { rows: [...] });
     * logger.debug('Réponse API Albion', 'albion-api', apiResponse);
     * logger.debug('Migration déjà exécutée', 'database', { name: '20260326_000001' });
     * ```
     */
    public debug(message: string, category: string = 'general', data?: any): void {
        if (process.env.NODE_ENV === 'production') return;

        const formattedMessage = this.formatMessage('DEBUG', this.colors.magenta, message);
        console.log(formattedMessage);

        if (data) {
            console.log(`${this.colors.dim}${JSON.stringify(data, null, 2)}${this.colors.reset}`);
        }

        this.writeToDatabase('debug', category, message, data).catch(() => {});
    }

    /**
     * Log un message brut sans formatage (console uniquement, pas de DB)
     *
     * @param message - Le message à afficher tel quel
     *
     * @remarks
     * **Caractéristiques**:
     * - Aucun timestamp, aucun niveau, aucune couleur
     * - Console uniquement (PAS d'écriture en base de données)
     * - Affichage direct via console.log()
     *
     * **Utilisation typique**:
     * - Affichage de bannières ASCII au démarrage
     * - Tableaux formatés custom (migrations list, stats)
     * - Sorties de scripts (register-commands.ts)
     * - Cas où le formatage standard nuit à la lisibilité
     *
     * **Différence avec autres méthodes**:
     * - Pas de préfixe [timestamp] [LEVEL]
     * - Pas de couleur ANSI automatique
     * - Pas d'écriture en system_logs
     *
     * **Note**: À utiliser avec parcimonie, préférer les méthodes typées (info, success, etc.)
     *
     * @example
     * ```typescript
     * logger.raw('╔═══════════════════╗');
     * logger.raw('║   EyeBOT v1.0.0   ║');
     * logger.raw('╚═══════════════════╝');
     * logger.raw('');
     * logger.raw('Migrations disponibles:');
     * logger.raw('  1. create_users_table');
     * logger.raw('  2. add_verification_system');
     * ```
     */
    public raw(message: string): void {
        console.log(message);
    }
}

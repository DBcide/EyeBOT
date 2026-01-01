/**
 * Service de logging centralisé pour toute l'application
 * Fournit des méthodes pour logger avec différents niveaux de gravité
 */
export class LoggerService {
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
     * Génère un timestamp formaté
     */
    private getTimestamp(): string {
        const now = new Date();
        return now.toISOString();
    }

    /**
     * Formatte un message avec couleur et niveau
     */
    private formatMessage(level: string, color: string, message: string): string {
        const timestamp = this.getTimestamp();
        return `${this.colors.gray}[${timestamp}]${this.colors.reset} ${color}[${level}]${this.colors.reset} ${message}`;
    }

    /**
     * Log un message d'information (usage général)
     */
    public info(message: string): void {
        console.log(this.formatMessage('INFO', this.colors.blue, message));
    }

    /**
     * Log un message de succès (opération réussie)
     */
    public success(message: string): void {
        console.log(this.formatMessage('SUCCESS', this.colors.green, message));
    }

    /**
     * Log un avertissement (quelque chose d'anormal mais pas bloquant)
     */
    public warn(message: string): void {
        console.warn(this.formatMessage('WARN', this.colors.yellow, message));
    }

    /**
     * Log une erreur (quelque chose a échoué)
     */
    public error(message: string, error?: any): void {
        const formattedMessage = this.formatMessage('ERROR', this.colors.red, message);
        console.error(formattedMessage);

        // Si un objet Error est fourni, afficher la stack trace
        if (error) {
            if (error instanceof Error) {
                console.error(`${this.colors.red}${error.stack}${this.colors.reset}`);
            } else {
                console.error(`${this.colors.red}${JSON.stringify(error, null, 2)}${this.colors.reset}`);
            }
        }
    }

    /**
     * Log un message de debug (informations détaillées pour le développement)
     * Seulement affiché si NODE_ENV !== 'production'
     */
    public debug(message: string, data?: any): void {
        if (process.env.NODE_ENV === 'production') return;

        const formattedMessage = this.formatMessage('DEBUG', this.colors.magenta, message);
        console.log(formattedMessage);

        if (data) {
            console.log(`${this.colors.dim}${JSON.stringify(data, null, 2)}${this.colors.reset}`);
        }
    }

    /**
     * Log un message brut sans formatage (pour des cas spéciaux)
     */
    public raw(message: string): void {
        console.log(message);
    }
}

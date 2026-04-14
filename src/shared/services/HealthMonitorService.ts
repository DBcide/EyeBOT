import { Client } from 'discord.js';
import { LoggerService } from './LoggerService';
import os from 'os';

/**
 * Interface pour les métriques système
 */
export interface SystemMetrics {
    timestamp: Date;
    uptime: number;
    memory: {
        used: number;
        total: number;
        percentage: number;
        heapUsed: number;
        heapTotal: number;
    };
    cpu: {
        usage: number;
        cores: number;
        loadAverage: number[];
    };
    process: {
        pid: number;
        uptime: number;
        memoryUsage: NodeJS.MemoryUsage;
    };
}

/**
 * Interface pour les métriques Discord
 */
export interface DiscordMetrics {
    guilds: number;
    users: number;
    channels: number;
    websocketPing: number;
    status: string;
}

/**
 * Service de monitoring de la santé du bot avec métriques système et heartbeat
 *
 * @remarks
 * Fonctionnalités principales:
 * - **Collecte de métriques système**: CPU, mémoire (système + processus), uptime
 * - **Métriques Discord**: Nombre de serveurs, utilisateurs, channels, ping WebSocket
 * - **Historique**: Conserve les 10 dernières minutes de métriques (60 entrées)
 * - **Heartbeat HTTP**: Envoie des pings périodiques pour éviter la suspension du processus
 * - **Alertes**: Logs warnings si CPU > 80% ou mémoire processus > 80%
 *
 * Configuration via variables d'environnement:
 * - HEALTH_MONITOR_INTERVAL_MS: Fréquence de collecte (défaut: 10000ms = 10s)
 * - HEARTBEAT_INTERVAL_MS: Fréquence des heartbeats (défaut: 60000ms = 1min)
 * - HEARTBEAT_URL: URL pour envoyer les heartbeats (optionnel)
 * - MAX_MEMORY_MB: Limite mémoire du processus (défaut: 1024MB, doit correspondre à PM2)
 *
 * Cas d'usage:
 * - Prévenir la suspension par l'hébergeur (ex: O2Switch détecte les processus inactifs)
 * - Surveiller les performances du bot en temps réel
 * - Détecter les fuites mémoire ou pics CPU
 * - Monitoring externe via heartbeat endpoint
 *
 * Métriques importantes:
 * - **RSS (Resident Set Size)**: Mémoire réelle utilisée par le processus Node.js
 * - **Heap**: Mémoire allouée à JavaScript (subset de RSS)
 * - **System RAM**: Mémoire totale du serveur (partagé, informatif seulement)
 *
 * @see CLAUDE.md - Section "Health Monitoring" pour détails d'implémentation
 */
export class HealthMonitorService {
    private logger: LoggerService;
    private client?: Client;
    private intervalId?: NodeJS.Timeout;
    private heartbeatIntervalId?: NodeJS.Timeout;

    private readonly MONITOR_INTERVAL_MS: number;
    private readonly HEARTBEAT_INTERVAL_MS: number;
    private readonly HEARTBEAT_URL?: string;
    private readonly MAX_MEMORY_MB: number;

    private startTime: Date;
    private previousCpuUsage: NodeJS.CpuUsage;

    private metricsHistory: SystemMetrics[] = [];
    private readonly MAX_HISTORY_SIZE = 60;

    private readonly MAX_HEARTBEAT_RETRIES = 3;
    private readonly HEARTBEAT_RETRY_BASE_DELAY_MS = 1000;

    /**
     * Crée une instance du service de monitoring
     *
     * @param logger - Instance de LoggerService (optionnel, créé si non fourni)
     *
     * @remarks
     * Initialisation:
     * - Accepte un logger externe (partagé avec Bot.ts) ou crée le sien
     * - Capture le temps de démarrage pour calculer l'uptime
     * - Initialise previousCpuUsage pour calculer les deltas CPU
     * - Charge la configuration depuis les variables d'environnement
     *
     * Configuration par défaut:
     * - MONITOR_INTERVAL_MS: 10000ms (10 secondes)
     * - HEARTBEAT_INTERVAL_MS: 60000ms (1 minute)
     * - HEARTBEAT_URL: undefined (heartbeat désactivé)
     * - MAX_MEMORY_MB: 1024MB (doit correspondre à ecosystem.config.js)
     *
     * Le service n'est pas démarré automatiquement, appeler start() après création.
     */
    constructor(logger?: LoggerService) {
        this.logger = logger || new LoggerService();
        this.startTime = new Date();
        this.previousCpuUsage = process.cpuUsage();

        this.MONITOR_INTERVAL_MS = Number(process.env.HEALTH_MONITOR_INTERVAL_MS) || 10000;
        this.HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 60000;
        this.HEARTBEAT_URL = process.env.HEARTBEAT_URL;
        this.MAX_MEMORY_MB = Number(process.env.MAX_MEMORY_MB) || 1024;
    }

    /**
     * Démarre le monitoring de santé et le heartbeat
     *
     * @param client - Le client Discord.js connecté
     * @returns void (ne retourne rien, fonctionne en arrière-plan)
     *
     * @remarks
     * Démarre deux intervalles:
     *
     * **1. Collecte de métriques** (MONITOR_INTERVAL_MS, défaut 10s):
     * - Récupère métriques système (CPU, RAM, uptime)
     * - Récupère métriques Discord (serveurs, users, ping)
     * - Ajoute à l'historique (max 60 entrées = 10 minutes)
     * - Log en DEBUG avec format condensé
     * - Log en WARN si CPU > 80% ou RSS > 80% de MAX_MEMORY_MB
     *
     * **2. Heartbeat HTTP** (HEARTBEAT_INTERVAL_MS, défaut 60s):
     * - Envoie un POST JSON à HEARTBEAT_URL si configuré
     * - Payload: timestamp, status, uptime, métriques CPU/RAM/Discord
     * - Retry 3 fois avec backoff exponentiel (1s, 2s, 4s)
     * - Log warning seulement après échec du dernier retry
     *
     * Cette méthode doit être appelée UNE FOIS après que le bot soit connecté à Discord
     * (généralement dans l'event ClientReady).
     *
     * @example
     * ```typescript
     * const healthMonitor = new HealthMonitorService(logger);
     * client.once(Events.ClientReady, () => {
     *     healthMonitor.start(client);
     * });
     * ```
     */
    public start(client: Client): void {
        this.client = client;

        this.logger.info('🏥 Démarrage du Health Monitor...', 'monitoring');

        this.intervalId = setInterval(() => {
            this.collectAndLogMetrics();
        }, this.MONITOR_INTERVAL_MS);

        if (this.HEARTBEAT_URL) {
            this.heartbeatIntervalId = setInterval(() => {
                this.sendHeartbeat();
            }, this.HEARTBEAT_INTERVAL_MS);
            this.logger.info(`💓 Heartbeat configuré vers ${this.HEARTBEAT_URL} (intervalle: ${this.HEARTBEAT_INTERVAL_MS}ms)`, 'heartbeat');
        } else {
            this.logger.warn('⚠️  Aucune URL de heartbeat configurée (HEARTBEAT_URL)', 'heartbeat');
        }

        this.logger.success(`✅ Health Monitor démarré (intervalle: ${this.MONITOR_INTERVAL_MS}ms)`, 'monitoring');
    }

    /**
     * Arrête le monitoring et nettoie les intervalles
     *
     * @returns void
     *
     * @remarks
     * Nettoie proprement les ressources:
     * - Arrête l'intervalle de collecte de métriques (clearInterval)
     * - Arrête l'intervalle de heartbeat (clearInterval)
     * - Réinitialise les IDs d'intervalles à undefined
     *
     * Appelé lors du shutdown graceful du bot (SIGTERM, SIGINT).
     * Aucun log d'erreur si les intervalles n'existent pas (idempotent).
     */
    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = undefined;
        }

        this.logger.info('🏥 Health Monitor arrêté', 'monitoring');
    }

    /**
     * Collecte les métriques système et Discord, puis les log
     *
     * @returns Promise qui se résout après collecte et logging
     *
     * @remarks
     * Cette méthode est appelée par l'intervalle défini dans start().
     *
     * Séquence:
     * 1. Collecte métriques système (getSystemMetrics)
     * 2. Collecte métriques Discord (getDiscordMetrics)
     * 3. Ajout à l'historique avec limite de taille (FIFO: shift si > 60)
     * 4. Logging via logMetrics (format condensé + alertes si seuils dépassés)
     *
     * Les erreurs sont capturées et loggées sans interrompre le monitoring.
     */
    private async collectAndLogMetrics(): Promise<void> {
        try {
            const systemMetrics = this.getSystemMetrics();
            const discordMetrics = this.getDiscordMetrics();

            this.metricsHistory.push(systemMetrics);

            if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
                this.metricsHistory.shift();
            }

            this.logMetrics(systemMetrics, discordMetrics);

        } catch (error) {
            this.logger.error('Erreur lors de la collecte des métriques', 'monitoring', error);
        }
    }

    /**
     * Collecte les métriques système (CPU, mémoire, uptime)
     *
     * @returns Objet SystemMetrics avec toutes les métriques collectées
     *
     * @remarks
     * Métriques collectées:
     *
     * **Mémoire système** (os module):
     * - used: totalMemory - freeMemory (mémoire utilisée sur le serveur)
     * - total: Total RAM du serveur
     * - percentage: (used / total) * 100
     *
     * **Mémoire processus** (process.memoryUsage):
     * - heapUsed: Mémoire heap JavaScript utilisée
     * - heapTotal: Mémoire heap JavaScript allouée
     * - rss: Resident Set Size (mémoire réelle du processus)
     *
     * **CPU**:
     * - usage: Calculé via calculateCpuUsage() (pourcentage sur l'intervalle)
     * - cores: Nombre de cœurs CPU disponibles
     * - loadAverage: [1min, 5min, 15min] load average du système
     *
     * **Process**:
     * - pid: Process ID
     * - uptime: Durée depuis le démarrage du processus (secondes)
     *
     * Toutes les métriques sont capturées au même timestamp pour cohérence.
     */
    private getSystemMetrics(): SystemMetrics {
        // Mémoire système
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        // Mémoire du processus Node.js
        const memUsage = process.memoryUsage();

        // CPU usage (en pourcentage)
        const cpuUsage = this.calculateCpuUsage();

        // Load average (moyenne sur 1, 5, 15 minutes)
        const loadAvg = os.loadavg();

        return {
            timestamp: new Date(),
            uptime: os.uptime(),
            memory: {
                used: usedMemory,
                total: totalMemory,
                percentage: (usedMemory / totalMemory) * 100,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
            },
            cpu: {
                usage: cpuUsage,
                cores: os.cpus().length,
                loadAverage: loadAvg,
            },
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: memUsage,
            },
        };
    }

    /**
     * Calcule l'utilisation CPU du processus depuis la dernière mesure
     *
     * @returns Pourcentage d'utilisation CPU (0-100)
     *
     * @remarks
     * Algorithme:
     * 1. Appelle process.cpuUsage(previousCpuUsage) pour obtenir le delta depuis la dernière mesure
     * 2. Somme user + system (temps CPU total en microsecondes)
     * 3. Convertit en millisecondes (/ 1000)
     * 4. Calcule le pourcentage: (totalUsage / intervalMs) * 100
     * 5. Plafonne à 100% (Math.min)
     *
     * **Exemple**:
     * - Intervalle: 10000ms (10 secondes)
     * - CPU usage: 500ms (user) + 100ms (system) = 600ms
     * - Pourcentage: (600 / 10000) * 100 = 6%
     *
     * La valeur de previousCpuUsage est mise à jour après chaque calcul pour le prochain delta.
     */
    private calculateCpuUsage(): number {
        const currentUsage = process.cpuUsage(this.previousCpuUsage);
        this.previousCpuUsage = process.cpuUsage();

        const totalUsage = (currentUsage.user + currentUsage.system) / 1000;
        const intervalMs = this.MONITOR_INTERVAL_MS;
        const cpuPercentage = (totalUsage / intervalMs) * 100;

        return Math.min(cpuPercentage, 100);
    }

    /**
     * Récupère les métriques Discord du bot
     *
     * @returns Objet DiscordMetrics ou null si le client n'est pas encore initialisé
     *
     * @remarks
     * Métriques collectées depuis le client Discord.js:
     *
     * - **guilds**: Nombre de serveurs Discord où le bot est présent
     * - **users**: Nombre total d'utilisateurs (somme des memberCount de tous les serveurs)
     * - **channels**: Nombre de channels dans le cache du bot
     * - **websocketPing**: Latence WebSocket en ms (ping vers Discord Gateway)
     * - **status**: État de la connexion WebSocket ('READY' si ws.status === 0, 'CONNECTING' sinon)
     *
     * Retourne null si:
     * - Le client n'a pas encore été passé à start()
     * - Une erreur survient lors de la collecte (ex: client déconnecté)
     *
     * Les erreurs sont loggées mais ne bloquent pas le monitoring.
     */
    private getDiscordMetrics(): DiscordMetrics | null {
        if (!this.client) {
            return null;
        }

        try {
            const guilds = this.client.guilds.cache.size;
            const users = this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
            const channels = this.client.channels.cache.size;
            const websocketPing = this.client.ws.ping;
            const status = this.client.ws.status === 0 ? 'READY' : 'CONNECTING';

            return {
                guilds,
                users,
                channels,
                websocketPing,
                status,
            };
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des métriques Discord', 'monitoring', error);
            return null;
        }
    }

    /**
     * Formate une valeur en bytes en format lisible (B, KB, MB, GB, TB)
     *
     * @param bytes - Nombre de bytes à formater
     * @returns String formaté avec 2 décimales et l'unité appropriée
     *
     * @remarks
     * Conversion automatique vers l'unité la plus adaptée:
     * - 0 → "0 B"
     * - 1024 → "1.00 KB"
     * - 1048576 → "1.00 MB"
     * - 1073741824 → "1.00 GB"
     *
     * Utilise la base 1024 (standard binaire) plutôt que 1000.
     *
     * @example
     * ```typescript
     * formatBytes(134217728)  // "128.00 MB"
     * formatBytes(512)        // "512.00 B"
     * ```
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Formate une durée en secondes en format lisible (jours, heures, minutes, secondes)
     *
     * @param seconds - Durée en secondes
     * @returns String formaté (ex: "2j 5h 30m 15s")
     *
     * @remarks
     * Format adaptatif:
     * - Affiche uniquement les unités non nulles
     * - Si toutes les valeurs sont 0, affiche "0s"
     * - Format français: j (jours), h (heures), m (minutes), s (secondes)
     *
     * @example
     * ```typescript
     * formatUptime(90061)   // "1j 1h 1m 1s"
     * formatUptime(3665)    // "1h 1m 5s"
     * formatUptime(125)     // "2m 5s"
     * formatUptime(0)       // "0s"
     * ```
     */
    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const parts: string[] = [];
        if (days > 0) parts.push(`${days}j`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    /**
     * Log les métriques de manière condensée avec alertes conditionnelles
     *
     * @param systemMetrics - Métriques système collectées
     * @param discordMetrics - Métriques Discord (ou null si non disponible)
     * @returns void
     *
     * @remarks
     * Format du log (niveau DEBUG):
     * ```
     * 📊 Health | CPU: X% | Process RSS: X% (YMB/ZMB) | Heap: A/B | Server RAM: X% | Uptime: Xj Xh Xm Xs | Guilds: X | Users: X | Ping: Xms
     * ```
     *
     * **Métriques affichées**:
     * - CPU: Pourcentage d'utilisation du processus
     * - Process RSS: Mémoire réelle du processus (% de MAX_MEMORY_MB)
     * - Heap: Mémoire JavaScript (used/total)
     * - Server RAM: Mémoire système totale (informatif, serveur mutualisé)
     * - Uptime: Durée depuis le démarrage
     * - Discord: Serveurs, utilisateurs, ping WebSocket
     *
     * **Alertes (niveau WARN)**:
     * - Si RSS > 80% de MAX_MEMORY_MB: Risque de redémarrage PM2
     * - Si CPU > 80%: Utilisation élevée du processus
     *
     * **Alert DEBUG** (pas critique):
     * - Si Server RAM > 80%: Mémoire serveur élevée (normal sur serveur mutualisé)
     *
     * Le log principal est toujours en DEBUG pour ne pas polluer les logs INFO.
     */
    private logMetrics(systemMetrics: SystemMetrics, discordMetrics: DiscordMetrics | null): void {
        const systemMemoryPercentage = systemMetrics.memory.percentage.toFixed(2);
        const cpuUsage = systemMetrics.cpu.usage.toFixed(2);
        const processUptime = this.formatUptime(systemMetrics.process.uptime);
        const heapUsed = this.formatBytes(systemMetrics.memory.heapUsed);
        const heapTotal = this.formatBytes(systemMetrics.memory.heapTotal);

        const rssBytes = systemMetrics.process.memoryUsage.rss;
        const rssUsed = this.formatBytes(rssBytes);
        const maxMemoryBytes = this.MAX_MEMORY_MB * 1024 * 1024;
        const rssPercentage = ((rssBytes / maxMemoryBytes) * 100).toFixed(2);

        let metricsLog = `📊 Health | CPU: ${cpuUsage}% | Process RSS: ${rssPercentage}% (${rssUsed}/${this.MAX_MEMORY_MB}MB) | Heap: ${heapUsed}/${heapTotal} | Server RAM: ${systemMemoryPercentage}% | Uptime: ${processUptime}`;

        if (discordMetrics) {
            metricsLog += ` | Guilds: ${discordMetrics.guilds} | Users: ${discordMetrics.users} | Ping: ${discordMetrics.websocketPing}ms`;
        }

        this.logger.debug(metricsLog, 'monitoring');

        const rssPercentageNum = (rssBytes / maxMemoryBytes) * 100;
        if (rssPercentageNum > 80) {
            this.logger.warn(`⚠️  Mémoire processus élevée: ${rssPercentage}% (${rssUsed}/${this.MAX_MEMORY_MB}MB) - Risque de redémarrage PM2!`, 'monitoring');
        }

        if (systemMetrics.memory.percentage > 80) {
            this.logger.debug(`ℹ️  Mémoire serveur élevée (mutualisé): ${systemMemoryPercentage}%`, 'monitoring');
        }

        if (systemMetrics.cpu.usage > 80) {
            this.logger.warn(`⚠️  Utilisation CPU du processus élevée: ${cpuUsage}%`, 'monitoring');
        }
    }

    /**
     * Envoie un heartbeat HTTP avec retry et backoff exponentiel
     *
     * @returns Promise qui se résout après succès ou échec définitif
     *
     * @remarks
     * Envoie un POST JSON à HEARTBEAT_URL pour signaler que le bot est actif.
     *
     * **Stratégie de retry**:
     * - MAX_HEARTBEAT_RETRIES = 3 tentatives
     * - Backoff exponentiel: 1s, 2s, 4s (HEARTBEAT_RETRY_BASE_DELAY_MS * 2^attempt)
     * - Log debug pour chaque échec intermédiaire
     * - Log error seulement après le dernier échec
     *
     * **Payload JSON envoyé**:
     * ```json
     * {
     *   "timestamp": "ISO 8601 string",
     *   "status": "healthy",
     *   "uptime": 12345,
     *   "memory": {
     *     "systemPercentage": "45.67",
     *     "processHeapUsed": "128.50 MB",
     *     "processHeapTotal": "256.00 MB",
     *     "processRSS": "300.00 MB",
     *     "processRSSPercentage": "29.30",
     *     "maxMemoryMB": 1024
     *   },
     *   "cpu": {
     *     "usage": "12.34"
     *   },
     *   "discord": {
     *     "guilds": 5,
     *     "users": 1234,
     *     "ping": 45,
     *     "status": "READY"
     *   }
     * }
     * ```
     *
     * **Headers**:
     * - Content-Type: application/json
     * - User-Agent: EyeBOT-HealthMonitor/1.0
     *
     * Cas d'usage:
     * - Monitoring externe (Uptime Robot, Pingdom, etc.)
     * - Prévenir la suspension par l'hébergeur (ex: O2Switch)
     * - Collecte de métriques pour analyse
     */
    private async sendHeartbeat(): Promise<void> {
        if (!this.HEARTBEAT_URL) return;

        for (let attempt = 0; attempt < this.MAX_HEARTBEAT_RETRIES; attempt++) {
            try {
                const metrics = this.getSystemMetrics();
                const discordMetrics = this.getDiscordMetrics();

                const rssBytes = metrics.process.memoryUsage.rss;
                const maxMemoryBytes = this.MAX_MEMORY_MB * 1024 * 1024;
                const rssPercentage = ((rssBytes / maxMemoryBytes) * 100).toFixed(2);

                const payload = {
                    timestamp: new Date().toISOString(),
                    status: 'healthy',
                    uptime: metrics.process.uptime,
                    memory: {
                        systemPercentage: metrics.memory.percentage.toFixed(2),
                        processHeapUsed: this.formatBytes(metrics.memory.heapUsed),
                        processHeapTotal: this.formatBytes(metrics.memory.heapTotal),
                        processRSS: this.formatBytes(rssBytes),
                        processRSSPercentage: rssPercentage,
                        maxMemoryMB: this.MAX_MEMORY_MB,
                    },
                    cpu: {
                        usage: metrics.cpu.usage.toFixed(2),
                    },
                    discord: discordMetrics ? {
                        guilds: discordMetrics.guilds,
                        users: discordMetrics.users,
                        ping: discordMetrics.websocketPing,
                        status: discordMetrics.status,
                    } : null,
                };

                const response = await fetch(this.HEARTBEAT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'EyeBOT-HealthMonitor/1.0',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                this.logger.debug(`💓 Heartbeat envoyé avec succès (tentative ${attempt + 1}/${this.MAX_HEARTBEAT_RETRIES})`, 'heartbeat');
                return; // Succès, on sort

            } catch (error: any) {
                const isLastAttempt = attempt === this.MAX_HEARTBEAT_RETRIES - 1;

                if (isLastAttempt) {
                    this.logger.error(`❌ Heartbeat échoué après ${this.MAX_HEARTBEAT_RETRIES} tentatives`, 'heartbeat', error);
                } else {
                    const delay = this.HEARTBEAT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                    this.logger.debug(`⚠️  Heartbeat échoué (tentative ${attempt + 1}/${this.MAX_HEARTBEAT_RETRIES}), retry dans ${delay}ms...`, 'heartbeat');

                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }

    /**
     * Récupère les métriques actuelles du bot (snapshot instantané)
     *
     * @returns Objet contenant system et discord metrics, ou null si le client n'est pas initialisé
     *
     * @remarks
     * Utilisé pour consultation externe des métriques en temps réel.
     * Ne puise pas dans l'historique, collecte les métriques à l'instant T.
     *
     * Retourne null si start() n'a pas encore été appelé (client non disponible).
     *
     * Cas d'usage:
     * - Afficher les métriques dans une commande Discord (ex: /status)
     * - Exposer les métriques via une API REST
     * - Dashboard de monitoring en temps réel
     *
     * @example
     * ```typescript
     * const metrics = healthMonitor.getCurrentMetrics();
     * if (metrics) {
     *     console.log(`CPU: ${metrics.system.cpu.usage}%`);
     *     console.log(`Guilds: ${metrics.discord?.guilds}`);
     * }
     * ```
     */
    public getCurrentMetrics(): { system: SystemMetrics; discord: DiscordMetrics | null } | null {
        if (!this.client) return null;

        return {
            system: this.getSystemMetrics(),
            discord: this.getDiscordMetrics(),
        };
    }

    /**
     * Récupère l'historique complet des métriques collectées
     *
     * @returns Copie du tableau d'historique (max 60 entrées = 10 minutes)
     *
     * @remarks
     * Retourne une copie du tableau pour éviter les modifications externes.
     * L'historique est conservé en FIFO (First In First Out):
     * - Les nouvelles métriques sont ajoutées à la fin (push)
     * - Les anciennes sont supprimées quand > MAX_HISTORY_SIZE (shift)
     *
     * Chaque entrée contient un snapshot complet des métriques à un instant T.
     * Intervalle entre chaque entrée: MONITOR_INTERVAL_MS (défaut 10s)
     *
     * Cas d'usage:
     * - Afficher un graphique d'évolution des métriques
     * - Analyser les tendances sur 10 minutes
     * - Détecter des pics CPU/mémoire
     *
     * @example
     * ```typescript
     * const history = healthMonitor.getMetricsHistory();
     * console.log(`${history.length} snapshots disponibles`);
     * history.forEach(m => {
     *     console.log(`${m.timestamp}: CPU ${m.cpu.usage}%`);
     * });
     * ```
     */
    public getMetricsHistory(): SystemMetrics[] {
        return [...this.metricsHistory];
    }

    /**
     * Calcule les statistiques moyennes sur l'historique des métriques
     *
     * @returns Objet contenant les moyennes CPU, mémoire, heap, ou null si historique vide
     *
     * @remarks
     * Calcule la moyenne arithmétique sur toutes les entrées de l'historique.
     *
     * **Métriques moyennées**:
     * - avgCpuUsage: Pourcentage CPU moyen
     * - avgMemoryPercentage: Pourcentage mémoire système moyen
     * - avgHeapUsed: Mémoire heap moyenne (en bytes)
     *
     * Retourne null si aucune métrique n'a encore été collectée.
     *
     * Cas d'usage:
     * - Afficher les métriques moyennes dans une commande /stats
     * - Détecter les dérives de performance sur la durée
     * - Comparer les performances entre différentes périodes
     *
     * @example
     * ```typescript
     * const avg = healthMonitor.getAverageMetrics();
     * if (avg) {
     *     console.log(`CPU moyen: ${avg.avgCpuUsage.toFixed(2)}%`);
     *     console.log(`RAM moyenne: ${avg.avgMemoryPercentage.toFixed(2)}%`);
     * }
     * ```
     */
    public getAverageMetrics(): {
        avgCpuUsage: number;
        avgMemoryPercentage: number;
        avgHeapUsed: number;
    } | null {
        if (this.metricsHistory.length === 0) return null;

        const totals = this.metricsHistory.reduce(
            (acc, m) => ({
                cpu: acc.cpu + m.cpu.usage,
                memory: acc.memory + m.memory.percentage,
                heap: acc.heap + m.memory.heapUsed,
            }),
            { cpu: 0, memory: 0, heap: 0 }
        );

        const count = this.metricsHistory.length;

        return {
            avgCpuUsage: totals.cpu / count,
            avgMemoryPercentage: totals.memory / count,
            avgHeapUsed: totals.heap / count,
        };
    }
}

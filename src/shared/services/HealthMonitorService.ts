import { Client } from 'discord.js';
import { LoggerService } from './LoggerService';
import os from 'node:os';

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
 * Service de monitoring de la santé du bot et des métriques système
 * Permet de garder le bot actif et de surveiller ses performances
 */
export class HealthMonitorService {
    private readonly logger: LoggerService;
    private client?: Client;
    private intervalId?: NodeJS.Timeout;
    private heartbeatIntervalId?: NodeJS.Timeout;

    // Configuration
    private readonly MONITOR_INTERVAL_MS: number;
    private readonly HEARTBEAT_INTERVAL_MS: number;
    private readonly HEARTBEAT_URL?: string;

    // Métriques de démarrage pour calculer les deltas
    private readonly startTime: Date;
    private previousCpuUsage: NodeJS.CpuUsage;

    // Historique des métriques (dernières 10 minutes)
    private readonly metricsHistory: SystemMetrics[] = [];
    private readonly MAX_HISTORY_SIZE = 60; // 60 entrées * 10 secondes = 10 minutes

    constructor() {
        this.logger = new LoggerService();
        this.startTime = new Date();
        this.previousCpuUsage = process.cpuUsage();

        // Configuration depuis les variables d'environnement
        this.MONITOR_INTERVAL_MS = Number(process.env.HEALTH_MONITOR_INTERVAL_MS) || 10000; // 10 secondes par défaut
        this.HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 60000; // 1 minute par défaut
        this.HEARTBEAT_URL = process.env.HEARTBEAT_URL;
    }

    /**
     * Démarre le monitoring de santé
     */
    public start(client: Client): void {
        this.client = client;

        this.logger.info('🏥 Démarrage du Health Monitor...');

        // Monitoring des métriques
        this.intervalId = setInterval(() => {
            this.collectAndLogMetrics();
        }, this.MONITOR_INTERVAL_MS);

        // Heartbeat pour garder le processus actif
        if (this.HEARTBEAT_URL) {
            this.heartbeatIntervalId = setInterval(() => {
                this.sendHeartbeat();
            }, this.HEARTBEAT_INTERVAL_MS);
            this.logger.info(`💓 Heartbeat configuré vers ${this.HEARTBEAT_URL} (intervalle: ${this.HEARTBEAT_INTERVAL_MS}ms)`);
        } else {
            this.logger.warn('⚠️  Aucune URL de heartbeat configurée (HEARTBEAT_URL)');
        }

        this.logger.success(`✅ Health Monitor démarré (intervalle: ${this.MONITOR_INTERVAL_MS}ms)`);
    }

    /**
     * Arrête le monitoring
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

        this.logger.info('🏥 Health Monitor arrêté');
    }

    /**
     * Collecte et log les métriques
     */
    private async collectAndLogMetrics(): Promise<void> {
        try {
            const systemMetrics = this.getSystemMetrics();
            const discordMetrics = this.getDiscordMetrics();

            // Ajouter à l'historique
            this.metricsHistory.push(systemMetrics);

            // Limiter la taille de l'historique
            if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
                this.metricsHistory.shift();
            }

            // Logger les métriques
            this.logMetrics(systemMetrics, discordMetrics);

        } catch (error) {
            this.logger.error('Erreur lors de la collecte des métriques', error);
        }
    }

    /**
     * Récupère les métriques système
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
     * Calcule l'utilisation CPU du processus (en pourcentage)
     */
    private calculateCpuUsage(): number {
        const currentUsage = process.cpuUsage(this.previousCpuUsage);
        this.previousCpuUsage = process.cpuUsage();

        // Convertir les microsecondes en pourcentage
        const totalUsage = (currentUsage.user + currentUsage.system) / 1000; // en millisecondes
        const intervalMs = this.MONITOR_INTERVAL_MS;
        const cpuPercentage = (totalUsage / intervalMs) * 100;

        return Math.min(cpuPercentage, 100); // Cap à 100%
    }

    /**
     * Récupère les métriques Discord
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
            this.logger.error('Erreur lors de la récupération des métriques Discord', error);
            return null;
        }
    }

    /**
     * Formate les bytes en format lisible
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Formate la durée en format lisible
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
     * Log les métriques de manière lisible
     */
    private logMetrics(systemMetrics: SystemMetrics, discordMetrics: DiscordMetrics | null): void {
        const memoryPercentage = systemMetrics.memory.percentage.toFixed(2);
        const cpuUsage = systemMetrics.cpu.usage.toFixed(2);
        const processUptime = this.formatUptime(systemMetrics.process.uptime);
        const heapUsed = this.formatBytes(systemMetrics.memory.heapUsed);
        const heapTotal = this.formatBytes(systemMetrics.memory.heapTotal);

        // Log condensé
        let metricsLog = `📊 Health | CPU: ${cpuUsage}% | RAM: ${memoryPercentage}% | Heap: ${heapUsed}/${heapTotal} | Uptime: ${processUptime}`;

        if (discordMetrics) {
            metricsLog += ` | Guilds: ${discordMetrics.guilds} | Users: ${discordMetrics.users} | Ping: ${discordMetrics.websocketPing}ms`;
        }

        this.logger.debug(metricsLog);

        // Alertes si utilisation excessive
        if (systemMetrics.memory.percentage > 80) {
            this.logger.warn(`⚠️  Utilisation mémoire élevée: ${memoryPercentage}%`);
        }

        if (systemMetrics.cpu.usage > 80) {
            this.logger.warn(`⚠️  Utilisation CPU élevée: ${cpuUsage}%`);
        }
    }

    /**
     * Envoie un heartbeat HTTP pour garder le processus actif
     */
    private async sendHeartbeat(): Promise<void> {
        if (!this.HEARTBEAT_URL) return;

        try {
            const metrics = this.getSystemMetrics();
            const discordMetrics = this.getDiscordMetrics();

            const payload = {
                timestamp: new Date().toISOString(),
                status: 'healthy',
                uptime: metrics.process.uptime,
                memory: {
                    percentage: metrics.memory.percentage.toFixed(2),
                    used: this.formatBytes(metrics.memory.used),
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

            if (response.ok) {
                this.logger.debug(`💓 Heartbeat envoyé avec succès`);
            } else {
                this.logger.warn(`⚠️  Heartbeat failed: ${response.status} ${response.statusText}`);
            }

        } catch (error: any) {
            this.logger.error('Erreur lors de l\'envoi du heartbeat', error);
        }
    }

    /**
     * Récupère les métriques actuelles (pour consultation externe)
     */
    public getCurrentMetrics(): { system: SystemMetrics; discord: DiscordMetrics | null } | null {
        if (!this.client) return null;

        return {
            system: this.getSystemMetrics(),
            discord: this.getDiscordMetrics(),
        };
    }

    /**
     * Récupère l'historique des métriques
     */
    public getMetricsHistory(): SystemMetrics[] {
        return [...this.metricsHistory];
    }

    /**
     * Calcule les statistiques moyennes sur l'historique
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

import { DatabaseService } from '../../../shared/services/DatabaseService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { VouchGuildSetting, VouchRequirement, Vouch } from '../models/VouchTypes';

/**
 * Service de gestion des vouches entre joueurs Albion Online
 *
 * @remarks
 * Gère l'ensemble de la logique métier liée aux vouches:
 * - Vérification des comptes Albion des utilisateurs
 * - Vérification des autorisations de vouch par serveur
 * - Détection des vouches circulaires
 * - Création et lecture des vouches en base de données
 * - Évaluation des prérequis de rôles configurés par les administrateurs
 *
 * **Tables utilisées**:
 * - `tracer_users`: Pour vérifier les comptes Albion
 * - `vouch_guild_settings`: Paramètres de vouch par serveur
 * - `vouch_requirements`: Prérequis de rôles par serveur
 * - `vouches`: Les vouches effectués
 */
export class VouchService {
    private db: DatabaseService;
    private logger: LoggerService;

    constructor() {
        this.db = new DatabaseService();
        this.logger = new LoggerService();
    }

    /**
     * Vérifie si un utilisateur Discord a au moins un compte Albion vérifié
     *
     * @param discordId - ID Discord de l'utilisateur
     * @returns true si l'utilisateur a au moins un personnage Albion avec is_verified = 1
     */
    public async hasVerifiedAlbionAccount(discordId: string): Promise<boolean> {
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM tracer_users WHERE discord_id = ? AND is_verified = 1',
                [discordId]
            );
            return (result?.count || 0) > 0;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du compte Albion vérifié', 'vouch', error);
            throw error;
        }
    }

    /**
     * Vérifie si un utilisateur Discord a au moins un compte Albion enregistré (vérifié ou non)
     *
     * @param discordId - ID Discord de l'utilisateur
     * @returns true si l'utilisateur a au moins un personnage Albion enregistré
     */
    public async hasAnyAlbionAccount(discordId: string): Promise<boolean> {
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM tracer_users WHERE discord_id = ?',
                [discordId]
            );
            return (result?.count || 0) > 0;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du compte Albion', 'vouch', error);
            throw error;
        }
    }

    /**
     * Vérifie si l'ajout d'un arc (voucherId → voucheeId) créerait un circuit dans le graphe
     * des vouches d'un serveur Discord spécifique
     *
     * @param voucherId - ID Discord du garant (sommet source du nouvel arc)
     * @param voucheeId - ID Discord du garanti (sommet destination du nouvel arc)
     * @param guildId - ID Discord du serveur (chaque serveur a son propre graphe)
     * @returns true si l'arc peut être ajouté sans créer de circuit, false sinon
     *
     * @remarks
     * Chaque serveur Discord possède son propre graphe de vouches indépendant.
     * Un circuit dans le serveur A n'affecte pas le serveur B.
     *
     * **Algorithme** : DFS itératif depuis voucheeId à la recherche de voucherId
     * dans le graphe restreint au serveur `guildId`.
     * Si voucherId est atteignable depuis voucheeId → ajouter (voucherId → voucheeId)
     * créerait un circuit → refus.
     *
     * **Exemple** (serveur X) :
     * U1→U2→U3→U4 : U3 ne peut pas voucher U1 car U1 est atteignable depuis U3 (U3→U4? non,
     * on cherche depuis vouchee=U1 vers voucher=U3 → U1→U2→U3 trouvé → circuit).
     *
     * **Complexité** : O(V + E) où V = utilisateurs distincts du serveur, E = vouches du serveur.
     */
    public async canVouch(voucherId: string, voucheeId: string, guildId: string): Promise<boolean> {
        // Cas trivial : auto-vouch
        if (voucherId === voucheeId) return false;

        try {
            // Charger uniquement les arcs du serveur concerné
            const guildVouches = await this.db.select<{
                voucher_discord_id: string;
                vouchee_discord_id: string;
            }>(
                'SELECT DISTINCT voucher_discord_id, vouchee_discord_id FROM vouches WHERE guild_id = ?',
                [guildId]
            );

            // Liste d'adjacence du graphe de ce serveur : adj[u] = successeurs de u
            const adj = new Map<string, string[]>();
            for (const v of guildVouches) {
                if (!adj.has(v.voucher_discord_id)) adj.set(v.voucher_discord_id, []);
                adj.get(v.voucher_discord_id)!.push(v.vouchee_discord_id);
            }

            // DFS itératif depuis voucheeId — cherche si voucherId est atteignable
            const stack: string[] = [voucheeId];
            const visited = new Set<string>();

            while (stack.length > 0) {
                const current = stack.pop()!;

                if (current === voucherId) return false; // circuit détecté — early exit

                if (visited.has(current)) continue;
                visited.add(current);

                const neighbors = adj.get(current);
                if (neighbors) {
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor)) {
                            stack.push(neighbor);
                        }
                    }
                }
            }

            return true; // aucun chemin de voucheeId vers voucherId → arc sûr
        } catch (error) {
            this.logger.error('Erreur lors de la détection de circuit de vouch', 'vouch', error);
            throw error;
        }
    }

    /**
     * Récupère les paramètres de vouch d'un serveur Discord
     *
     * @param guildId - ID Discord du serveur
     * @returns Les paramètres de vouch ou null si non configurés
     */
    public async getGuildSettings(guildId: string): Promise<VouchGuildSetting | null> {
        try {
            return await this.db.selectOne<VouchGuildSetting>(
                'SELECT * FROM vouch_guild_settings WHERE guild_id = ?',
                [guildId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des paramètres de vouch', 'vouch', error);
            throw error;
        }
    }

    /**
     * Récupère tous les prérequis de rôles pour un serveur Discord
     *
     * @param guildId - ID Discord du serveur
     * @returns Liste des prérequis triés par groupe et par ID
     */
    public async getGuildRequirements(guildId: string): Promise<VouchRequirement[]> {
        try {
            return await this.db.select<VouchRequirement>(
                'SELECT * FROM vouch_requirements WHERE guild_id = ? ORDER BY condition_group, id',
                [guildId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des prérequis de vouch', 'vouch', error);
            throw error;
        }
    }

    /**
     * Vérifie si un membre remplit les prérequis de rôles pour voucher sur un serveur
     *
     * @param memberRoles - Liste des IDs de rôles du membre Discord
     * @param guildId - ID Discord du serveur
     * @returns true si le membre remplit au moins un groupe de conditions
     *
     * @remarks
     * **Logique d'évaluation**:
     * - Les prérequis sont regroupés par `condition_group`
     * - Au sein d'un groupe: opérateur AND (toutes les conditions doivent être remplies)
     * - Entre les groupes: opérateur OR (au moins un groupe doit être rempli)
     * - Si aucun prérequis n'est configuré pour le serveur: accès accordé à tous (si vouch activé)
     *
     * @example
     * ```
     * Groupe 1: must_have rôle A + must_not_have rôle B
     * Groupe 2: must_have rôle C
     * → Accès si (a A ET pas B) OU (a C)
     * ```
     */
    public async userMeetsRequirements(memberRoles: string[], guildId: string): Promise<boolean> {
        try {
            const requirements = await this.getGuildRequirements(guildId);

            if (requirements.length === 0) {
                // Pas de prérequis configurés = tout membre peut voucher (si vouch activé)
                return true;
            }

            // Regroupement des prérequis par condition_group
            const groups = new Map<number, VouchRequirement[]>();
            for (const req of requirements) {
                if (!groups.has(req.condition_group)) groups.set(req.condition_group, []);
                groups.get(req.condition_group)!.push(req);
            }

            // OR entre groupes: au moins un groupe doit être entièrement satisfait
            for (const [, groupReqs] of groups) {
                let groupSatisfied = true;
                for (const req of groupReqs) {
                    const hasRole = memberRoles.includes(req.role_id);
                    if (req.requirement_type === 'must_have' && !hasRole) {
                        groupSatisfied = false;
                        break;
                    }
                    if (req.requirement_type === 'must_not_have' && hasRole) {
                        groupSatisfied = false;
                        break;
                    }
                }
                if (groupSatisfied) return true;
            }
            return false;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification des prérequis de vouch', 'vouch', error);
            throw error;
        }
    }

    /**
     * Vérifie si un vouch existe déjà entre deux utilisateurs pour un serveur donné
     *
     * @param voucherId - ID Discord de l'utilisateur garant
     * @param voucheeId - ID Discord de l'utilisateur garanti
     * @param guildId - ID Discord du serveur
     * @returns true si le vouch existe déjà pour ce trio (voucher, vouchee, guild)
     */
    public async vouchExists(voucherId: string, voucheeId: string, guildId: string): Promise<boolean> {
        try {
            const result = await this.db.selectOne<{ count: number }>(
                'SELECT COUNT(*) as count FROM vouches WHERE voucher_discord_id = ? AND vouchee_discord_id = ? AND guild_id = ?',
                [voucherId, voucheeId, guildId]
            );
            return (result?.count || 0) > 0;
        } catch (error) {
            this.logger.error('Erreur lors de la vérification de l\'existence du vouch', 'vouch', error);
            throw error;
        }
    }

    /**
     * Crée un vouch en base de données
     *
     * @param voucherId - ID Discord de l'utilisateur qui se porte garant
     * @param voucheeId - ID Discord de l'utilisateur sous garantie
     * @param guildId - ID Discord du serveur concerné
     * @returns L'ID auto-incrémenté du vouch créé
     * @throws {Error} Si l'insertion échoue
     */
    public async createVouch(voucherId: string, voucheeId: string, guildId: string): Promise<number> {
        try {
            const id = await this.db.insert(
                'INSERT INTO vouches (voucher_discord_id, vouchee_discord_id, guild_id) VALUES (?, ?, ?)',
                [voucherId, voucheeId, guildId]
            );
            this.logger.success(`Vouch créé: ${voucherId} → ${voucheeId} dans le serveur ${guildId}`);
            return id;
        } catch (error) {
            this.logger.error('Erreur lors de la création du vouch', 'vouch', error);
            throw error;
        }
    }

    /**
     * Récupère tous les vouches reçus par un utilisateur
     *
     * @param voucheeId - ID Discord de l'utilisateur garanti
     * @returns Liste des vouches reçus par cet utilisateur
     */
    public async getVouchesForUser(voucheeId: string): Promise<Vouch[]> {
        try {
            return await this.db.select<Vouch>(
                'SELECT * FROM vouches WHERE vouchee_discord_id = ? ORDER BY created_at DESC',
                [voucheeId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des vouches', 'vouch', error);
            throw error;
        }
    }

    /**
     * Récupère tous les vouches donnés par un utilisateur
     *
     * @param voucherId - ID Discord de l'utilisateur garant
     * @returns Liste des vouches accordés par cet utilisateur
     */
    public async getVouchesByUser(voucherId: string): Promise<Vouch[]> {
        try {
            return await this.db.select<Vouch>(
                'SELECT * FROM vouches WHERE voucher_discord_id = ? ORDER BY created_at DESC',
                [voucherId]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des vouches donnés', 'vouch', error);
            throw error;
        }
    }
}

/**
 * Paramètres de vouch d'un serveur Discord
 *
 * @remarks
 * Stocke si la feature vouch est activée pour un serveur donné.
 * Configuré par les administrateurs du serveur via une commande d'administration (à venir).
 */
export interface VouchGuildSetting {
    /** ID auto-incrémenté (clé primaire) */
    id: number;
    /** ID Discord du serveur */
    guild_id: string;
    /** Vouch activé sur ce serveur: 0 = désactivé, 1 = activé */
    is_enabled: number;
    /** Date de création de la configuration */
    created_at: Date;
}

/**
 * Prérequis de rôle pour pouvoir effectuer un vouch sur un serveur
 *
 * @remarks
 * Définit les conditions de rôle qu'un utilisateur doit remplir pour voucher sur un serveur.
 *
 * **Logique de groupes**:
 * - Les prérequis dans un même `condition_group` sont combinés avec un opérateur AND
 * - Les groupes entre eux sont combinés avec un opérateur OR
 *
 * **Exemple**:
 * - Groupe 1: must_have rôle A + must_not_have rôle B → doit avoir A ET ne pas avoir B
 * - Groupe 2: must_have rôle C → doit avoir C
 * - Résultat global: (A ET non-B) OU (C)
 */
export interface VouchRequirement {
    /** ID auto-incrémenté (clé primaire) */
    id: number;
    /** ID Discord du serveur concerné */
    guild_id: string;
    /** ID Discord du rôle concerné */
    role_id: string;
    /** Type de prérequis: doit posséder ou ne pas posséder le rôle */
    requirement_type: 'must_have' | 'must_not_have';
    /** Numéro du groupe de condition (AND au sein d'un groupe, OR entre groupes) */
    condition_group: number;
    /** Date de création du prérequis */
    created_at: Date;
}

/**
 * Vouch enregistré en base de données
 *
 * @remarks
 * Représente une garantie d'un utilisateur (garant) pour un autre (garanti) sur un serveur.
 * Une ligne par couple (voucher, vouchee, guild).
 */
export interface Vouch {
    /** ID auto-incrémenté (clé primaire) */
    id: number;
    /** ID Discord de l'utilisateur qui se porte garant */
    voucher_discord_id: string;
    /** ID Discord de l'utilisateur sous garantie */
    vouchee_discord_id: string;
    /** ID Discord du serveur concerné par ce vouch */
    guild_id: string;
    /** Date de création du vouch */
    created_at: Date;
}

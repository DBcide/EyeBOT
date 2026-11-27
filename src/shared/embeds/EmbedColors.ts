/**
 * Palette de couleurs des embeds, partagée par toutes les features
 *
 * @remarks
 * Centraliser les couleurs évite les codes hexadécimaux éparpillés et garde
 * une signification cohérente (vert = succès, orange = avertissement, etc.).
 */
export const EmbedColors = {
    /** Opération réussie */
    Success: '#51CF66',
    /** Personnage vérifié / sécurisé */
    Verified: '#2ECC71',
    /** Refus ou erreur */
    Danger: '#E74C3C',
    /** Attention requise (ex: personnage non vérifié) */
    Alert: '#FF6B6B',
    /** Avertissement / instructions importantes */
    Warning: '#F39C12',
    /** Information, sélection, progression */
    Info: '#4A90E2',
    /** Aide / explications */
    Help: '#3498DB',
} as const;

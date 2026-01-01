/**
 * Classe abstraite définissant la structure de base pour tous les événements
 * Tous les événements du bot doivent hériter de cette classe
 */
export abstract class BaseEvent {
    /**
     * Nom de l'événement Discord (ex: "ready", "guildMemberAdd", "messageCreate")
     * Liste complète: https://discord.js.org/docs/packages/discord.js/main/Client:Class#events
     */
    public abstract name: string;

    /**
     * Si true, l'événement ne sera écouté qu'une seule fois
     * Utile pour l'événement "ready" par exemple
     */
    public abstract once: boolean;

    /**
     * Méthode exécutée quand l'événement se produit
     * Les paramètres dépendent du type d'événement
     * @param args Arguments fournis par Discord.js selon le type d'événement
     */
    public abstract execute(...args: any[]): Promise<void>;
}

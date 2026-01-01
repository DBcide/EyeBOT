import { CommandInteraction, SlashCommandBuilder } from 'discord.js';

/**
 * Classe abstraite définissant la structure de base pour toutes les commandes
 * Toutes les commandes du bot doivent hériter de cette classe
 */
export abstract class BaseCommand {
    /**
     * Nom de la commande (ex: "ban", "kick", "balance")
     */
    public abstract name: string;

    /**
     * Description de la commande affichée dans Discord
     */
    public abstract description: string;

    /**
     * Construit la structure de la commande pour Discord
     * Définit les options, permissions, etc.
     * @returns SlashCommandBuilder configuré
     */
    public abstract buildCommand(): SlashCommandBuilder;

    /**
     * Méthode exécutée quand un utilisateur utilise la commande
     * @param interaction L'interaction Discord contenant les données de la commande
     */
    public abstract execute(interaction: CommandInteraction): Promise<void>;
}

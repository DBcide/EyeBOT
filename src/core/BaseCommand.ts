import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

/**
 * Classe abstraite définissant la structure de base pour toutes les commandes
 * Toutes les commandes du bot doivent hériter de cette classe
 */
export abstract class BaseCommand {
    public abstract name: string;
    public abstract description: string;
    public abstract buildCommand(): SlashCommandBuilder;
    public abstract execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

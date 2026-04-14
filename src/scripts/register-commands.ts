import { REST, Routes } from 'discord.js';
import { Bot } from '../core/Bot';
import { LoggerService } from '../shared/services/LoggerService';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const logger = new LoggerService();

async function registerCommands() {
    try {
        logger.info('🔄 Démarrage de l\'enregistrement des commandes...', 'discord');

        // Créer une instance du bot pour charger toutes les commandes
        const bot = new Bot();

        // Charger les commandes (sans se connecter à Discord)
        await bot.loadCommandsOnly();

        // Convertir les commandes en JSON pour l'API Discord
        const commands = Array.from(bot.commands.values()).map(cmd =>
            cmd.buildCommand().toJSON()
        );

        logger.info(`📦 ${commands.length} commande(s) à enregistrer`, 'discord');

        // Vérifier les variables d'environnement
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('DISCORD_TOKEN manquant dans le .env');
        }
        if (!process.env.CLIENT_ID) {
            throw new Error('CLIENT_ID manquant dans le .env');
        }
        if (!process.env.GUILD_ID) {
            throw new Error('GUILD_ID manquant dans le .env');
        }

        // Créer le client REST
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);

        // Enregistrer les commandes (remplace toutes les commandes existantes)
        logger.info('⏳ Envoi des commandes à Discord...', 'discord');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        logger.success(`✅ ${commands.length} commande(s) enregistrée(s) avec succès !`, 'discord');

        // Afficher la liste des commandes enregistrées
        commands.forEach(cmd => {
            logger.info(`   /${cmd.name} - ${cmd.description}`, 'discord');
        });

    } catch (error) {
        logger.error('❌ Erreur lors de l\'enregistrement des commandes', 'discord', error);
        process.exit(1);
    }
}

// Exécuter le script
registerCommands();
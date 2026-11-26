// Doit rester le premier import : charge le .env avant que les autres modules lisent process.env
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { Bot } from '../core/Bot';
import { LoggerService } from '../shared/services/LoggerService';

const logger = new LoggerService();

async function registerCommands(): Promise<void> {
    try {
        logger.info('🔄 Démarrage de l\'enregistrement des commandes...', 'discord');

        const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
        if (!DISCORD_TOKEN) {
            throw new Error('DISCORD_TOKEN manquant dans le .env');
        }
        if (!CLIENT_ID) {
            throw new Error('CLIENT_ID manquant dans le .env');
        }
        if (!GUILD_ID) {
            throw new Error('GUILD_ID manquant dans le .env');
        }

        // Le Bot n'est utilisé que pour l'auto-découverte des commandes (pas de connexion Discord)
        const bot = new Bot();
        await bot.loadCommandsOnly();

        const commands = Array.from(bot.commands.values()).map(cmd =>
            cmd.buildCommand().toJSON()
        );

        logger.info(`📦 ${commands.length} commande(s) à enregistrer`, 'discord');

        const rest = new REST().setToken(DISCORD_TOKEN);

        // PUT remplace l'intégralité des commandes existantes du serveur
        logger.info('⏳ Envoi des commandes à Discord...', 'discord');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        logger.success(`✅ ${commands.length} commande(s) enregistrée(s) avec succès !`, 'discord');

        commands.forEach(cmd => {
            logger.info(`   /${cmd.name} - ${cmd.description}`, 'discord');
        });

        // Sortie explicite : le pool MySQL ouvert par le ServiceContainer (logs en base)
        // garderait sinon le processus en vie indéfiniment
        process.exit(0);
    } catch (error) {
        logger.error('❌ Erreur lors de l\'enregistrement des commandes', 'discord', error);
        process.exit(1);
    }
}

void registerCommands();

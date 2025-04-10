const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags } = require('discord.js');
const { pool, promisePool } = require(path.join(__dirname, 'db'));
require('dotenv').config();
const dev_id = "506045516421791744";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

async function getUserInfo(userId) {
    try {
        const user = await client.users.fetch(userId);
        return {
            username: user.username,
            avatarURL: user.displayAvatarURL({ dynamic: true, size: 512 })
        };
    } catch (error) {
        console.error(`❌ Erreur lors de la récupération de l'utilisateur ${userId} :`, error);
        return null;
    }
}

function getTimestamp() {
    const now = new Date();
    return now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

async function getLogChannel(guildId) {
    try {
        const [results] = await promisePool.query('SELECT log_channel_id FROM server_logs WHERE guild_id = ?', [guildId]);
        return results.length > 0 ? results[0].log_channel_id : null;
    } catch (err) {
        console.error(`[${getTimestamp()}] ❌ Erreur lors de la récupération du salon de logs:`, err);
        return null;
    }
}

async function sendLog(logChannel, interaction) {
    dev = await getUserInfo(dev_id);
    if (logChannel) {
        const logMessage = `Commande \`/${interaction.commandName}\` exécutée par **${interaction.user.tag}** dans **${interaction.guild.name}**.`;

        const logEmbed = new EmbedBuilder()
            .setColor('#007eff')
            .setTitle('Commande exécutée')
            .setDescription(logMessage)
            .setFooter({
                text: `Dev by ${dev.username}`,
                iconURL: `${dev.avatarURL}`,
              })
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] });
    } else {
        console.warn(`[${getTimestamp()}] ⚠️ Le salon de logs n'existe plus ou n'est pas accessible.`);
    }
}

async function sendShutdownLog() {
    const dev = await getUserInfo(dev_id);
    try {
        const [results] = await promisePool.query('SELECT log_channel_id FROM server_logs WHERE guild_id = ?', [client.guilds.cache.first()?.id]);

        if (!results.length || !results[0].log_channel_id) {
            console.warn("⚠️ Aucun salon de logs trouvé pour l'arrêt du bot.");
            return;
        }

        const logChannel = await client.channels.fetch(results[0].log_channel_id).catch(() => null);

        if (!logChannel) {
            console.warn("⚠️ Le salon de logs n'existe plus.");
            return;
        }

        const shutdownEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🛑 Arrêt du bot')
            .setDescription(`Le bot **${client.user.tag}** s'arrête.`)
            .setFooter({
                text: `Dev by ${dev.username}`,
                iconURL: `${dev.avatarURL}`,
              })
            .setTimestamp();

        await logChannel.send({ embeds: [shutdownEmbed] });
        console.log(`[${getTimestamp()}] ✅ Message de shutdown envoyé !`);
    } catch (error) {
        console.error("❌ Erreur lors de l'envoi du message de shutdown :", error);
    }
}

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[${getTimestamp()}] ⚠️ Commande incomplète trouvée : ${filePath}`);
        }
    }
}

console.log(`[${getTimestamp()}] 📂 ${client.commands.size} commandes ont été chargées.`);

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
    process.exit(1);
});

process.on('SIGINT', async () => {
    console.log(`[${getTimestamp()}] 🛑 Arrêt du bot en cours...`);
    await sendShutdownLog();
    client.destroy();
    process.exit();
});

process.on('SIGTERM', async () => {
    console.log(`[${getTimestamp()}] 🛑 Arrêt du bot en cours...`);
    await sendShutdownLog();
    client.destroy();
    process.exit();
});

client.once('ready', async () => {
    console.log(`[${getTimestamp()}] ✅ Connecté en tant que ${client.user.tag}`);
    const dev = await getUserInfo(dev_id);

    try {
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.warn(`[${getTimestamp()}] ⚠️ Aucun serveur trouvé.`);
            return;
        }

        const [results] = await promisePool.query('SELECT log_channel_id FROM server_logs WHERE guild_id = ?', [guild.id]);
        if (results.length > 0) {
            const logChannelId = results[0].log_channel_id;

            let logChannel = await client.channels.fetch(logChannelId);
            
            if (logChannel) {
                const readyEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Bot en ligne !')
                    .setDescription(`Le bot **${client.user.tag}** est désormais opérationnel.`)
                    .setFooter({
                        text: `Dev by ${dev.username}`,
                        iconURL: `${dev.avatarURL}`,
                      })
                    .setTimestamp();
                logChannel.send({ embeds: [readyEmbed] });
            } else {
                console.warn(`[${getTimestamp()}] ⚠️ Le salon de logs configuré n'existe plus.`);
            }
        } else {
            console.warn(`[${getTimestamp()}] ⚠️ Aucun salon de logs configuré.`);
        }
    } catch (err) {
        console.error(`[${getTimestamp()}] ❌ Erreur lors de la récupération du salon de logs:`, err);
    }

    setInterval(() => {
        console.log(`[${getTimestamp()}] ✅ Bot toujours opérationnel !`);
    }, 300000);
});

client.on('interactionCreate', async (interaction) => {
    console.log(`[${getTimestamp()}] 📩 Interaction reçue : ${interaction.commandName || interaction.customId}`);

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`[${getTimestamp()}] ❌ Commande inconnue : ${interaction.commandName}`);
            return interaction.reply({ content: "⚠️ Cette commande n'existe pas.", flags: [MessageFlags.Ephemeral] });
        }

        try {
            const [results] = await promisePool.query('SELECT log_channel_id FROM server_logs WHERE guild_id = ?', [interaction.guild.id]);

            if (results.length > 0) {
                const logChannelId = results[0].log_channel_id;
                let logChannel = await client.channels.fetch(logChannelId);

                sendLog(logChannel, interaction);

            } else {
                console.log(`[${getTimestamp()}] ⚠️ Aucun salon de logs configuré pour ce serveur.`);
            }
        } catch (err) {
            console.error(`[${getTimestamp()}] ❌ Erreur lors de l'envoi du log de commande:`, err);
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Erreur sur ${interaction.commandName}:`, error);
            await interaction.reply({ content: "⚠️ Une erreur est survenue.", flags: [MessageFlags.Ephemeral] });
        }
    } 
    
    else if (interaction.isButton()) {
        const customId = interaction.customId;
        const getCommand = customId.split('_')[0];

        try {
            if (customId === 'prev' || customId === 'next') {
                const message = interaction.message;

                if (!message.embeds.length) return;

                const type = message.embeds[0].title.includes('Fee') ? 'usersFee' : 'usersStats';

                const command = client.commands.get('list');
                if (command) {
                    await command.execute(interaction);
                }
            }
            else if (getCommand === 'setup') {
                await client.commands.get('setup').setupButtonHandler(interaction);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Erreur lors du traitement du bouton ${interaction.customId}:`, error);
            await interaction.reply({ content: "⚠️ Une erreur est survenue.", flags: [MessageFlags.Ephemeral] });
        }
    } 
    
    else if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;
        const getCommand = customId.split('_')[0];

        try {
            if (getCommand === 'setup') {
                await client.commands.get('setup').setupStringMenuHandler(interaction);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Erreur lors du traitement du menu déroulant ${interaction.customId}:`, error);
            await interaction.reply({ content: "⚠️ Une erreur est survenue.", flags: [MessageFlags.Ephemeral] });
        }
    }
});

client.login(process.env.TOKEN);

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, MessageFlags } = require('discord.js');
const { pool, promisePool } = require(path.join(__dirname, 'db'));
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

async function getUserInfo(client, userId) {
    try {
        // Utilisation de devUser si c'est l'utilisateur de développement
        if (userId === dev_id && client.devUser) {
            return {
                username: devUser.username,
                avatarURL: devUser.displayAvatarURL({ dynamic: true, size: 512 })
            };
        }
        
        // Si l'utilisateur n'est pas dev, on le récupère via l'API
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
    dev = await getUserInfo(client, dev_id);
    if (logChannel) {
        const logMessage = `Command \`/${interaction.commandName}\` executed by **${interaction.user.tag}** in **${interaction.guild.name}**.`;

        const logEmbed = new EmbedBuilder()
            .setColor('#007eff')
            .setAuthor({
                name: interaction.member.nickname ?? interaction.user.username,
                iconURL: interaction.member.avatarURL?.() ?? interaction.user.displayAvatarURL(),
            })
            .setTitle('Command executed')
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
    const dev = await getUserInfo(client, dev_id);
    try {
        const [results] = await promisePool.query('SELECT log_channel_id FROM server_logs WHERE log_channel_id IS NOT NULL');


        if (!results.length) {
            console.warn("⚠️ Aucun salon de logs trouvé pour l'arrêt du bot.");
            return;
        }

        const shutdownEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🛑 Bot shutdown')
            .setDescription(`The **${client.user.tag}** bot shuts down.`)
            .setFooter({
                text: `Dev by ${dev.username}`,
                iconURL: `${dev.avatarURL}`,
              })
            .setTimestamp();

            for (const row of results) {
                try {
                    const logChannel = await client.channels.fetch(row.log_channel_id).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [shutdownEmbed] });
                        console.log(`[${getTimestamp()}] ✅ Shutdown log envoyé dans le salon ${logChannel.guild.name}`);
                    } else {
                        console.warn(`⚠️ Salon introuvable (ID: ${row.log_channel_id})`);
                    }
                } catch (err) {
                    console.error(`❌ Erreur lors de l'envoi dans le salon ${row.log_channel_id} :`, err);
                }
            }

    } catch (error) {
        console.error("❌ Erreur lors de la recherche en base de donnée :", error);
    }
}

async function sendStartupLog() {
    const dev = await getUserInfo(client, dev_id);

    try {
        const [results] = await promisePool.query('SELECT log_channel_id FROM server_logs WHERE log_channel_id IS NOT NULL');

        if (!results.length) {
            console.warn(`[${getTimestamp()}] ⚠️ Aucun salon de logs configuré.`);
            return;
        }

        const readyEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('⚙️ Bot online !')
            .setDescription(`The **${client.user.tag}** bot is now operational.`)
            .setFooter({
                text: `Dev by ${dev.username}`,
                iconURL: `${dev.avatarURL}`,
            })
            .setTimestamp();

        for (const row of results) {
            try {
                const logChannel = await client.channels.fetch(row.log_channel_id).catch(() => null);
                if (logChannel) {
                    await logChannel.send({ embeds: [readyEmbed] });
                    console.log(`[${getTimestamp()}] ✅ Message de démarrage envoyé dans ${logChannel.guild.name}`);
                } else {
                    console.warn(`[${getTimestamp()}] ⚠️ Salon introuvable (ID: ${row.log_channel_id})`);
                }
            } catch (err) {
                console.error(`[${getTimestamp()}] ❌ Erreur lors de l'envoi dans le salon ${row.log_channel_id} :`, err);
            }
        }

    } catch (err) {
        console.error(`[${getTimestamp()}] ❌ Erreur lors de la récupération des salons de logs :`, err);
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

// ───────────────────────────────────────────────────────────────
// Démarrage du BOT
// ───────────────────────────────────────────────────────────────

const { dev_id } = require(path.join(__dirname, 'config'));
client.dev_id = dev_id;

client.once('ready', async () => {
    console.log(`[${getTimestamp()}] ✅ Connecté en tant que ${client.user.tag}`);

    try {
        devUser = await client.users.fetch(dev_id);
        client.devUser = await client.users.fetch(dev_id);
        console.log(`[${getTimestamp()}] ✅ Utilisateur de développement chargé : ${devUser.tag}`);
    } catch (error) {
        console.error("❌ Erreur lors du chargement de l'utilisateur de développement :", error);
    }

    await sendStartupLog();

    setInterval(() => {
        const usage = process.memoryUsage();
        console.log(`[HEARTBEAT] [${getTimestamp()}] RAM: ${(usage.rss / 1024 / 1024).toFixed(2)} MB | Uptime: ${(process.uptime() / 60).toFixed(1)} min`);
    }, 300000);
});

// ───────────────────────────────────────────────────────────────
// Fin démarrage du BOT
// ───────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────
// Ecoutes
// ───────────────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isAutocomplete()) {
        const guildName = interaction.guild?.name ?? "DM";
        console.log(`[${getTimestamp()}] 📩 [${guildName}] Interaction : ${interaction.commandName || interaction.customId}`);
    }

    // ───────────────────────────────────────────────────────────────
    // Gestion de l’autocomplete
    // ───────────────────────────────────────────────────────────────

    if (interaction.isAutocomplete()) {
        const focusedOption = interaction.options.getFocused(); // ce que l'utilisateur tape
        try {
            // On suppose que la commande s'appelle 'show' et que l'option autocomplete s'appelle 'name'
            if (interaction.commandName === 'show') {

                if (!focusedOption || focusedOption.length < 1) {
                    return interaction.respond([]);
                  }
                // Requête : on cherche dans la table items (ou spells selon ton cas)
                const [rows] = await promisePool.query(
                    `SELECT name
                     FROM items
                     WHERE name LIKE ?
                     ORDER BY
                       CASE
                         WHEN name LIKE ? THEN 0
                         ELSE 1
                       END,
                       name
                     LIMIT 25`,
                    [
                      `%${focusedOption}%`,        // pour filtrer tous ceux qui contiennent
                      `${focusedOption}%`          // pour prioriser ceux qui commencent
                    ]
                  );

                // On renvoie les suggestions à Discord
                await interaction.respond(
                    rows.map(r => ({ name: r.name, value: r.name }))
                );
            }
        } catch (err) {
            console.error(`[${getTimestamp()}] ❌ Erreur autocomplete:`, err);
        }
        return; // On arrête là pour l'autocomplete
    }

    // ───────────────────────────────────────────────────────────────
    // Fin de l'autocomplete
    // ───────────────────────────────────────────────────────────────

    // ───────────────────────────────────────────────────────────────
    // Début de l'écoute des commandes
    // ───────────────────────────────────────────────────────────────

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

    // ───────────────────────────────────────────────────────────────
    // Fin de l'écoute des commandes
    // ───────────────────────────────────────────────────────────────

    // ───────────────────────────────────────────────────────────────
    // Début de l'écoute des boutons
    // ───────────────────────────────────────────────────────────────
    
    else if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith('spell_info:')) {
            const spellName = customId.split(':')[1];
    
            // Simule l'exécution de /show spell avec name = spellName
            const command = client.commands.get('show');
            if (command) {
                // Mock manuellement les options
                const fakeInteraction = {
                    ...interaction,
                    client,
                    options: {
                        getString: (name) => (name === 'type' ? 'spell' : name === 'name' ? spellName : null),
                        getInteger: () => null,
                    },
                    commandName: 'show',
                    reply: (...args) => interaction.update(...args),
                    deferReply: (...args) => interaction.deferUpdate(...args),
                    editReply: (...args) => interaction.editReply(...args),
                };
    
                try {
                    await command.execute(fakeInteraction);
                } catch (err) {
                    console.error(`[${getTimestamp()}] ❌ Erreur lors de l'affichage du sort ${spellName}:`, err);
                    await interaction.reply({ content: "❌ Impossible to show the spell informations.", flags: [MessageFlags.Ephemeral] });
                }
            }
            return;
        }

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

    // ───────────────────────────────────────────────────────────────
    // Fin de l'écoute des boutons
    // ───────────────────────────────────────────────────────────────

    // ───────────────────────────────────────────────────────────────
    // Début de l'écoute des menus déroulants
    // ───────────────────────────────────────────────────────────────
    
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

    // ───────────────────────────────────────────────────────────────
    // Fin de l'écoute des menus déroulants
    // ───────────────────────────────────────────────────────────────

});

// ───────────────────────────────────────────────────────────────
// Fin des écoutes
// ───────────────────────────────────────────────────────────────

client.login(process.env.TOKEN);
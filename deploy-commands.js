const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.TOKEN;

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] La commande dans ${filePath} est invalide.`);
        }
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`🚀 Déploiement de ${commands.length} commandes sur Discord...`);

        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`✅ Commandes déployées sur le serveur avec l'ID ${guildId}`);

        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Commandes déployées globalement !');
        
    } catch (error) {
        console.error(error);
    }
})();

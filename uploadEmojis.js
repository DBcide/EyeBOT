const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.TOKEN;
const SERVERS = [
    '1368057449805906020',
    '1368057501630857347',
    '1368057543888474283',
    '1368057585323741276',
    '1368057636943040612',
    '1368057687614685204',
    '1368057740680888380',
    // Ajoute autant de serveurs que nécessaire
];

const ICONS_DIR = './assets/spells/'; // Dossier avec tes images d'emojis

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    const files = fs.readdirSync(ICONS_DIR).filter(file => /\.(png|jpg|jpeg)$/i.test(file));
    const emojiMap = {};
    let currentServerIndex = 0;
    let emojiCount = 0;

    for (const file of files) {
        const name = path.parse(file).name.replace(/[^a-z0-9_]/gi, '').toLowerCase();
        const buffer = fs.readFileSync(path.join(ICONS_DIR, file));

        // Si on atteint 50 emojis, passer au serveur suivant
        if (emojiCount >= 50) {
            currentServerIndex++;
            emojiCount = 0;
        }

        if (!SERVERS[currentServerIndex]) {
            console.warn(`⚠️ Plus de serveurs disponibles. Emoji "${name}" ignoré.`);
            continue;
        }

        const guild = await client.guilds.fetch(SERVERS[currentServerIndex]);

        try {
            const emoji = await guild.emojis.create({ attachment: buffer, name });
            emojiMap[name] = emoji.id;
            console.log(`✅ Emoji "${name}" ajouté au serveur ${guild.name}`);
            emojiCount++;
        } catch (err) {
            console.error(`❌ Échec pour "${name}":`, err.message);
        }
    }

    fs.writeFileSync('./emojiMap.json', JSON.stringify(emojiMap, null, 2));
    console.log('✅ emojiMap.json généré');
    process.exit(0);
});

client.login(BOT_TOKEN);
const path = require('node:path');
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { dev_id } = require(path.join(__dirname,'../../config'));
const { pool, promisePool } = require(path.join(__dirname, '../../db'));  // Importer le pool depuis db.js

// Fonction pour formater les nombres en ajoutant des espaces
function formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

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



async function getBalance(userId) {
    const [rows] = await promisePool.query("SELECT silver FROM fee WHERE id_user = ?", [userId]);
    return rows.length > 0 ? rows[0].silver : 0;
}

async function updateBalance(userId, amount, type) {
    // Récupérer le solde actuel de l'utilisateur
    const currentBalance = await getBalance(userId);

    // Si currentBalance est NaN ou non valide, on le remet à 0
    if (isNaN(currentBalance)) {
        throw new Error("Failed to retrieve the user's balance.");
    }

    // Calcul du nouveau solde basé sur l'ajout ou le retrait
    let newBalance = type === 'add' ? currentBalance + amount : currentBalance - amount;

    // Insérer ou mettre à jour l'utilisateur dans la base de données
    await promisePool.query(
        "INSERT INTO fee (id_user, silver) VALUES (?, ?) ON DUPLICATE KEY UPDATE silver = ?",
        [userId, newBalance, newBalance]
    );

    return newBalance;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fee')
        .setDescription("Add or remove fee value.")
        .addStringOption(option => 
            option.setName('type')
                .setDescription('Type of transaction: add or remove')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                )
        )
        .addUserOption(option => 
            option.setName('user')
                .setDescription("User")
                .setRequired(true)
        )
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription("Amount to add/remove")
                .setRequired(true)
        ),
    
    async execute(interaction) {
        const { client, options, user } = interaction;
        const type = options.getString('type');
        const targetUser = options.getUser('user');
        const amount = options.getInteger('amount');

        if (amount <= 0) {
            return interaction.reply({ content: "Silver need to be higher than 0.", flags: [MessageFlags.Ephemeral] });
        }

        try {
            const newBalance = await updateBalance(targetUser.id, amount, type);
            
            const dev = await getUserInfo(client, dev_id);
            const footerText = dev ? `Dev by ${dev.username}` : `Dev information unavailable`;
            const footerIcon = dev ? dev.avatarURL : null;

            const embed = new EmbedBuilder()
                .setColor(type === 'add' ? '#00FF00' : '#FF0000')
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }) })
                .setTitle(`Transaction ${type === 'add' ? 'Add' : 'Remove'}`)
                .setDescription(`💰 **${type === 'add' ? 'Added' : 'Removed'} ${formatNumber(amount)}** silver to ${targetUser.username}.
                🔄 New balance: **${formatNumber(newBalance)}** silver.`)
                .setFooter({ text: footerText, iconURL: footerIcon })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            return interaction.reply({ content: "Erreur : " + error.message, flags: [MessageFlags.Ephemeral] });
        }
    },
};
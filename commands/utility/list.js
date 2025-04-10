const path = require('node:path');
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dev_id = "506045516421791744";
const { pool, promisePool } = require(path.join(__dirname, '../../db'));  // Importer le pool depuis db.js

async function getUserInfo(client, userId) {
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

function formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription("List information on users.")
        .addStringOption(option => 
            option.setName('type')
                .setDescription('Type of information.')
                .setRequired(true)
                .addChoices(
                    { name: 'Users Fee', value: 'usersFee' },
                    { name: 'Users Stats', value: 'usersStats' }
                )
        ),

    async execute(interaction) {
        const { client, options, user } = interaction;
        const type = interaction.options.getString('type');

        try {
            let query;
            if (type === 'usersFee') {
                query = "SELECT id_user, silver FROM fee ORDER BY silver DESC";
            } else if (type === 'usersStats') {
                query = "SELECT id, username, messages_sent, level FROM users";
            } else {
                return interaction.reply({ content: "Invalid type.", flags: [MessageFlags.Ephemeral] });
            }

            const [rows] = await promisePool.query(query);

            if (rows.length === 0) {
                return interaction.reply({ content: "No user find.", flags: [MessageFlags.Ephemeral] });
            }

            // Récupérer les infos du développeur
            const dev = await getUserInfo(client, dev_id);
            const footerText = dev ? `Dev by ${dev.username}` : `Dev information unavailable`;
            const footerIcon = dev ? dev.avatarURL : null;

            const itemsPerPage = 25;
            let currentPage = 0;
            const totalPages = Math.ceil(rows.length / itemsPerPage);

            function generateEmbed(page) {
                const embed = new EmbedBuilder()
                    .setTitle(`${type === 'usersFee' ? '💰 Users fee' : '📊 Users stats'}`)
                    .setColor('#0099ff')
                    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }) })
                    .setFooter({ text: footerText, iconURL: footerIcon })
                    .setTimestamp();

                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageUsers = rows.slice(start, end);

                pageUsers.forEach(userRow => {

                    const userId = String(userRow.id_user || userRow.id);
                    const fieldValue = type === 'usersFee'
                        ? formatNumber(userRow.silver)
                        : `👤 Username: ${userRow.username}\n💬 Messages sent: ${userRow.messages_sent}\n📊 Level: ${userRow.level}`;

                    embed.addFields({
                        name: ``,
                        value: `<@${userId}> : ${fieldValue}`,
                        inline: false
                    });
                });

                return embed;
            }

            function generateButtons(page) {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('⏪ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    
                    new ButtonBuilder()
                        .setCustomId('spacer1')
                        .setLabel('‎') // Invisible character
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId('page')
                        .setLabel(`Page ${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId('spacer2')
                        .setLabel('‎') // Invisible character
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),

                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next ⏩')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1)
                );
            }

            await interaction.reply({
                embeds: [generateEmbed(currentPage)],
                components: [generateButtons(currentPage)]
            });

            const message = await interaction.fetchReply();

            const collector = message.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (btnInteraction) => {
                if (btnInteraction.user.id !== interaction.user.id) {
                    return btnInteraction.reply({ content: "You can't interact with this pagination.", ephemeral: true });
                }

                if (btnInteraction.customId === 'prev' && currentPage > 0) {
                    currentPage--;
                } else if (btnInteraction.customId === 'next' && currentPage < totalPages - 1) {
                    currentPage++;
                }

                await btnInteraction.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [generateButtons(currentPage)]
                });
            });

            collector.on('end', async () => {
                await message.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            console.error(error);
            interaction.reply({ content: "Error with database.", ephemeral: true });
        }
    }
};

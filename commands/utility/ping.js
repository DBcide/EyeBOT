const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const dev_id = "506045516421791744";

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with bot latency in an embed!'),
    async execute(interaction) {
        const { client, user } = interaction;

        const start = Date.now();

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const latency = Date.now() - start;

        let apiLatency = Math.round(client.ws.ping);
        if (apiLatency === -1) apiLatency = "Unavailable"; else apiLatency = `${apiLatency}ms`;

        const dev = await getUserInfo(client, dev_id);

        const footerText = dev ? `Dev by ${dev.username}` : `Dev information unavailable`;
        const footerIcon = dev ? dev.avatarURL : null;

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }) })
            .setTitle('🔄 Latency!')
            .setDescription(`**Bot Latency:** \`${latency}ms\`\n**API Latency:** \`${apiLatency}\``)
            .setFooter({ text: footerText, iconURL: footerIcon })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

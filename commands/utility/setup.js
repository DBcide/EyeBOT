const path = require('node:path');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { pool, promisePool } = require(path.join(__dirname, '../../db'));  // Importer le pool depuis db.js
const dev_id = "506045516421791744";

async function getUserInfo(userId, interaction) {
    try {
        const user = await interaction.client.users.fetch(userId);
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
        .setName('setup')
        .setDescription(`Setup BOT config and Timer's config !`)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const user = interaction.user;
        const dev = await getUserInfo(dev_id, interaction);

        const setupEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setAuthor({
            name: user.username,
            iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }),
          })
        .setTitle('⚙️ BOT Config')
        .setDescription(`Please select what you want to config :\n\n**🔧 Admin Config**\n> (Logs channel, roles permissions...)\n\n**🎮 Timer's Config**\n> (Number, hours, channels...)`)
        .setFooter({
            text: `Dev by ${dev.username}`,
            iconURL: `${dev.avatarURL}`,
          })
        .setTimestamp(); 
                
        // Création des boutons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_admin')
                    .setLabel('🔧 Admin')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('setup_sessions')
                    .setLabel('🎮 Sessions')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.reply({ embeds: [setupEmbed], components: [row] });
    },

    //Button Handler
    async setupButtonHandler(interaction) {
        const customId = interaction.customId;
        
        // getCommand[0] = nom de la commande !
        const getCommand = customId.split('_')[0];
        const getActualEvent = customId.split('_').pop();

        try {
            if (getCommand === 'setup') {
                if (getActualEvent === 'admin') {
                    await configureAdmin(interaction);
                } else if (getActualEvent === 'sessions') {
                    await configureSessions(interaction);
                } else if (getActualEvent === 'page') {
                    const page = parseInt(customId.split('_')[1], 10);

                    const type = customId.split('_')[2];

                    if (type === 'admin') {
                        await configureAdmin(interaction, page);
                    } else if (type === 'sessions') {
                        await configureSessions(interaction, page);
                    }
                }
            }

        } catch (error) {
            console.error(`❌ Erreur lors du traitement du bouton ${interaction.customId}:`, error);
            await interaction.reply({ content: "⚠️ Une erreur est survenue.", flags: [MessageFlags.Ephemeral] });
        }
    },

    //String Menu Handler
    async setupStringMenuHandler(interaction) {
        const customId = interaction.customId;
        
        // getCommand[0] = nom de la commande !
        const getCommand = customId.split('_')[0];
        const getActualEvent = customId.split('_').pop();

        try {
            if (getCommand === 'setup') {
                if (getActualEvent === 'logs') {
                    const channelId = interaction.values[0].toString();
                    const channelIdName = interaction.guild.channels.cache.get(channelId);
                    const guildId = interaction.guildId.toString();

                    try {
                        const [results] = await promisePool.query("SELECT log_channel_id FROM server_logs WHERE guild_id = ?", [guildId]);

                        if (results.length > 0) {
                            // Un salon est déjà enregistré, vérifier s'il est différent
                            if (results[0].log_channel_id === channelId) {
                                await interaction.reply({ content: "❌ This channel is already the logs channel !", flags: [MessageFlags.Ephemeral] });
                                interaction.message.delete()
                                return;
                            }
                
                            // Mettre à jour l'ancien salon avec le nouveau
                            await promisePool.query("UPDATE server_logs SET log_channel_id = ? WHERE guild_id = ?", [channelId, guildId]);
                            await interaction.reply({ content: `🔄 Channel change for ${channelIdName.name} !`, flags: [MessageFlags.Ephemeral] });
                            interaction.message.delete()
                            return;
                        }

                        var sql = `INSERT INTO server_logs (guild_id, log_channel_id) VALUES (?, ?)`;
                        await promisePool.query(sql, [guildId, channelId]);
                        await interaction.reply({ content: `✅ ${channelIdName.name} is now your logs channel !`, flags: [MessageFlags.Ephemeral] });
                        interaction.message.delete()

                    } catch (error) {
                        console.error(`❌ Erreur lors de l'insertion en base de donnée ${interaction.customId}:`, error);
                        await interaction.reply({ content: "⚠️ Data base insertion error.", flags: [MessageFlags.Ephemeral] });
                        interaction.message.delete()
                    }
                }
            } else if (getActualEvent === 'sessions') {
                const channelId = interaction.values[0].toString();
                const channelIdName = interaction.guild.channels.cache.get(channelId);
                const guildId = interaction.guildId.toString();

                try {
                    const [results] = await promisePool.query("SELECT channel_id FROM sessionsChannel WHERE guild_id = ?", [guildId]);

                    if (results.length > 0) {
                        // Un salon est déjà enregistré, vérifier s'il est différent
                        if (results[0].channel_id === channelId) {
                            await interaction.reply({ content: "❌ This channel is already a sessions channel, please select an other one or delete this one !", flags: [MessageFlags.Ephemeral] });
                            interaction.message.delete()
                            return;
                        }
                    }

                    var sql = `INSERT INTO sessionsChannel (guild_id, channel_id) VALUES (?, ?)`;
                    await promisePool.query(sql, [guildId, channelId]);
                    await interaction.reply({ content: `✅ ${channelIdName.name} is now your logs channel !`, flags: [MessageFlags.Ephemeral] });

                } catch (error) {
                    console.error(`❌ Erreur lors de l'insertion en base de donnée ${interaction.customId}:`, error);
                    await interaction.reply({ content: "⚠️ Data base insertion error.", flags: [MessageFlags.Ephemeral] });
                    interaction.message.delete()
                }
            }

        } catch (error) {
            console.error(`❌ Erreur lors du traitement du menu déroulant ${interaction.customId}:`, error);
            await interaction.reply({ content: "⚠️ Une erreur est survenue.", flags: [MessageFlags.Ephemeral] });
        }
    }
};

// Configuration Admin
async function configureAdmin(interaction, page = 0) {
    const user = interaction.user;
    const dev = await getUserInfo(dev_id, interaction);

    const adminEmbed = new EmbedBuilder()
        .setColor('#ff9900')
        .setAuthor({
            name: user.username,
            iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }),
        })
        .setTitle('🔧 Logs Channel')
        .setDescription('Choose a channel for logs.')
        .setFooter({
            text: `Dev by ${dev.username}`,
            iconURL: `${dev.avatarURL}`,
          })
        .setTimestamp();

    // Récupérer les salons textuels du serveur
    const channels = interaction.guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildText)
        .map(channel => ({
            label: `#${channel.name}`,
            value: channel.id
        }));

    const maxMenusPerPage = 3; // Discord limite à 5 menus max
    const itemsPerMenu = 25; // Un menu peut contenir 25 salons
    const itemsPerPage = maxMenusPerPage * itemsPerMenu; // 125 salons par page
    const totalPages = Math.ceil(channels.length / itemsPerPage); // Nombre total de pages

    const startIndex = page * itemsPerPage;
    const paginatedChannels = channels.slice(startIndex, startIndex + itemsPerPage);

    const rows = [];
    
    for (let i = 0; i < paginatedChannels.length; i += itemsPerMenu) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`setup_${page}_${i / itemsPerMenu + 1}_logs`)
            .setPlaceholder(`Select a Channel (${startIndex + i + 1}-${Math.min(startIndex + i + 25, channels.length)})`)
            .addOptions(paginatedChannels.slice(i, i + itemsPerMenu));

        rows.push(new ActionRowBuilder().addComponents(menu));
    }

    // Ajouter les boutons de navigation si plusieurs pages
    if (totalPages > 1) {
        const buttonRow = new ActionRowBuilder();
        
        if (page > 0) {
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_${page - 1}_admin_page`)
                    .setLabel('⬅️ Previous page')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (page < totalPages - 1) {
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_${page + 1}_admin_page`)
                    .setLabel('➡️ Next page')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        rows.push(buttonRow);
    }

    await interaction.update({ embeds: [adminEmbed], components: rows });
}



// Configuration des Sessions
async function configureSessions(interaction, page=0) {

    const user = interaction.user;
    const dev = await getUserInfo(dev_id, interaction);

    const sessionEmbed = new EmbedBuilder()
        .setColor('#ff9900')
        .setAuthor({
            name: user.username,
            iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }),
        })
        .setTitle('🔧 Sessions Channel')
        .setDescription('Choose a channel for 1 Session.')
        .setFooter({
            text: `Dev by ${dev.username}`,
            iconURL: `${dev.avatarURL}`,
          })
        .setTimestamp();

    // Récupérer les salons textuels du serveur
    const channels = interaction.guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildText)
        .map(channel => ({
            label: `#${channel.name}`,
            value: channel.id
        }));

    const maxMenusPerPage = 3; // Discord limite à 5 menus max
    const itemsPerMenu = 25; // Un menu peut contenir 25 salons
    const itemsPerPage = maxMenusPerPage * itemsPerMenu; // 125 salons par page
    const totalPages = Math.ceil(channels.length / itemsPerPage); // Nombre total de pages

    const startIndex = page * itemsPerPage;
    const paginatedChannels = channels.slice(startIndex, startIndex + itemsPerPage);

    const rows = [];
    
    for (let i = 0; i < paginatedChannels.length; i += itemsPerMenu) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`setup_${page}_${i / itemsPerMenu + 1}_sessions`)
            .setPlaceholder(`Select a Channel (${startIndex + i + 1}-${Math.min(startIndex + i + 25, channels.length)})`)
            .addOptions(paginatedChannels.slice(i, i + itemsPerMenu));

        rows.push(new ActionRowBuilder().addComponents(menu));
    }

    // Ajouter les boutons de navigation si plusieurs pages
    if (totalPages > 1) {
        const buttonRow = new ActionRowBuilder();
        
        if (page > 0) {
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_${page - 1}_sessions_page`)
                    .setLabel('⬅️ Previous page')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (page < totalPages - 1) {
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_${page + 1}_sessions_page`)
                    .setLabel('➡️ Next page')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        rows.push(buttonRow);
    }

    await interaction.update({ embeds: [sessionEmbed], components: rows });
}

async function sessionsTimer(interaction) {
    const user = interaction.user;
    const dev = await getUserInfo(dev_id, interaction);

    const sessionTimerEmbed = new EmbedBuilder()
        .setColor('#00cc66')
        .setTitle('🎮 Sessions Config')
        .setDescription('Set start hour, end hour and channel for sessions')
        .setFooter({
            text: `Dev by ${dev.username}`,
            iconURL: `${dev.avatarURL}`,
          })
        .setTimestamp();

    const modal = new ModalBuilder()
        .setCustomId('session_modal')
        .setTitle('Configuration des Sessions')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('start_time')
                    .setLabel('Heure de début (HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 18:00')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('end_time')
                    .setLabel('Heure de fin (HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 20:00')
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}
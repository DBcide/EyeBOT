// Print information about : Items / Spells / Build (on the actual server)

const path = require('node:path');
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { dev_id } = require(path.join(__dirname,'../../config'));
const { pool, promisePool } = require(path.join(__dirname, '../../db'));

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


module.exports = {
    data: new SlashCommandBuilder()
        .setName('show')
        .setDescription("Give information about Items, Spells and Builds.")
        .addStringOption(option => 
            option.setName('type')
                .setDescription('Type of information.')
                .setRequired(true)
                .addChoices(
                    { name: 'Items', value: 'item' },
                    { name: 'Spells', value: 'spell' },
                    { name: 'Builds', value: 'build' }
                )
        )
        .addStringOption(option => 
            option.setName('name')
                .setDescription('Name of what you search.')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('tier')
                .setDescription('Choose the Tier between 4 and 8.')
                .setRequired(false)
                .addChoices(
                    { name: 'Tier 4', value: 4 },
                    { name: 'Tier 5', value: 5 },
                    { name: 'Tier 6', value: 6 },
                    { name: 'Tier 7', value: 7 },
                    { name: 'Tier 8', value: 8 }
                )
        )
        .addIntegerOption(option =>
            option.setName('enchantment')
                .setDescription('Choose the enchantment of your item.')
                .setRequired(false)
                .addChoices(
                    { name: 'Enchant .0', value: 0 },
                    { name: 'Enchant .1', value: 1 },
                    { name: 'Enchant .2', value: 2 },
                    { name: 'Enchant .3', value: 3 },
                    { name: 'Enchant .4', value: 4 }
                )
        )
        .addStringOption(option =>
            option.setName('quality')
                .setDescription('Choose the quality of your item.')
                .setRequired(false)
                .addChoices(
                    { name: 'Normal', value: '1' },
                    { name: 'Good', value: '2' },
                    { name: 'Outstanding', value: '3' },
                    { name: 'Excellent', value: '4' },
                    { name: 'Masterpiece', value: '5' }
                )
        ),

    async execute(interaction) {
        const { client, options, user } = interaction;

        try {
            const dev = await getUserInfo(client, dev_id);
            const footerText = dev ? `Dev by ${dev.username}` : `Dev information unavailable`;
            const footerIcon = dev ? dev.avatarURL : null;

            const type = interaction.options.getString('type');
            const name = interaction.options.getString('name');

            switch (type) {
                case 'item': {
                    const tier = interaction.options.getInteger('tier') ?? 4;
                    const enchantment = interaction.options.getInteger('enchantment') ?? 0;
                    const quality = interaction.options.getString('quality') ?? '1';

                    const qualityMap = {
                        "1": "Normal",
                        "2": "Good",
                        "3": "Outstanding",
                        "4": "Excellent",
                        "5": "Masterpiece"
                    };

                    const enchantmentMap = {
                        0: "Common (.0)",
                        1: "Uncommon (.1)",
                        2: "Rare (.2)",
                        3: "Exceptional (.3)",
                        4: "Pristine (.4)"
                    };

                    // 👉 Renommé rows en itemRows
                    const [itemRows] = await promisePool.query(
                        `SELECT items.*, itemsTypes.img AS type_prefix
                         FROM items
                         LEFT JOIN itemsTypes ON items.item_type_id = itemsTypes.id
                         WHERE items.name = ?
                         LIMIT 1`,
                        [name]
                    );

                    if (itemRows.length === 0) {
                        return interaction.reply({ content: `Item "${name}" not found.`, flags: [MessageFlags.Ephemeral] });
                    }

                    const item = itemRows[0];
                    const prefix = item.type_prefix;
                    const suffix = item.img;
                    const itemId = `T${tier}_${prefix ? `${prefix}_` : ''}${suffix}@${enchantment}`;
                    const itemImageUrl = `https://render.albiononline.com/v1/item/${itemId}.png?quality=${quality}`;

                    const itemEmbed = new EmbedBuilder()
                        .setTitle(`Item: ${item.name}`)
                        .setColor('#00FF00')
                        .setThumbnail(itemImageUrl)
                        .addFields(
                            { name: 'Tier', value: `T${tier}`, inline: true },
                            { name: 'Enchantment', value: enchantmentMap[enchantment] ?? `.${enchantment}`, inline: true },
                            { name: 'Quality', value: qualityMap[quality] ?? 'Unknown', inline: true }
                        )
                        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }) })
                        .setFooter({ text: footerText, iconURL: footerIcon })
                        .setTimestamp();

                    // === Début : Récupération et tri des sorts liés ===
                    const [spellRows] = await promisePool.query(
                        `SELECT 
                        s.name,
                        s.img,
                        s.specialName,
                        s.slot,
                        s.idEmoji
                        FROM (
                        SELECT 
                            s.id,
                            s.name,
                            s.img,
                            s.specialName,
                            islot.slot,
                            s.idEmoji
                        FROM item_spells AS islot
                        JOIN spells AS s ON s.id = islot.spell_id
                        WHERE islot.item_id = ?

                        UNION

                        SELECT 
                            s.id,
                            s.name,
                            s.img,
                            s.specialName,
                            wts.slot,
                            s.idEmoji
                        FROM items AS i
                        JOIN weapon_types AS wt ON wt.id = i.weapon_type_id
                        JOIN weapon_type_spells AS wts ON wts.weapon_type_id = wt.id
                        JOIN spells AS s ON s.id = wts.spell_id
                        WHERE i.id = ? AND i.weapon_type_id IS NOT NULL

                        UNION

                        SELECT 
                            s.id,
                            s.name,
                            s.img,
                            s.specialName,
                            ats.slot,
                            s.idEmoji
                        FROM items AS i
                        JOIN armor_types AS at ON at.id = i.armor_type_id
                        JOIN armor_type_spells AS ats ON ats.armor_type_id = at.id
                        JOIN spells AS s ON s.id = ats.spell_id
                        WHERE i.id = ? AND i.armor_type_id IS NOT NULL

                        UNION

                        SELECT 
                            s.id,
                            s.name,
                            s.img,
                            s.specialName,
                            islot.slot,
                            s.idEmoji
                        FROM shape_item_spells AS islot
                        JOIN spells AS s ON s.id = islot.spell_id
                        WHERE islot.item_id = ?
                        ) AS s;
                        `,
                        [item.id, item.id, item.id, item.id]
                    );
                    
                    // 1️⃣ Détection de la suite Q-W-P dans l’ordre initial
                    let shapeshifterSequence = [];
                    if (spellRows.length >= 3) {
                        const lastThree = spellRows.slice(-3);
                        const slots = lastThree.map(spell => (spell.slot || '').toUpperCase());
                        if (slots[0] === 'Q' && slots[1] === 'W' && slots[2] === 'P') {
                        // on extrait ces 3 sorts
                        shapeshifterSequence = spellRows
                            .splice(-3, 3)
                            .map(spell => ({
                            name: spell.name,
                            emojiName: (spell.specialName || spell.img.toLowerCase()),
                            emojiId: spell.idEmoji  // <— ici on prend le vrai Snowflake
                            }));
                        }
                    }
                    
                    // 2️⃣ Tri des sorts restants
                    const sortedSpells = { Q: [], W: [], E: [], P: [] };
                    for (const spell of spellRows) {
                        const slot = (spell.slot || '').toUpperCase();
                        if (!['Q','W','E','P'].includes(slot)) continue;
                        sortedSpells[slot].push({
                        name: spell.name,
                        emojiName: (spell.specialName || spell.img.toLowerCase()),
                        emojiId: spell.idEmoji
                        });
                    }
                    
                    // 3️⃣ Construction des rangées de boutons
                    const componentRows = [];
                    function makeRow(buttons) {
                        return new ActionRowBuilder().addComponents(
                            buttons.map(btn =>
                                new ButtonBuilder()
                                .setCustomId(`spell_info:${btn.name}`)
                                .setLabel(btn.name)
                                .setEmoji(`<:${btn.emojiName}:${btn.emojiId}>`)
                                .setStyle(ButtonStyle.Secondary)
                            )
                        );
                    }
                    
                    // Ajout des rangées Q, W, E, P
                    for (const key of ['Q','W','E','P']) {
                        const spells = sortedSpells[key];
                        if (spells.length) {
                            for (let i = 0; i < spells.length; i += 5) {
                                const slice = spells.slice(i, i + 5);
                                componentRows.push(makeRow(slice));
                            }
                        }
                    }
                    
                    // 4️⃣ Séquence shapeshifter en dernière rangée
                    if (shapeshifterSequence.length === 3) {
                        componentRows.push(makeRow(shapeshifterSequence));
                    }
                    
                    return interaction.reply({
                        embeds: [itemEmbed],
                        components: componentRows
                    });
                    // === Fin : Récupération et tri des sorts liés ===  
  
                }

                case 'spell': {
                    // 👉 Pas de conflit ici, nouveau nom spellRowsSingle
                    const [spellRowsSingle] = await promisePool.query(
                        `SELECT * FROM spells WHERE spells.name = ? LIMIT 1`,
                        [name]
                    );
                    if (spellRowsSingle.length === 0) {
                        return interaction.reply({ content: `Spell "${name}" not found.`, flags: [MessageFlags.Ephemeral] });
                    }
                    const spell = spellRowsSingle[0];
                    const spellImageUrl = `https://render.albiononline.com/v1/spell/${spell.img}.png`;
                    const spellEmbed = new EmbedBuilder()
                        .setTitle(`Spell: ${spell.name}`)
                        .setDescription(`**Name:** ${name}`)
                        .setColor('#00FF00')
                        .setThumbnail(spellImageUrl)
                        .addFields(
                            { name: 'Description at 1100 IP', value: spell.description, inline: false },
                            { name: 'Note', value: 'Tier, Enchantment, and Quality are only used with Items.', inline: false }
                        )
                        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true, size: 512 }) })
                        .setFooter({ text: footerText, iconURL: footerIcon })
                        .setTimestamp();
                    return interaction.reply({ embeds: [spellEmbed] });
                }

                case 'build':
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error("❌ Erreur sur show:", error, "Id : ", emoji.id);
            return interaction.reply({ content: "Error with this command, please contact support.", flags: [MessageFlags.Ephemeral] });
        }
    }
};
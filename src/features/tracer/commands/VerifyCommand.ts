import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlagsBitField,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { tracerI18n } from '../i18n';
import { buildVerificationNotificationEmbed, buildVerificationReportEmbed } from '../embeds';

/**
 * Commande /verify réservée au propriétaire du bot pour vérifier les personnages Albion
 *
 * @remarks
 * Processus de vérification:
 * 1. Vérification que l'exécuteur est le propriétaire du bot (OWNER_ID)
 * 2. Recherche du personnage par nom (insensible à la casse) parmi ceux de l'utilisateur cible
 * 3. Refus si déjà vérifié
 * 4. Suppression des autres revendications + marquage is_verified = 1 (transaction)
 * 5. Rapport à l'administrateur (dans sa langue)
 * 6. Notification en MP à l'utilisateur vérifié (dans SA langue enregistrée)
 *
 * Opération irréversible : une fois vérifié, impossible de "dévérifier".
 */
export default class VerifyCommand extends BaseCommand {
    public name = 'verify';
    public description = tracerI18n.default('commands.verify.description');

    private readonly tracerService: TracerService;
    private readonly logger: LoggerService;
    /** ID Discord du propriétaire du bot, seul autorisé à vérifier un personnage */
    private readonly OWNER_ID = '506045516421791744';

    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.tracerService = new TracerService();
    }

    /**
     * Construit la définition de la commande slash
     *
     * @remarks
     * Options: discord_id (propriétaire) et personnage (nom exact, casse ignorée).
     * Pas de restriction de permission Discord : le contrôle est fait dans execute().
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(tracerI18n.localizations('commands.verify.description'))
            .addStringOption((option) =>
                option
                    .setName('discord_id')
                    .setDescription(tracerI18n.default('commands.verify.options.discordId'))
                    .setDescriptionLocalizations(tracerI18n.localizations('commands.verify.options.discordId'))
                    .setRequired(true)
            )
            .addStringOption((option) =>
                option
                    .setName('personnage')
                    .setDescription(tracerI18n.default('commands.verify.options.character'))
                    .setDescriptionLocalizations(tracerI18n.localizations('commands.verify.options.character'))
                    .setRequired(true)
            ) as SlashCommandBuilder;
    }

    /**
     * Exécute la commande /verify
     *
     * @param interaction - L'interaction Discord de la commande slash
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const t = tracerI18n.for(await this.resolveLocale(interaction));

        if (interaction.user.id !== this.OWNER_ID) {
            await interaction.reply({
                content: t('verify.noPermission'),
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        const targetUserId = interaction.options.getString('discord_id', true);
        const characterName = interaction.options.getString('personnage', true);

        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            const userCharacters = await this.tracerService.getRegisteredUsers(targetUserId);

            if (userCharacters.length === 0) {
                await interaction.editReply({ content: t('verify.noCharacters', { userId: targetUserId }) });
                return;
            }

            const character = userCharacters.find(
                (char) => char.albion_name.toLowerCase() === characterName.toLowerCase()
            );

            if (!character) {
                await interaction.editReply({
                    content: t('verify.characterNotLinked', {
                        name: characterName,
                        userId: targetUserId,
                        characters: userCharacters.map((char) => `• ${char.albion_name}`).join('\n'),
                    }),
                });
                return;
            }

            if (character.is_verified === 1) {
                await interaction.editReply({
                    content: t('verify.alreadyVerified', { name: character.albion_name, userId: targetUserId }),
                });
                return;
            }

            const allClaims = await this.tracerService.getAllClaimsForCharacter(character.albion_id);
            const duplicateClaims = allClaims.filter((claim) => claim.discord_id !== targetUserId);

            await this.tracerService.verifyCharacter(targetUserId, character.albion_id);

            await interaction.editReply({
                embeds: [buildVerificationReportEmbed(t, targetUserId, character, duplicateClaims, {
                    tag: interaction.user.tag,
                    avatarURL: interaction.user.displayAvatarURL(),
                })],
            });

            try {
                const targetUser = await interaction.client.users.fetch(targetUserId);
                // Le MP est lu par l'utilisateur vérifié : sa langue, pas celle de l'administrateur
                const targetT = tracerI18n.for(
                    await ServiceContainer.getInstance().locale.resolveForUser(targetUserId)
                );

                await targetUser.send({ embeds: [buildVerificationNotificationEmbed(targetT, character)] });

                this.logger.success(
                    `Notification de vérification envoyée en DM à l'utilisateur ${targetUserId}`,
                    'tracer'
                );
            } catch (dmError) {
                this.logger.warn(
                    `Impossible d'envoyer un DM à l'utilisateur ${targetUserId} - Peut-être ses DMs sont fermés`,
                    'tracer'
                );
            }

            this.logger.success(
                `Personnage ${character.albion_name} vérifié pour l'utilisateur ${targetUserId} par ${interaction.user.tag}`,
                'tracer'
            );
        } catch (error) {
            this.logger.error('Erreur lors de la vérification du personnage', 'tracer', error);
            await interaction.editReply({ content: t('verify.error') });
        }
    }
}

import {
    ChatInputCommandInteraction,
    MessageFlagsBitField,
    SlashCommandBuilder,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { LOCALES, SUPPORTED_LOCALES, isSupportedLocale } from '../../../shared/i18n';
import { settingsTranslations } from '../translations';

/** Valeur de l'option pour revenir à la langue du client Discord */
const AUTO_VALUE = 'auto';

/**
 * Commande /language : choix de la langue des réponses du bot
 *
 * @remarks
 * - Une langue explicite est enregistrée en base (table user_preferences)
 * - "Automatique" supprime la préférence : le bot suit alors la langue du client Discord
 * - Les choix proposés sont générés depuis LOCALES : ajouter une langue l'ajoute ici automatiquement
 *   (relancer `npm run register` pour mettre à jour la commande chez Discord)
 */
export default class LanguageCommand extends BaseCommand {
    public name = 'language';
    public description = settingsTranslations.defaultText('commands.language.description');

    /**
     * Construit la commande avec une option à choix (une par langue + automatique)
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(settingsTranslations.discordLocalizations('commands.language.description'))
            .addStringOption((option) =>
                option
                    .setName('language')
                    .setDescription(settingsTranslations.defaultText('commands.language.options.language'))
                    .setDescriptionLocalizations(settingsTranslations.discordLocalizations('commands.language.options.language'))
                    .setRequired(true)
                    .addChoices(
                        {
                            name: settingsTranslations.defaultText('commands.language.auto'),
                            name_localizations: settingsTranslations.discordLocalizations('commands.language.auto'),
                            value: AUTO_VALUE,
                        },
                        // Libellé dans la langue elle-même ("English", "Français") : lisible par tous
                        ...SUPPORTED_LOCALES.map((locale) => ({ name: LOCALES[locale].label, value: locale }))
                    )
            ) as SlashCommandBuilder;
    }

    /**
     * Enregistre (ou réinitialise) la langue de l'utilisateur et confirme dans la nouvelle langue
     *
     * @param interaction - L'interaction Discord de la commande slash
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const localeService = ServiceContainer.getInstance().locale;
        const choice = interaction.options.getString('language', true);
        const newLocale = isSupportedLocale(choice) ? choice : null;

        try {
            await localeService.setUserLocale(interaction.user.id, newLocale);
        } catch (error) {
            ServiceContainer.getInstance().logger.error('Erreur lors de l\'enregistrement de la langue', 'i18n', error);
            const translate = settingsTranslations.forLocale(await this.resolveLocale(interaction));
            await interaction.reply({ content: translate('language.error'), flags: MessageFlagsBitField.Flags.Ephemeral });
            return;
        }

        // Après l'enregistrement : langue choisie, ou langue Discord en mode automatique
        const effectiveLocale = await this.resolveLocale(interaction);
        const translate = settingsTranslations.forLocale(effectiveLocale);
        const label = LOCALES[effectiveLocale].label;

        await interaction.reply({
            content: newLocale ? translate('language.updated', { language: label }) : translate('language.reset', { language: label }),
            flags: MessageFlagsBitField.Flags.Ephemeral,
        });
    }
}

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    ComponentType,
    MessageFlagsBitField,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { TracerService } from '../services/TracerService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { TracerUser } from '../models/AlbionTypes';
import { tracerI18n, TracerTranslator } from '../i18n';
import { buildCharacterSelectMenu } from '../components/SelectMenus';
import { buildCharacterSelectionEmbed, fromTracerUser } from '../embeds';
import { CharacterUpdateHandler } from '../handlers/CharacterUpdateHandler';
import { CharacterSyncService } from '../services/CharacterSyncService';
import { AlbionService } from '../services/AlbionService';

/**
 * Commande /update pour rafraîchir les informations d'un personnage Albion depuis l'API
 *
 * @remarks
 * Flux d'exécution:
 * 1. Récupère tous les personnages de l'utilisateur depuis la base de données
 * 2. Si 0 personnage → Message d'erreur + redirection vers /register
 * 3. Si 1 personnage → Mise à jour directe
 * 4. Si plusieurs → Menu de sélection (timeout 60s)
 * 5. Appel API Albion, mise à jour DB et du nickname Discord
 * 6. Embed de confirmation avec nouvelles stats
 *
 * Toutes les réponses sont éphémères et dans la langue de l'utilisateur.
 */
export default class UpdateCommand extends BaseCommand {
    public name = 'update';
    public description = tracerI18n.default('commands.update.description');

    private readonly tracerService: TracerService;
    private readonly updateHandler: CharacterUpdateHandler;
    private readonly logger: LoggerService;

    /**
     * @param albionService - Client API Albion (injection pour les tests)
     * @param tracerService - Accès aux personnages en base (injection pour les tests)
     * @param logger - Logger (injection pour les tests)
     */
    constructor(albionService?: AlbionService, tracerService?: TracerService, logger?: LoggerService) {
        super();
        this.logger = logger ?? ServiceContainer.getInstance().logger;
        this.tracerService = tracerService ?? new TracerService(undefined, this.logger);
        this.updateHandler = new CharacterUpdateHandler(
            new CharacterSyncService(albionService, this.tracerService, this.logger),
            this.logger
        );
    }

    /**
     * Construit la définition de la commande slash (aucune option)
     */
    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDescriptionLocalizations(tracerI18n.localizations('commands.update.description'));
    }

    /**
     * Exécute la commande /update
     *
     * @param interaction - L'interaction Discord de la commande slash
     */
    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        const t = tracerI18n.for(await this.resolveLocale(interaction));

        try {
            const characters = await this.tracerService.getRegisteredUsers(interaction.user.id);

            if (characters.length === 0) {
                await interaction.editReply({ content: t('update.noCharacters') });
                return;
            }

            if (characters.length === 1) {
                await this.updateCharacter(interaction, t, characters[0]);
                return;
            }

            await this.showCharacterSelection(interaction, t, characters);
        } catch (error) {
            this.logger.error('Erreur lors de la mise à jour', 'tracer', error);
            await interaction.editReply({ content: t('update.error') });
        }
    }

    /**
     * Affiche un menu déroulant pour choisir le personnage à mettre à jour
     *
     * @param interaction - L'interaction Discord
     * @param t - Traductions dans la langue de l'utilisateur
     * @param characters - Personnages enregistrés de l'utilisateur
     *
     * @remarks
     * Timeout de 60 secondes, une seule sélection traitée, seul l'auteur peut choisir.
     */
    private async showCharacterSelection(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        characters: TracerUser[]
    ): Promise<void> {
        const views = characters.map(fromTracerUser);

        const response = await interaction.editReply({
            embeds: [buildCharacterSelectionEmbed(t, views)],
            components: [buildCharacterSelectMenu(t, views)],
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
        });

        // Le handler tourne après la fin de execute() : ses erreurs doivent être gérées ici
        collector.on('collect', async (selectInteraction) => {
            try {
                if (selectInteraction.user.id !== interaction.user.id) {
                    const clickerT = tracerI18n.for(
                        await ServiceContainer.getInstance().locale.resolveForInteraction(selectInteraction)
                    );
                    await selectInteraction.reply({
                        content: clickerT('common.menu.notForYou'),
                        flags: MessageFlagsBitField.Flags.Ephemeral,
                    });
                    return;
                }

                // Une seule sélection est traitée (évite des mises à jour concurrentes)
                collector.stop('selected');

                const selectedCharacter = characters.find((char) => char.albion_id === selectInteraction.values[0]);

                if (!selectedCharacter) {
                    await selectInteraction.update({
                        content: t('update.selectedCharacterNotFound'),
                        embeds: [],
                        components: [],
                    });
                    return;
                }

                await selectInteraction.deferUpdate();
                await this.updateCharacter(interaction, t, selectedCharacter);
            } catch (error) {
                this.logger.error('Erreur lors de la sélection du personnage', 'tracer', error);
                await this.safeEditReply(interaction, t('update.error'));
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason === 'time') {
                await this.safeEditReply(interaction, t('common.menu.timeout'));
            }
        });
    }

    /**
     * Met à jour un personnage et affiche le résultat (flux partagé avec /register)
     *
     * @see CharacterUpdateHandler
     */
    private async updateCharacter(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        character: TracerUser
    ): Promise<void> {
        await this.updateHandler.updateAndReply(interaction, t, character);
    }

    /**
     * Modifie la réponse éphémère sans jamais lever d'erreur
     */
    private async safeEditReply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
        try {
            await interaction.editReply({ content, embeds: [], components: [] });
        } catch (error) {
            this.logger.warn('Impossible de modifier la réponse de /update', 'tracer', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}

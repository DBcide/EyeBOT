import { ChatInputCommandInteraction } from 'discord.js';
import { CharacterSyncService } from '../services/CharacterSyncService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import { TracerUser } from '../models/AlbionTypes';
import { TracerTranslator } from '../i18n';
import { getAlbionApiErrorMessage } from '../utils/ErrorHandlers';
import { buildCharacterUpdatedEmbed, fromAlbionPlayer } from '../embeds';

/**
 * Flux "mettre à jour un personnage puis répondre à l'utilisateur", partagé entre commandes
 *
 * @remarks
 * Le dossier `handlers/` regroupe les flux d'interaction réutilisés par plusieurs commandes.
 * Il ne doit pas être placé dans `commands/` : Bot.ts y charge chaque fichier comme une commande.
 *
 * Utilisé par :
 * - /update : mise à jour du personnage choisi
 * - /register : quand le personnage est déjà lié au compte (ex: retour sur un serveur
 *   quitté, ou nouveau serveur utilisant le bot), on le met à jour au lieu d'afficher
 *   un simple message "déjà enregistré"
 */
export class CharacterUpdateHandler {
    private readonly syncService = new CharacterSyncService();
    private readonly logger: LoggerService = ServiceContainer.getInstance().logger;

    /**
     * Rafraîchit le personnage (API → DB → pseudo) et affiche le résultat
     *
     * @param interaction - Interaction déjà différée (deferReply) : la réponse passe par editReply
     * @param t - Traductions dans la langue de l'utilisateur
     * @param character - Le personnage à mettre à jour, tel qu'enregistré en base
     *
     * @remarks
     * Ne lève jamais d'erreur liée à la synchro : un 404 API ou une erreur (timeout,
     * rate limit, DB) est traduit en message pour l'utilisateur et loggé.
     */
    public async updateAndReply(
        interaction: ChatInputCommandInteraction,
        t: TracerTranslator,
        character: TracerUser
    ): Promise<void> {
        try {
            this.logger.debug(`Mise à jour du personnage ${character.albion_name} (ID: ${character.albion_id})`, 'tracer');

            const playerDetails = await this.syncService.syncCharacter(
                interaction.guild,
                interaction.user.id,
                character.albion_id
            );

            if (!playerDetails) {
                await interaction.editReply({
                    content: t('update.apiUnavailable', { name: character.albion_name }),
                    embeds: [],
                    components: [],
                });
                return;
            }

            await interaction.editReply({
                content: null,
                embeds: [buildCharacterUpdatedEmbed(t, fromAlbionPlayer(playerDetails))],
                components: [],
            });

            this.logger.success(`Personnage ${playerDetails.Name} mis à jour pour ${interaction.user.tag}`, 'tracer');
        } catch (error: any) {
            this.logger.error('Erreur lors de la mise à jour du personnage', 'tracer', error);

            await interaction.editReply({
                content: getAlbionApiErrorMessage(error, t),
                embeds: [],
                components: [],
            });
        }
    }
}

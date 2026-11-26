import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { TracerTranslator } from '../i18n';
import { formatFame } from '../utils/FameUtils';
import { MAX_SELECT_OPTIONS } from '../constants';
import { CharacterView } from '../embeds/types';

/**
 * Composants interactifs (menus déroulants) de la feature tracer
 *
 * Même principe que le dossier `embeds/` : construction pure, textes traduits via `t`.
 */

/** Un élément sélectionnable : les données affichées + la valeur renvoyée par Discord */
type SelectableCharacter = CharacterView & { id: string };

/**
 * Construit la ligne d'action contenant un menu de sélection de personnages
 *
 * @remarks
 * Discord limite un menu à 25 options : au-delà, seules les 25 premières sont proposées
 * (addOptions lèverait sinon une erreur).
 */
function buildCharacterMenu(
    customId: string,
    placeholder: string,
    characters: SelectableCharacter[],
    t: TracerTranslator,
    keys: { label: 'register.selection.optionLabel' | 'update.selection.optionLabel'; description: 'register.selection.optionDescription' | 'update.selection.optionDescription' }
): ActionRowBuilder<StringSelectMenuBuilder> {
    const options = characters.slice(0, MAX_SELECT_OPTIONS).map((character, index) => ({
        label: t(keys.label, { index: index + 1, name: character.name }),
        description: t(keys.description, {
            killFame: formatFame(character.killFame),
            guild: character.guildName || t('labels.noGuild'),
        }),
        value: character.id,
    }));

    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(options);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/**
 * Menu de choix du joueur Albion parmi les résultats de recherche (/register)
 *
 * @param t - Traductions dans la langue de l'utilisateur
 * @param players - Joueurs trouvés (valeur de l'option = ID Albion)
 */
export function buildPlayerSelectMenu(
    t: TracerTranslator,
    players: SelectableCharacter[]
): ActionRowBuilder<StringSelectMenuBuilder> {
    return buildCharacterMenu('select-player', t('register.selection.placeholder'), players, t, {
        label: 'register.selection.optionLabel',
        description: 'register.selection.optionDescription',
    });
}

/**
 * Menu de choix du personnage enregistré à mettre à jour (/update)
 *
 * @param t - Traductions dans la langue de l'utilisateur
 * @param characters - Personnages de l'utilisateur (valeur de l'option = ID Albion)
 */
export function buildCharacterSelectMenu(
    t: TracerTranslator,
    characters: SelectableCharacter[]
): ActionRowBuilder<StringSelectMenuBuilder> {
    return buildCharacterMenu('select-character-update', t('update.selection.placeholder'), characters, t, {
        label: 'update.selection.optionLabel',
        description: 'update.selection.optionDescription',
    });
}

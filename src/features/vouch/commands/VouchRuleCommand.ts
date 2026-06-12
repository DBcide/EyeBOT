import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    GuildMember,
    MessageFlagsBitField,
} from 'discord.js';
import { BaseCommand } from '../../../core/BaseCommand';
import { VouchService } from '../services/VouchService';
import { LoggerService } from '../../../shared/services/LoggerService';
import { ServiceContainer } from '../../../shared/services/ServiceContainer';
import {
    buildVouchRuleToggleEmbed,
    buildVouchRuleListEmbed,
    buildVouchRuleAddEmbed,
    buildVouchRuleActionEmbed,
    buildVouchRuleNotFoundEmbed,
} from '../utils/VouchEmbedBuilders';

/**
 * Commande /vouchrule — Gérer les règles de vouch d'un serveur Discord
 *
 * @remarks
 * Réservée aux membres ayant la permission **Administrateur** sur le serveur.
 *
 * **Sous-commandes** :
 * - `enable`  — Active la feature vouch sur ce serveur
 * - `disable` — Désactive la feature vouch sur ce serveur
 * - `add`     — Ajoute un prérequis de rôle
 * - `remove`  — Supprime un prérequis par son ID
 * - `modify`  — Modifie un prérequis existant par son ID
 * - `list`    — Affiche l'état et les règles actuelles
 *
 * **Logique des groupes de prérequis** :
 * - Au sein d'un groupe : opérateur AND (toutes les conditions doivent être remplies)
 * - Entre les groupes : opérateur OR (au moins un groupe doit être satisfait)
 */
export default class VouchRuleCommand extends BaseCommand {
    public name = 'vouchrule';
    public description = 'Gérer les règles de vouch pour ce serveur (Administrateur requis)';

    private readonly vouchService: VouchService;
    private readonly logger: LoggerService;

    constructor() {
        super();
        const services = ServiceContainer.getInstance();
        this.logger = services.logger;
        this.vouchService = new VouchService();
    }

    public buildCommand(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false)
            .addSubcommand(sub =>
                sub
                    .setName('enable')
                    .setDescription('Activer la feature vouch sur ce serveur')
            )
            .addSubcommand(sub =>
                sub
                    .setName('disable')
                    .setDescription('Désactiver la feature vouch sur ce serveur')
            )
            .addSubcommand(sub =>
                sub
                    .setName('add')
                    .setDescription('Ajouter un prérequis de rôle pour pouvoir voucher')
                    .addRoleOption(opt =>
                        opt
                            .setName('role')
                            .setDescription('Le rôle concerné par ce prérequis')
                            .setRequired(true)
                    )
                    .addStringOption(opt =>
                        opt
                            .setName('type')
                            .setDescription('Condition : doit posséder ou ne pas posséder ce rôle')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Doit posséder ce rôle', value: 'must_have' },
                                { name: 'Ne doit pas posséder ce rôle', value: 'must_not_have' }
                            )
                    )
                    .addIntegerOption(opt =>
                        opt
                            .setName('groupe')
                            .setDescription('Numéro de groupe (défaut: 1 — AND au sein, OR entre groupes)')
                            .setRequired(false)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('remove')
                    .setDescription('Supprimer un prérequis par son ID')
                    .addIntegerOption(opt =>
                        opt
                            .setName('id')
                            .setDescription('ID du prérequis à supprimer (visible avec /vouchrule list)')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('modify')
                    .setDescription('Modifier un prérequis existant (seuls les champs fournis sont mis à jour)')
                    .addIntegerOption(opt =>
                        opt
                            .setName('id')
                            .setDescription('ID du prérequis à modifier')
                            .setRequired(true)
                            .setMinValue(1)
                    )
                    .addRoleOption(opt =>
                        opt
                            .setName('role')
                            .setDescription('Nouveau rôle (optionnel)')
                            .setRequired(false)
                    )
                    .addStringOption(opt =>
                        opt
                            .setName('type')
                            .setDescription('Nouveau type de condition (optionnel)')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Doit posséder ce rôle', value: 'must_have' },
                                { name: 'Ne doit pas posséder ce rôle', value: 'must_not_have' }
                            )
                    )
                    .addIntegerOption(opt =>
                        opt
                            .setName('groupe')
                            .setDescription('Nouveau numéro de groupe (optionnel)')
                            .setRequired(false)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('list')
                    .setDescription('Afficher les règles de vouch actuelles de ce serveur')
            ) as SlashCommandBuilder;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // Commande réservée aux serveurs (setDMPermission(false) l'assure côté Discord)
        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ Cette commande doit être utilisée dans un serveur Discord.',
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        // Double-vérification côté serveur (setDefaultMemberPermissions peut être modifié par les admins)
        const member = interaction.member as GuildMember;
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                content: '❌ Vous devez être **Administrateur** du serveur pour utiliser cette commande.',
                flags: MessageFlagsBitField.Flags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'enable':  await this.handleEnable(interaction);  break;
                case 'disable': await this.handleDisable(interaction); break;
                case 'add':     await this.handleAdd(interaction);     break;
                case 'remove':  await this.handleRemove(interaction);  break;
                case 'modify':  await this.handleModify(interaction);  break;
                case 'list':    await this.handleList(interaction);    break;
                default:
                    await interaction.editReply({ content: '❌ Sous-commande inconnue.' });
            }
        } catch (error) {
            this.logger.error('Erreur lors de l\'exécution de /vouchrule', 'vouch', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue. Veuillez réessayer.',
            });
        }
    }

    /**
     * Active la feature vouch sur le serveur
     */
    private async handleEnable(interaction: ChatInputCommandInteraction): Promise<void> {
        await this.vouchService.enableGuild(interaction.guildId!);
        await interaction.editReply({
            embeds: [buildVouchRuleToggleEmbed(true, interaction.guild!.name)],
        });
    }

    /**
     * Désactive la feature vouch sur le serveur
     */
    private async handleDisable(interaction: ChatInputCommandInteraction): Promise<void> {
        await this.vouchService.disableGuild(interaction.guildId!);
        await interaction.editReply({
            embeds: [buildVouchRuleToggleEmbed(false, interaction.guild!.name)],
        });
    }

    /**
     * Ajoute un prérequis de rôle
     */
    private async handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
        const role = interaction.options.getRole('role', true);
        const type = interaction.options.getString('type', true) as 'must_have' | 'must_not_have';
        const group = interaction.options.getInteger('groupe') ?? 1;

        // Vérifier que le vouch est configuré pour ce serveur (crée si absent)
        const settings = await this.vouchService.getGuildSettings(interaction.guildId!);
        if (!settings) {
            await this.vouchService.enableGuild(interaction.guildId!);
        }

        const id = await this.vouchService.addRequirement(interaction.guildId!, role.id, type, group);

        await interaction.editReply({
            embeds: [buildVouchRuleAddEmbed(id, role.id, type, group)],
        });
    }

    /**
     * Supprime un prérequis par son ID
     */
    private async handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
        const requirementId = interaction.options.getInteger('id', true);

        const deleted = await this.vouchService.removeRequirement(requirementId, interaction.guildId!);

        if (!deleted) {
            await interaction.editReply({ embeds: [buildVouchRuleNotFoundEmbed(requirementId)] });
            return;
        }

        await interaction.editReply({ embeds: [buildVouchRuleActionEmbed('remove', requirementId)] });
    }

    /**
     * Modifie un prérequis existant
     */
    private async handleModify(interaction: ChatInputCommandInteraction): Promise<void> {
        const requirementId = interaction.options.getInteger('id', true);
        const role = interaction.options.getRole('role');
        const type = interaction.options.getString('type') as 'must_have' | 'must_not_have' | null;
        const group = interaction.options.getInteger('groupe');

        // Vérifier qu'au moins un champ est fourni
        if (!role && !type && group === null) {
            await interaction.editReply({
                content: '❌ Vous devez fournir au moins un champ à modifier (`role`, `type` ou `groupe`).',
            });
            return;
        }

        // Vérifier que le prérequis existe sur ce serveur
        const existing = await this.vouchService.getRequirementById(requirementId, interaction.guildId!);
        if (!existing) {
            await interaction.editReply({ embeds: [buildVouchRuleNotFoundEmbed(requirementId)] });
            return;
        }

        await this.vouchService.modifyRequirement(
            requirementId,
            interaction.guildId!,
            role?.id,
            type ?? undefined,
            group ?? undefined
        );

        await interaction.editReply({ embeds: [buildVouchRuleActionEmbed('modify', requirementId)] });
    }

    /**
     * Affiche les règles de vouch actuelles du serveur
     */
    private async handleList(interaction: ChatInputCommandInteraction): Promise<void> {
        const [settings, requirements] = await Promise.all([
            this.vouchService.getGuildSettings(interaction.guildId!),
            this.vouchService.getGuildRequirements(interaction.guildId!),
        ]);

        await interaction.editReply({
            embeds: [buildVouchRuleListEmbed(settings, requirements, interaction.guild!.name)],
        });
    }
}

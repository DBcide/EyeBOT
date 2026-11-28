import { featureGenerator } from '../../../tools/generators/feature/generator';
import { componentGenerator } from '../../../tools/generators/component/generator';
import { commandGenerator } from '../../../tools/generators/command/generator';
import { embedGenerator } from '../../../tools/generators/embed/generator';
import { GeneratorContext } from '../../../tools/generators/shared/text';
import { createContext, createFixtureProject, plannedContent, plannedFiles, removeFixture, withAnswers } from './fixture';

describe('generators/feature, component, command', () => {
    let root: string;
    let context: GeneratorContext;

    beforeEach(() => {
        root = createFixtureProject();
        context = createContext(root);
    });

    afterEach(() => removeFixture(root));

    describe('feature', () => {
        it('[positif] crée les dossiers (.gitkeep), les langues vides et translations.ts', () => {
            featureGenerator.plan(featureGenerator.fromInput({ name: 'encyclopedia', folders: ['commands', 'embeds'] }, '', context), context);

            expect(plannedFiles(context)).toEqual([
                '+ src/features/encyclopedia/commands/.gitkeep',
                '+ src/features/encyclopedia/embeds/.gitkeep',
                '+ src/features/encyclopedia/locales/fr.json',
                '+ src/features/encyclopedia/locales/en.json',
                '+ src/features/encyclopedia/locales/es.json',
                '+ src/features/encyclopedia/translations.ts',
            ]);
            expect(plannedContent(context, 'src/features/encyclopedia/locales/fr.json')).toBe('{}\n');
            const translations = plannedContent(context, 'src/features/encyclopedia/translations.ts');
            expect(translations).toContain('const catalogs: Record<Locale, EncyclopediaMessages> = { fr, en, es };');
            expect(translations).toContain('export type EncyclopediaTranslator = Translator<CommonMessages & EncyclopediaMessages>;');
        });

        it('[positif] mode interactif : dossiers exclus par numéro', async () => {
            const spec = await withAnswers(['demo', '2,5'], (prompter) => featureGenerator.interactive(prompter, context));

            expect(spec.folders).toEqual(['commands', 'embeds', 'events', 'models', 'services', 'utils']);
        });

        it('[extrême] feature existante ou dossier inconnu refusés', () => {
            expect(() => featureGenerator.fromInput({ name: 'tracer', folders: ['nope'] }, '', context))
                .toThrow(/la feature "tracer" existe déjà[\s\S]*folders\[0\]/);
        });

        it('[positif] le .gitkeep est supprimé quand le dossier reçoit un vrai fichier (lot)', () => {
            featureGenerator.plan(featureGenerator.fromInput({ name: 'encyclopedia' }, '[0]', context), context);
            const embed = { feature: 'encyclopedia', file: 'Item', name: 'Item', summary: 'Objet', title: 'Objet' };
            embedGenerator.plan(embedGenerator.fromInput(embed, '[1]', context), context);

            const files = plannedFiles(context);
            expect(files).toContain('+ src/features/encyclopedia/embeds/ItemEmbeds.ts');
            expect(files).not.toContain('+ src/features/encyclopedia/embeds/.gitkeep');
            expect(files).toContain('+ src/features/encyclopedia/utils/.gitkeep');
        });
    });

    describe('component', () => {
        const select = {
            feature: 'tracer',
            name: 'ItemCategory',
            kind: 'stringSelect',
            summary: 'Choix de la catégorie',
            placeholder: { fr: 'Choisissez', en: 'Choose' },
            options: [
                { value: 'weapons', label: 'Armes', emoji: '⚔️' },
                { value: 'armors', label: 'Armures', description: 'Casques et plastrons' },
            ],
        };

        it('[positif] menu à options fixes : custom ID exporté, textes traduits, test', () => {
            const report = componentGenerator.plan(componentGenerator.fromInput(select, '', context), context);
            const code = plannedContent(context, 'src/features/tracer/components/SelectMenus.ts');

            expect(code).toContain("import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';");
            expect(code).toContain("export const ITEM_CATEGORY_SELECT_ID = 'tracer-item-category';");
            expect(code).toContain("{ label: translate('itemCategory.weaponsLabel'), value: 'weapons', emoji: '\\u{2694}\\u{FE0F}' },");
            expect(plannedFiles(context)).toContain('+ tests/features/tracer/components/SelectMenus.test.ts');
            expect(report.usage).toContain('i.customId === ITEM_CATEGORY_SELECT_ID');
        });

        it('[positif] options dynamiques : data.options limité à 25', () => {
            const spec = componentGenerator.fromInput({ ...select, name: 'Results', options: 'dynamic' }, '', context);
            componentGenerator.plan(spec, context);

            expect(plannedContent(context, 'src/features/tracer/components/SelectMenus.ts')).toContain('.addOptions(data.options.slice(0, 25));');
            expect(plannedContent(context, 'tests/features/tracer/components/SelectMenus.test.ts')).toContain('expect(menu.options).toHaveLength(25);');
        });

        it('[positif] boutons : constantes des custom IDs, bouton link sans custom ID', () => {
            const buttons = {
                feature: 'tracer', name: 'Confirm', kind: 'buttons', summary: 'Confirmation',
                buttons: [
                    { key: 'yes', label: 'Oui', style: 'success' },
                    { key: 'wiki', label: 'Wiki', style: 'link', url: { data: 'wikiUrl' } },
                ],
            };
            componentGenerator.plan(componentGenerator.fromInput(buttons, '', context), context);
            const code = plannedContent(context, 'src/features/tracer/components/Buttons.ts');

            expect(code).toContain("export const CONFIRM_BUTTON_IDS = {\n    yes: 'tracer-confirm-yes',\n} as const;");
            expect(code).toContain('.setURL(data.wikiUrl)');
            expect(code).toContain('wikiUrl: string;');
        });

        it('[extrême] règles Discord vérifiées (custom ID pris, maxValues, bouton link sans URL)', () => {
            const invalid = { ...select, customId: 'select-player', maxValues: 3 };
            expect(() => componentGenerator.fromInput(invalid, '', context)).toThrow('déjà utilisé');
            expect(() => componentGenerator.fromInput({ ...select, maxValues: 3 }, '', context)).toThrow('maxValues (3) dépasse');

            const link = { feature: 'tracer', name: 'Links', kind: 'buttons', summary: 'Liens', buttons: [{ key: 'wiki', label: 'Wiki', style: 'link' }] };
            expect(() => componentGenerator.fromInput(link, '', context)).toThrow('obligatoire pour un bouton link');
        });
    });

    describe('command', () => {
        const command = {
            feature: 'settings',
            name: 'ping',
            description: { fr: 'Tester le bot', en: 'Test the bot' },
            options: [
                { name: 'count', type: 'integer', description: 'Nombre', min: 1, max: 5 },
                { name: 'message', type: 'string', required: true, description: 'Message', choices: [{ value: 'hello', name: 'Bonjour' }] },
            ],
            permission: 'ManageGuild',
            reply: { fr: 'Pong !', en: 'Pong!' },
        };

        it('[positif] commande complète : options obligatoires d\'abord, cast, test, textes', () => {
            commandGenerator.plan(commandGenerator.fromInput(command, '', context), context);
            const code = plannedContent(context, 'src/features/settings/commands/PingCommand.ts');

            expect(code.indexOf("setName('message')")).toBeLessThan(code.indexOf("setName('count')"));
            expect(code).toContain('.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)');
            expect(code).toContain('.setContexts(InteractionContextType.Guild)');
            expect(code).toContain(') as SlashCommandBuilder;');
            expect(code).toContain("content: translate('ping.reply'), flags: MessageFlagsBitField.Flags.Ephemeral");
            expect(plannedContent(context, 'src/features/settings/translations.ts')).toContain('export type SettingsTranslator');
            const fr = JSON.parse(plannedContent(context, 'src/features/settings/locales/fr.json'));
            expect(fr.commands.ping).toEqual({
                description: 'Tester le bot',
                options: { count: 'Nombre', message: 'Message' },
                choices: { message: { hello: 'Bonjour' } },
            });
            expect(plannedFiles(context)).toContain('+ tests/features/settings/commands/PingCommand.test.ts');
        });

        it('[positif] sans option : pas de cast (redondant)', () => {
            commandGenerator.plan(commandGenerator.fromInput({ feature: 'settings', name: 'ping', description: 'Tester' }, '', context), context);

            expect(plannedContent(context, 'src/features/settings/commands/PingCommand.ts')).not.toContain('as SlashCommandBuilder');
        });

        it('[extrême] nom déjà pris, permission inconnue, choix sur un type non compatible', () => {
            const invalid = {
                feature: 'tracer', name: 'register', description: 'x', permission: 'Nope',
                options: [{ name: 'membre', type: 'user', description: 'x', choices: [{ value: 'a', name: 'A' }] }],
            };

            expect(() => commandGenerator.fromInput(invalid, '', context))
                .toThrow(/\/register existe déjà\n.*choices : réservé aux types string, integer, number\n.*PermissionFlagsBits inconnu/);
        });

        it('[positif] mode interactif', async () => {
            const answers = ['1', 'ping', 'n', 'Tester le bot', 'o', 'message', '1', 'Message', '', 'n', 'n', '1', '', 'n', 'Pong !'];
            const spec = await withAnswers(answers, (prompter) => commandGenerator.interactive(prompter, context));

            expect(spec).toMatchObject({ feature: 'settings', name: 'ping', guildOnly: true, ephemeral: false, permission: undefined });
            expect(spec.options).toHaveLength(1);
        });
    });
});

import fs from 'node:fs';
import path from 'node:path';
import {
    escapeEmojis,
    extractPlaceholders,
    findPathConflict,
    matchShape,
    serializeLocale,
    setAtPath,
} from '../../../tools/generators/shared/localeJson';
import {
    addPaletteColor,
    ensureExportStar,
    ensureNamedImports,
    ensureTranslatorType,
    parsePalette,
} from '../../../tools/generators/shared/sourceEdit';
import { toCamelCase, toPascalCase, tsString } from '../../../tools/generators/shared/naming';

const ROOT = path.join(__dirname, '..', '..', '..');

describe('generators/shared/naming', () => {
    it('[positif] convertit une saisie libre en PascalCase / camelCase', () => {
        expect(toPascalCase('profile card')).toBe('ProfileCard');
        expect(toPascalCase('profileCard')).toBe('ProfileCard');
        expect(toCamelCase('Group-maker')).toBe('groupMaker');
    });

    it('[extrême] échappe apostrophes et caractères non ASCII dans une chaîne TypeScript', () => {
        expect(tsString("l'URL \u{1F512}")).toBe("'l\\'URL \\u{1F512}'");
    });
});

describe('generators/shared/localeJson', () => {
    it('[positif] la sérialisation reproduit à l\'identique les fichiers de traduction existants', () => {
        const directories = ['src/shared/i18n/locales', 'src/features/tracer/locales', 'src/features/settings/locales'];
        for (const directory of directories) {
            for (const file of fs.readdirSync(path.join(ROOT, directory))) {
                const original = fs.readFileSync(path.join(ROOT, directory, file), 'utf8').replace(/\r\n/g, '\n');
                expect(serializeLocale(JSON.parse(original))).toBe(original);
            }
        }
    });

    it('[positif] échappe les émojis (paire de substitution, sélecteur de variante) mais pas les accents', () => {
        expect(escapeEmojis('"\u{1F50D} é ⚠️"')).toBe('"\\uD83D\\uDD0D é \\u26A0\\uFE0F"');
    });

    it('[extrême] refuse une clé existante ou placée sous un texte', () => {
        const tree = { register: { title: 'Titre' } };

        expect(findPathConflict(tree, ['register', 'title'])).toBe('"register.title" existe déjà');
        expect(findPathConflict(tree, ['register', 'title', 'sub'])).toBe('"register.title" est déjà un texte');
        expect(findPathConflict(tree, ['register', 'card'])).toBeNull();
    });

    it('[positif] crée les objets intermédiaires d\'une nouvelle clé', () => {
        const tree = { register: { title: 'Titre' } };
        setAtPath(tree, ['profile', 'card', 'title'], 'Profil');

        expect(tree).toEqual({ register: { title: 'Titre' }, profile: { card: { title: 'Profil' } } });
    });

    it('[extrême] aligne la forme d\'une traduction sur le texte de référence (sinon erreur de compilation)', () => {
        expect(matchShape(['a', 'b'], 'x')).toEqual(['x']);
        expect(matchShape('a', ['x', 'y'])).toBe('x\ny');
        expect(matchShape('a', 'x')).toBe('x');
    });

    it('[positif] liste les placeholders sans doublon', () => {
        expect(extractPlaceholders(['{name} - {fame}', '{name}'])).toEqual(['name', 'fame']);
    });
});

describe('generators/shared/sourceEdit', () => {
    it('[positif] complète un import existant sans dupliquer', () => {
        const source = "import { A } from './x';\n\nconst a = 1;\n";

        expect(ensureNamedImports(source, './x', ['A', 'B'])).toBe("import { A, B } from './x';\n\nconst a = 1;\n");
    });

    it('[positif] ajoute un nouvel import après le dernier', () => {
        const source = "import { A } from './x';\n\nconst a = 1;\n";

        expect(ensureNamedImports(source, './y', ['C'])).toBe("import { A } from './x';\nimport { C } from './y';\n\nconst a = 1;\n");
    });

    it('[extrême] fichier sans import : l\'import est placé en tête', () => {
        expect(ensureNamedImports('/** doc */\n', './y', ['C'])).toBe("import { C } from './y';\n\n/** doc */\n");
        expect(ensureNamedImports('', './y', ['C'])).toBe("import { C } from './y';\n");
    });

    it('[positif] ajoute un export * une seule fois, après les autres', () => {
        const index = "/** doc */\nexport * from './types';\nexport * from './A';\n";
        const updated = ensureExportStar(index, './B');

        expect(updated).toBe("/** doc */\nexport * from './types';\nexport * from './A';\nexport * from './B';\n");
        expect(ensureExportStar(updated, './B')).toBe(updated);
    });

    it('[positif] lit et complète la palette EmbedColors', () => {
        const source = fs.readFileSync(path.join(ROOT, 'src/shared/embeds/EmbedColors.ts'), 'utf8').replace(/\r\n/g, '\n');
        const updated = addPaletteColor(source, { name: 'Legendary', hex: '#9b59b6', comment: 'Objet légendaire' });

        expect(parsePalette(source).map((color) => color.name)).toContain('Info');
        expect(parsePalette(updated).pop()).toEqual({ name: 'Legendary', hex: '#9B59B6', comment: 'Objet légendaire' });
        expect(updated).toMatch(/Legendary: '#9B59B6',\n\} as const;/);
    });

    it('[positif] ajoute le type <Feature>Translator et ses imports s\'il manque', () => {
        const source = [
            "import fr from './locales/fr.json';",
            "import { Locale, createFeatureTranslations } from '../../shared/i18n';",
            '',
            'export type SettingsMessages = typeof fr;',
            '',
        ].join('\n');
        const { source: updated, typeName } = ensureTranslatorType(source, 'Settings');

        expect(typeName).toBe('SettingsTranslator');
        expect(updated).toContain("import { Locale, createFeatureTranslations, CommonMessages, Translator } from '../../shared/i18n';");
        expect(updated).toContain('export type SettingsTranslator = Translator<CommonMessages & SettingsMessages>;');
        expect(ensureTranslatorType(updated, 'Settings').source).toBe(updated);
    });

    it('[extrême] translations.ts sans type Messages → erreur explicite', () => {
        expect(() => ensureTranslatorType('export const x = 1;\n', 'Demo')).toThrow('DemoMessages');
    });
});

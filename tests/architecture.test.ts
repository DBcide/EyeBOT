import fs from 'node:fs';
import path from 'node:path';

/**
 * Règles d'architecture vérifiées sur le code source
 *
 * L'alias `@/` (tsconfig "paths") n'existe que pour Jest : `tsc` ne le réécrit pas dans
 * le JavaScript compilé. Un import `@/...` dans src/ compile sans erreur mais plante au
 * démarrage ("Cannot find module '@/...'"), et Bot.ts ignore alors la commande concernée.
 * Les IDE (ex: WebStorm "optimize imports") peuvent en ajouter automatiquement.
 */
function listSourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listSourceFiles(fullPath);
        return entry.name.endsWith('.ts') ? [fullPath] : [];
    });
}

describe('architecture du code source', () => {
    const sourceRoot = path.join(__dirname, '..', 'src');

    it('[extrême] aucun import ne doit utiliser l\'alias "@/" dans src/ (non résolu à l\'exécution)', () => {
        const offenders = listSourceFiles(sourceRoot).flatMap((file) =>
            fs.readFileSync(file, 'utf8')
                .split(/\r?\n/)
                .map((line, index) => ({ line, lineNumber: index + 1 }))
                .filter(({ line }) => /from\s+['"]@\//.test(line) || /require\(\s*['"]@\//.test(line))
                .map(({ lineNumber }) => `${path.relative(sourceRoot, file)}:${lineNumber}`)
        );

        expect(offenders).toEqual([]);
    });
});

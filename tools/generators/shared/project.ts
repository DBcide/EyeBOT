import fs from 'node:fs';
import path from 'node:path';

/**
 * Accès au projet : emplacements des fichiers et ensemble des modifications à écrire
 */

/** Racine du dépôt (tools/generators/shared → ../../..) */
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const paths = {
    features: (root: string) => path.join(root, 'src', 'features'),
    feature: (root: string, feature: string) => path.join(root, 'src', 'features', feature),
    embedColors: (root: string) => path.join(root, 'src', 'shared', 'embeds', 'EmbedColors.ts'),
    featureTests: (root: string, feature: string) => path.join(root, 'tests', 'features', feature),
};

/** Fichier vide qui garde un dossier dans git ; supprimé dès qu'un vrai fichier y est écrit */
export const GITKEEP = '.gitkeep';

/** Fin de ligne d'un texte (CRLF si le fichier en contient, sinon LF) */
export function detectEol(text: string): '\r\n' | '\n' {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Vue du projet : disque + modifications prévues
 *
 * Les générateurs valident leurs entrées sur cette vue : dans un lot (plusieurs specs),
 * une feature créée par la première spec est donc visible des suivantes.
 */
export interface ProjectView {
    /** Contenu (fins de ligne `\n`), null si le fichier n'existe pas */
    read(filePath: string): string | null;
    /** Noms des entrées d'un dossier (fichiers et sous-dossiers), [] s'il n'existe pas */
    listDir(directory: string): string[];
}

interface PlannedFile {
    /** Contenu sur le disque (null si le fichier sera créé) */
    original: string | null;
    /** Contenu final, fins de ligne `\n` ; null = fichier supprimé */
    content: string | null;
    eol: '\r\n' | '\n';
}

export interface FileChange {
    filePath: string;
    status: 'created' | 'modified' | 'deleted';
    /** Contenu final avec les fins de ligne du fichier (vide pour une suppression) */
    content: string;
}

/**
 * Modifications de fichiers préparées en mémoire, écrites en une fois après validation
 *
 * @remarks
 * Les textes sont manipulés avec des fins de ligne `\n` ; chaque fichier est réécrit
 * avec ses fins de ligne d'origine (CRLF ou LF), les nouveaux avec `defaultEol`.
 */
export class FileChangeSet implements ProjectView {
    private readonly files = new Map<string, PlannedFile>();

    constructor(private readonly defaultEol: '\r\n' | '\n' = '\n') {}

    public read(filePath: string): string | null {
        const key = path.resolve(filePath);
        const planned = this.files.get(key);
        if (planned) return planned.content;
        if (!fs.existsSync(key) || !fs.statSync(key).isFile()) return null;
        return fs.readFileSync(key, 'utf8').replace(/\r\n/g, '\n');
    }

    public exists(filePath: string): boolean {
        return this.read(filePath) !== null;
    }

    public listDir(directory: string): string[] {
        const dir = path.resolve(directory);
        const entries = new Set(fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? fs.readdirSync(dir) : []);

        for (const [filePath, file] of this.files) {
            const relative = path.relative(dir, filePath);
            if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
            const first = relative.split(path.sep)[0];
            if (file.content === null && first === relative) entries.delete(first);
            else if (file.content !== null) entries.add(first);
        }
        return Array.from(entries).sort((a, b) => a.localeCompare(b));
    }

    /**
     * Prévoit l'écriture d'un fichier
     *
     * @remarks
     * Le `.gitkeep` du dossier est supprimé : le dossier n'est plus vide.
     */
    public write(filePath: string, content: string): void {
        const key = path.resolve(filePath);
        this.set(key, content);
        if (path.basename(key) !== GITKEEP) {
            const gitkeep = path.join(path.dirname(key), GITKEEP);
            if (this.exists(gitkeep)) this.set(gitkeep, null);
        }
    }

    /** Fichiers réellement créés, modifiés ou supprimés */
    public changes(): FileChange[] {
        const result: FileChange[] = [];
        for (const [filePath, file] of this.files) {
            if (file.content === null) {
                if (file.original !== null) result.push({ filePath, status: 'deleted', content: '' });
                continue;
            }
            const content = file.eol === '\n' ? file.content : file.content.replace(/\n/g, file.eol);
            if (file.original === content) continue;
            result.push({ filePath, status: file.original === null ? 'created' : 'modified', content });
        }
        return result;
    }

    /** Écrit les fichiers sur le disque (crée les dossiers manquants) */
    public commit(): void {
        for (const change of this.changes()) {
            if (change.status === 'deleted') {
                fs.rmSync(change.filePath, { force: true });
                continue;
            }
            fs.mkdirSync(path.dirname(change.filePath), { recursive: true });
            fs.writeFileSync(change.filePath, change.content, 'utf8');
        }
    }

    private set(key: string, content: string | null): void {
        const planned = this.files.get(key);
        if (planned) {
            planned.content = content;
            return;
        }
        const original = fs.existsSync(key) && fs.statSync(key).isFile() ? fs.readFileSync(key, 'utf8') : null;
        const eol = original === null ? this.defaultEol : detectEol(original);
        this.files.set(key, { original, content, eol });
    }
}

/** Features existantes ou prévues (dossiers de `src/features/`) */
export function listFeatures(view: ProjectView, root: string): string[] {
    return view.listDir(paths.features(root)).filter((name) => !name.includes('.'));
}

/** Une feature est initialisée quand elle possède son `translations.ts` */
export function isFeatureInitialized(view: ProjectView, root: string, feature: string): boolean {
    return view.read(path.join(paths.feature(root, feature), 'translations.ts')) !== null;
}

/** Fichiers `.ts` d'un dossier de la feature (ex: 'embeds', 'components') */
export function listFeatureFiles(view: ProjectView, root: string, feature: string, folder: string): string[] {
    return view.listDir(path.join(paths.feature(root, feature), folder)).filter((file) => file.endsWith('.ts'));
}

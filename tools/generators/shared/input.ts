/**
 * Lecture et validation des specs JSON (mode non interactif)
 *
 * Toutes les erreurs sont collectées avec leur chemin (`embeds[0].title.en : …`)
 * puis renvoyées ensemble : une seule correction suffit, sans aller-retour.
 */

/** Spec JSON invalide : liste des erreurs, chacune préfixée par son chemin */
export class SpecValidationError extends Error {
    constructor(public readonly errors: string[]) {
        super(`Spec invalide :\n${errors.map((error) => `  - ${error}`).join('\n')}`);
        this.name = 'SpecValidationError';
    }
}

/** Lève SpecValidationError s'il y a au moins une erreur */
export function throwIfErrors(errors: string[]): void {
    if (errors.length > 0) throw new SpecValidationError(errors);
}

/** Lecteur typé des propriétés d'un objet JSON */
export class InputReader {
    private constructor(
        private readonly data: Record<string, unknown>,
        public readonly where: string,
        public readonly errors: string[]
    ) {}

    /** null (avec une erreur) si `raw` n'est pas un objet */
    public static of(raw: unknown, where: string, errors: string[]): InputReader | null {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return new InputReader(raw as Record<string, unknown>, where, errors);
        }
        errors.push(`${where} : objet attendu`);
        return null;
    }

    public path(key: string): string {
        return this.where ? `${this.where}.${key}` : key;
    }

    public has(key: string): boolean {
        return this.data[key] !== undefined && this.data[key] !== null;
    }

    public raw(key: string): unknown {
        return this.data[key];
    }

    /** Signale les propriétés inconnues (faute de frappe probable) */
    public allowOnly(keys: string[]): this {
        for (const key of Object.keys(this.data)) {
            if (!keys.includes(key)) this.errors.push(`${this.path(key)} : propriété inconnue (attendues : ${keys.join(', ')})`);
        }
        return this;
    }

    public string(key: string, options: { required?: boolean; validate?: (value: string) => string | null } = {}): string | undefined {
        const value = this.data[key];
        if (value === undefined || value === null) {
            if (options.required) this.errors.push(`${this.path(key)} : obligatoire`);
            return undefined;
        }
        if (typeof value !== 'string') {
            this.errors.push(`${this.path(key)} : chaîne attendue`);
            return undefined;
        }
        const error = options.validate?.(value);
        if (error) {
            this.errors.push(`${this.path(key)} : ${error}`);
            return undefined;
        }
        return value;
    }

    public boolean(key: string, defaultValue: boolean): boolean {
        const value = this.data[key];
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        this.errors.push(`${this.path(key)} : true ou false attendu`);
        return defaultValue;
    }

    public integer(key: string, min: number, max: number): number | undefined {
        const value = this.data[key];
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value;
        this.errors.push(`${this.path(key)} : entier entre ${min} et ${max} attendu`);
        return undefined;
    }

    public number(key: string): number | undefined {
        const value = this.data[key];
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        this.errors.push(`${this.path(key)} : nombre attendu`);
        return undefined;
    }

    public oneOf<T extends string>(key: string, values: readonly T[], defaultValue?: T): T | undefined {
        const value = this.data[key];
        if (value === undefined || value === null) {
            if (defaultValue === undefined) this.errors.push(`${this.path(key)} : obligatoire (${values.join(' | ')})`);
            return defaultValue;
        }
        if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T;
        this.errors.push(`${this.path(key)} : valeur attendue parmi ${values.join(' | ')}`);
        return defaultValue;
    }

    /** Tableau (vide si absent) */
    public array(key: string): unknown[] {
        const value = this.data[key];
        if (value === undefined || value === null) return [];
        if (Array.isArray(value)) return value;
        this.errors.push(`${this.path(key)} : tableau attendu`);
        return [];
    }
}

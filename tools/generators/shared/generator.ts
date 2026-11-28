import { Prompter } from './Prompter';
import { GeneratorContext } from './text';

/**
 * Contrat commun des générateurs (feature, embed, component, command)
 *
 * Chaque générateur fonctionne de deux façons, qui produisent la même spec interne :
 * - interactive : questions dans le terminal (humain)
 * - non interactive : spec JSON validée (`--spec`), pensée pour une IA ou un script
 */

export type GeneratorType = 'feature' | 'embed' | 'component' | 'command';

/** Ce qui est affiché après la génération */
export interface GeneratorReport {
    /** Exemple de code pour utiliser ce qui a été généré */
    usage?: string;
    /** Étapes suivantes, textes à traduire... */
    notes: string[];
}

export interface Generator<S> {
    type: GeneratorType;
    /** Description courte (aide) */
    description: string;
    /** Format de la spec JSON, commenté (aide) */
    specHelp: string;
    /** Exemple complet de spec JSON (`--example`) */
    example: Record<string, unknown>;

    /** Pose les questions et renvoie la spec */
    interactive(prompter: Prompter, context: GeneratorContext): Promise<S>;

    /**
     * Valide une spec JSON
     *
     * @param where - Préfixe des messages d'erreur (ex: '[2]' dans un lot)
     * @throws SpecValidationError avec toutes les erreurs trouvées
     */
    fromInput(raw: unknown, where: string, context: GeneratorContext): S;

    /**
     * Aperçu texte, construit avec les vrais builders discord.js
     *
     * @throws Si discord.js refuse le résultat (limites Discord)
     */
    preview?(spec: S, context: GeneratorContext): string;

    /** Prévoit les modifications de fichiers dans `context.changes` */
    plan(spec: S, context: GeneratorContext): GeneratorReport;
}

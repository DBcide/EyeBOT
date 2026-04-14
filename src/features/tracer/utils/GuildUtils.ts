/**
 * Construit un tag de guilde formaté à partir du nom complet de la guilde Albion
 *
 * @param guildName - Le nom de la guilde Albion (peut être null/undefined/vide)
 * @returns Le tag formaté entre crochets (ex: `[TAG]`)
 *
 * @remarks
 * **Algorithme de génération**:
 *
 * 1. **Si pas de guilde**: Return `[]` (crochets vides)
 * 2. **Suppression des espaces**: Retire tous les espaces du nom
 * 3. **Extraction des majuscules**: Détecte toutes les lettres majuscules
 * 4. **Choix de l'algorithme**:
 *    - Si 2+ majuscules trouvées: Prend les 5 premières majuscules → `[MAJUS]`
 *    - Si 0-1 majuscule: Prend les 5 premiers caractères → `[guild]`
 * 5. **Formatage**: Encadre le résultat avec des crochets `[ ]`
 *
 * **Cas d'usage**:
 * - Utilisé par updateMemberNickname() pour formater les pseudos Discord
 * - Appliqué sur tous les personnages lors de /register, /update, /updateall
 *
 * **Exemples de transformations**:
 * - "La Grande Guilde" → 3 majuscules (L, G, G) → `[LGG]`
 * - "ELITE WARRIORS" → 2 majuscules (E, W) → `[EW]`
 * - "myGuild" → 1 majuscule (G) → `[myGui]` (fallback 5 chars)
 * - "lowercaseguild" → 0 majuscule → `[lower]` (fallback 5 chars)
 * - "" → Vide → `[]`
 * - null → `[]`
 *
 * **Note**: La fonction est fail-safe (jamais de throw), retourne toujours un string
 *
 * @example
 * ```typescript
 * // Guildes avec majuscules
 * buildGuildTag('La Grande Guilde');    // "[LGG]"
 * buildGuildTag('ELITE WARRIORS');      // "[EW]"
 * buildGuildTag('The Best Players');    // "[TBP]"
 *
 * // Guildes sans majuscules suffisantes
 * buildGuildTag('myGuild');             // "[myGui]"
 * buildGuildTag('guild');               // "[guild]"
 * buildGuildTag('a');                   // "[a]"
 *
 * // Cas spéciaux
 * buildGuildTag('');                    // "[]"
 * buildGuildTag(null);                  // "[]"
 * buildGuildTag(undefined);             // "[]"
 * buildGuildTag('   ');                 // "[]"
 * ```
 *
 * @example
 * ```typescript
 * // Utilisation dans un pseudo Discord
 * const tag = buildGuildTag('La Grande Guilde');
 * const nickname = `${tag} PlayerName`;
 * console.log(nickname); // "[LGG] PlayerName"
 * ```
 */
export function buildGuildTag(guildName?: string | null): string {
    if (!guildName || guildName.trim().length === 0) {
        return '[]';
    }

    const noSpaces = guildName.replace(/\s+/g, '');
    const uppercaseLetters = noSpaces.match(/[A-Z]/g) ?? [];

    let tag: string;

    if (uppercaseLetters.length > 1) {
        tag = uppercaseLetters.slice(0, 5).join('');
    } else {
        tag = noSpaces.slice(0, 5);
    }

    return `[${tag}]`;
}

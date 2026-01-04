/**
 * Construit un tag de guilde à partir du nom de guilde Albion
 * Exemple: "La Grande Guilde" -> "[LGG]"
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

/**
 * Mise en forme du terminal (désactivée si la sortie n'est pas un terminal ou si NO_COLOR est défini)
 */
const colorsEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function wrap(open: string, close: string) {
    return (text: string): string => (colorsEnabled ? `\x1b[${open}m${text}\x1b[${close}m` : text);
}

export const style = {
    bold: wrap('1', '22'),
    dim: wrap('2', '22'),
    red: wrap('31', '39'),
    green: wrap('32', '39'),
    yellow: wrap('33', '39'),
    cyan: wrap('36', '39'),
    /** Texte dans une couleur hexadécimale (#RRGGBB) */
    hex: (hex: string, text: string): string => {
        if (!colorsEnabled) return text;
        const value = Number.parseInt(hex.slice(1), 16);
        return `\x1b[38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}m${text}\x1b[39m`;
    },
};

/** Titre de section */
export function heading(text: string): string {
    return `\n${style.bold(style.cyan(`== ${text} ==`))}`;
}

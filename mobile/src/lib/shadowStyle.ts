import { Platform } from "react-native";

type ShadowParams = {
    color: string;
    offsetY: number;
    blurRadius: number;
    opacity: number;
    elevation?: number;
};

const hexToRgb = (hex: string) => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6 && normalized.length !== 3) return null;
    const fullHex =
        normalized.length === 3
            ? normalized
                  .split("")
                  .map((char) => `${char}${char}`)
                  .join("")
            : normalized;
    const bigint = Number.parseInt(fullHex, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    };
};

const toRgba = (color: string, alpha: number) => {
    if (color.startsWith("#")) {
        const rgb = hexToRgb(color);
        if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return color;
};

export const makeShadow = ({ color, offsetY, blurRadius, opacity, elevation }: ShadowParams) =>
    Platform.select({
        web: {
            boxShadow: `0px ${offsetY}px ${blurRadius}px ${toRgba(color, opacity)}`,
        },
        default: {
            shadowColor: color,
            shadowOpacity: opacity,
            shadowRadius: blurRadius,
            shadowOffset: { width: 0, height: offsetY },
            ...(elevation !== undefined ? { elevation } : {}),
        },
    });


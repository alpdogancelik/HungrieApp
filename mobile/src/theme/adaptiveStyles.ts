import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { ThemeDefinition, ThemeVariant } from "./themeContext";

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

let activeTheme: ThemeDefinition | null = null;
let activeVariant: ThemeVariant = "light";
let revision = 0;

const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

const isVeryLightHex = (value: string) => {
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (!match) return false;
    const numeric = Number.parseInt(match[1], 16);
    const red = (numeric >> 16) & 255;
    const green = (numeric >> 8) & 255;
    const blue = numeric & 255;
    return red >= 225 && green >= 225 && blue >= 225;
};

const backgroundRole = (value: string, theme: ThemeDefinition) => {
    const color = normalize(value);
    if (["#fff", "#ffffff", "white", "rgba(255,255,255,0.95)", "rgba(255,255,255,0.96)", "rgba(255,255,255,0.94)"].includes(color)) {
        return theme.colors.surface;
    }
    if (["#f8fafc", "#f9fafb", "#faf8fb", "#f8f6f2", "#fff8f2", "#fff7ef", "#fffcf8", "#fdf4e7", "#fffaf6", "#fff4eb"].includes(color)) {
        return theme.colors.background;
    }
    if (["#f1f5f9", "#f3f4f6", "#f6f8fb", "#eef2f7", "#f8f9fb", "#fff9f2", "#fff9f3", "#fff6ef", "#fff7ea", "#fff3ea", "#fff1e6", "#f3e7db", "#f5e4d6", "#e5e7eb"].includes(color)) {
        return theme.colors.surfaceMuted;
    }
    if (["#fef2f2", "#fff1f1", "#fff1f2", "#fff1f4", "#fff5f5", "#ffeaf0"].includes(color)) return theme.colors.dangerSurface;
    if (["#ecfdf5", "#e7faf2", "#e8f9ed", "#eaf9ee"].includes(color)) return theme.colors.successSurface;
    if (["#fffbeb", "#fff7dd", "#fff7ed"].includes(color)) return theme.colors.warningSurface;
    if (color.startsWith("rgba(255,255,255,")) return theme.colors.surfaceElevated;
    if (isVeryLightHex(color)) return theme.colors.surfaceMuted;
    return value;
};

const foregroundRole = (value: string, theme: ThemeDefinition) => {
    const color = normalize(value);
    if (["#0f172a", "#111827", "#101828", "#16213e", "#18233a", "#1e2433", "#1e293b", "#1f2937", "#251b17", "#1f120b"].includes(color)) {
        return theme.colors.ink;
    }
    if (["#334155", "#475569", "#4b5563", "#5b6475", "#627189", "#64748b", "#6b7280", "#7e7167", "#8a8178"].includes(color)) {
        return theme.colors.textSecondary;
    }
    if (["#8895aa", "#94a3b8", "#98a0af", "#98a2b3", "#9ca3af", "#a39489", "#a8b0bf"].includes(color)) {
        return theme.colors.muted;
    }
    return value;
};

const borderRole = (value: string, theme: ThemeDefinition) => {
    const color = normalize(value);
    if (
        ["#e2e8f0", "#e5e7eb", "#e7dccf", "#e9e2d8", "#eee7de", "#edf1f6", "#f2e7da", "#f4f1ec", "#cbd5e1", "#cbd5f5"].includes(color) ||
        color === "rgba(31,18,11,0.06)" ||
        color === "rgba(31,18,11,0.08)" ||
        color === "rgba(37,27,23,0.08)" ||
        color === "rgba(37,27,23,0.05)"
    ) {
        return theme.colors.border;
    }
    if (isVeryLightHex(color)) return theme.colors.border;
    return value;
};

const adaptStyle = (style: Record<string, unknown>, theme: ThemeDefinition) => {
    const next: Record<string, unknown> = { ...style };
    for (const [property, value] of Object.entries(next)) {
        if (typeof value !== "string") continue;
        if (property === "backgroundColor") next[property] = backgroundRole(value, theme);
        else if (property === "color" || property === "textDecorationColor" || property === "tintColor") {
            next[property] = foregroundRole(value, theme);
        } else if (property.toLowerCase().includes("border") && property.toLowerCase().includes("color")) {
            next[property] = borderRole(value, theme);
        } else if (property === "shadowColor") {
            next[property] = theme.colors.shadow;
        }
    }
    return next;
};

export const setAdaptiveStyleTheme = (theme: ThemeDefinition, variant: ThemeVariant) => {
    if (activeTheme === theme && activeVariant === variant) return;
    activeTheme = theme;
    activeVariant = variant;
    revision += 1;
};

export const createAdaptiveStyleSheet = <T extends NamedStyles<T>>(definitions: T): T => {
    const cache = new Map<PropertyKey, { revision: number; style: unknown }>();
    return new Proxy(definitions, {
        get(target, property, receiver) {
            const raw = Reflect.get(target, property, receiver);
            if (activeVariant !== "dark" || !activeTheme || !raw || typeof raw !== "object") return raw;
            const cached = cache.get(property);
            if (cached?.revision === revision) return cached.style;
            const style = adaptStyle(raw as Record<string, unknown>, activeTheme);
            cache.set(property, { revision, style });
            return style;
        },
    });
};

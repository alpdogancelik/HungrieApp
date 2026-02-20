export type ColorRoles = {
    primary: string;
    ink: string;
    surface: string;
    muted: string;
    success: string;
    warning: string;
    danger: string;
    border: string;
};

export type RadiusScale = {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    "2xl": number;
};

export type SpacingScale = {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    "2xl": number;
};

export type TypographyScale = {
    h1: number;
    h2: number;
    body: number;
    caption: number;
};

export const lightColors: ColorRoles = {
    primary: "#FE8C00",
    ink: "#0F172A",
    surface: "#FFFFFF",
    muted: "#94A3B8",
    success: "#22C55E",
    warning: "#FACC15",
    danger: "#F87171",
    border: "#E2E8F0",
};

export const darkColors: ColorRoles = {
    // Lock dark theme to match light palette since we now ship light-only UI.
    primary: "#FE8C00",
    ink: "#0F172A",
    surface: "#FFFFFF",
    muted: "#94A3B8",
    success: "#22C55E",
    warning: "#FACC15",
    danger: "#F87171",
    border: "#E2E8F0",
};

export const radius: RadiusScale = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
};

export const spacing: SpacingScale = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 14,
    xl: 22,
    "2xl": 32,
};

export const typography: TypographyScale = {
    h1: 28,
    h2: 22,
    body: 16,
    caption: 12,
};

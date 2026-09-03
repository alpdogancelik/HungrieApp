export type ColorRoles = {
    primary: string;
    primaryPressed: string;
    onPrimary: string;
    background: string;
    ink: string;
    textSecondary: string;
    surface: string;
    surfaceElevated: string;
    surfaceMuted: string;
    input: string;
    muted: string;
    success: string;
    successSurface: string;
    warning: string;
    warningSurface: string;
    danger: string;
    dangerSurface: string;
    border: string;
    divider: string;
    overlay: string;
    shadow: string;
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
    primaryPressed: "#E56E00",
    onPrimary: "#FFFFFF",
    background: "#F8FAFC",
    ink: "#0F172A",
    textSecondary: "#475569",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#F1F5F9",
    input: "#FFFFFF",
    muted: "#94A3B8",
    success: "#22C55E",
    successSurface: "#ECFDF5",
    warning: "#FACC15",
    warningSurface: "#FFFBEB",
    danger: "#F87171",
    dangerSurface: "#FEF2F2",
    border: "#E2E8F0",
    divider: "#E2E8F0",
    overlay: "rgba(15, 23, 42, 0.56)",
    shadow: "#0F172A",
};

export const darkColors: ColorRoles = {
    primary: "#FE8C00",
    primaryPressed: "#FF9F2E",
    onPrimary: "#08111F",
    background: "#07111F",
    ink: "#F8FAFC",
    textSecondary: "#CBD5E1",
    surface: "#0D1B2D",
    surfaceElevated: "#13243A",
    surfaceMuted: "#172A42",
    input: "#0A1728",
    muted: "#94A3B8",
    success: "#4ADE80",
    successSurface: "#0B2B22",
    warning: "#FDE047",
    warningSurface: "#33280A",
    danger: "#FCA5A5",
    dangerSurface: "#35151B",
    border: "#29405C",
    divider: "#203750",
    overlay: "rgba(2, 6, 23, 0.78)",
    shadow: "#000000",
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

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
    primary: "#FF7A45",
    ink: "#2B150E",
    surface: "#FFF4EB",
    muted: "#C48A74",
    success: "#FFB347",
    warning: "#FFDF99",
    danger: "#FF8F6B",
    border: "#F8DECC",
};

export const darkColors: ColorRoles = {
    primary: "#FF9E64",
    ink: "#FFE5D6",
    surface: "#2B150E",
    muted: "#F2B7A3",
    success: "#FFC676",
    warning: "#FFDFA5",
    danger: "#FFAB8A",
    border: "#3D1F15",
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
    lg: 16,
    xl: 24,
    "2xl": 32,
};

export const typography: TypographyScale = {
    h1: 28,
    h2: 22,
    body: 16,
    caption: 12,
};

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, Text, TouchableOpacity, View } from "react-native";
import { storage } from "@/src/lib/storage";
import {
    ColorRoles,
    darkColors,
    lightColors,
    radius,
    RadiusScale,
    spacing,
    SpacingScale,
    typography,
    TypographyScale,
} from "./tokens";
import { makeShadow } from "@/src/lib/shadowStyle";
import { setAdaptiveStyleTheme } from "./adaptiveStyles";

export type ThemeVariant = "light" | "dark";

export type ThemeDefinition = {
    colors: ColorRoles;
    radius: RadiusScale;
    spacing: SpacingScale;
    typography: TypographyScale;
};

type ThemeContextValue = {
    theme: ThemeDefinition;
    variant: ThemeVariant;
    setVariant: (variant: ThemeVariant) => void;
    toggleTheme: () => void;
    hydrated: boolean;
};

const THEME_CACHE_KEY = "hungrie_theme_variant";

const buildTheme = (variant: ThemeVariant): ThemeDefinition => ({
    colors: variant === "dark" ? darkColors : lightColors,
    radius,
    spacing,
    typography,
});

export const getShadow = (level: 1 | 2) => {
    const opacity = level === 1 ? 0.08 : 0.16;
    const radiusValue = level === 1 ? 12 : 20;
    const height = level === 1 ? 6 : 12;
    return makeShadow({
        color: "rgba(15, 23, 42, 0.35)",
        offsetY: height,
        blurRadius: radiusValue,
        opacity,
        elevation: level === 1 ? 4 : 10,
    });
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readStoredVariant = async (): Promise<ThemeVariant | null> => {
    const stored = await storage.getItem(THEME_CACHE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return null;
};

const persistVariant = async (variant: ThemeVariant) => {
    await storage.setItem(THEME_CACHE_KEY, variant);
};

export const ThemeProvider = ({
    children,
    initialVariant,
}: {
    children: ReactNode;
    initialVariant?: ThemeVariant;
}) => {
    const [variant, setVariantState] = useState<ThemeVariant>(initialVariant ?? "light");
    const [hydrated, setHydrated] = useState(Boolean(initialVariant));

    useEffect(() => {
        let active = true;
        if (initialVariant) {
            Appearance.setColorScheme(initialVariant);
            return () => {
                active = false;
            };
        }

        readStoredVariant()
            .then((stored) => {
                if (!active) return;
                const resolved = stored ?? "light";
                setVariantState(resolved);
                Appearance.setColorScheme(resolved);
            })
            .catch(() => null)
            .finally(() => {
                if (active) setHydrated(true);
            });

        return () => {
            active = false;
        };
    }, [initialVariant]);

    const setVariant = useCallback((nextVariant: ThemeVariant) => {
        setVariantState(nextVariant);
        Appearance.setColorScheme(nextVariant);
        void persistVariant(nextVariant);
    }, []);

    const toggleTheme = useCallback(() => {
        setVariant(variant === "dark" ? "light" : "dark");
    }, [setVariant, variant]);

    const theme = useMemo(() => buildTheme(variant), [variant]);
    setAdaptiveStyleTheme(theme, variant);

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme,
            variant,
            setVariant,
            toggleTheme,
            hydrated,
        }),
        [theme, variant, toggleTheme, hydrated],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error("useTheme must be used within ThemeProvider");
    }
    return ctx;
};

export const ThemeButton = ({
    label,
    onPress,
    disabled,
}: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
}) => {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={{
                backgroundColor: disabled ? theme.colors.muted : theme.colors.primary,
                borderRadius: theme.radius.lg,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                alignItems: "center",
                opacity: disabled ? 0.6 : 1,
                ...getShadow(1),
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Text
                style={{
                    color: theme.colors.onPrimary,
                    fontSize: theme.typography.body,
                    fontFamily: "ChairoSans",
                }}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
};

export const ThemeCard = ({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children?: ReactNode;
}) => {
    const { theme } = useTheme();
    return (
        <View
            style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.xl,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: theme.spacing.lg,
                gap: theme.spacing.sm,
                ...getShadow(2),
            }}
        >
            <Text
                style={{
                    color: theme.colors.ink,
                    fontSize: theme.typography.h2,
                    fontFamily: "ChairoSans",
                }}
            >
                {title}
            </Text>
            <Text
                style={{
                    color: theme.colors.muted,
                    fontSize: theme.typography.body,
                    fontFamily: "ChairoSans",
                }}
            >
                {description}
            </Text>
            {children}
        </View>
    );
};

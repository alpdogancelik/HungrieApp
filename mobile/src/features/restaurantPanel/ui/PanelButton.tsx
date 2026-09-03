import { useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle, useWindowDimensions } from "react-native";
import { panelDesign } from "./panelDesign";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useTheme, type ThemeDefinition } from "@/src/theme/themeContext";

type PanelButtonVariant = "primary" | "outline" | "ghost" | "danger" | "success";

type Props = {
    label: string;
    onPress?: () => void;
    variant?: PanelButtonVariant;
    disabled?: boolean;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
};

const getButtonColors = (variant: PanelButtonVariant, theme: ThemeDefinition) => {
    if (variant === "primary") {
        return { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, textColor: theme.colors.onPrimary };
    }
    if (variant === "danger") {
        return { backgroundColor: theme.colors.dangerSurface, borderColor: theme.colors.danger, textColor: theme.colors.danger };
    }
    if (variant === "success") {
        return { backgroundColor: theme.colors.successSurface, borderColor: theme.colors.success, textColor: theme.colors.success };
    }
    if (variant === "outline") {
        return {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.primary,
            textColor: theme.colors.primary,
        };
    }
    return {
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
        textColor: theme.colors.ink,
    };
};

export const PanelButton = ({
    label,
    onPress,
    variant = "primary",
    disabled = false,
    loading = false,
    style,
    accessibilityLabel,
}: Props) => {
    const { width } = useWindowDimensions();
    const { theme } = useTheme();
    const isPhone = width < 760;
    const palette = getButtonColors(variant, theme);
    const isDisabled = disabled || loading;
    const [focused, setFocused] = useState(false);

    return (
        <Pressable
            onPress={onPress}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel || label}
            style={({ pressed }) => [
                styles.base,
                isPhone ? styles.basePhone : null,
                {
                    backgroundColor: palette.backgroundColor,
                    borderColor: palette.borderColor,
                    opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
                },
                focused ? styles.focused : null,
                style,
            ]}
        >
            {loading ? <ActivityIndicator color={palette.textColor} /> : <Text style={[styles.label, isPhone ? styles.labelPhone : null, { color: palette.textColor }]}>{label}</Text>}
        </Pressable>
    );
};

const styles = createAdaptiveStyleSheet({
    base: {
        minHeight: 46,
        borderRadius: panelDesign.radius.md,
        borderWidth: 1.2,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: panelDesign.spacing.md,
        paddingVertical: panelDesign.spacing.sm,
        ...makeShadow({ color: "#D6B28A", offsetY: 3, blurRadius: 8, opacity: 0.08, elevation: 1 }),
        elevation: 1,
    },
    basePhone: {
        minHeight: 42,
        paddingHorizontal: panelDesign.spacing.sm,
        paddingVertical: 8,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 17,
        lineHeight: 20,
        textAlign: "center",
        flexShrink: 1,
    },
    labelPhone: {
        fontSize: 15,
        lineHeight: 18,
    },
    focused: {
        ...makeShadow({ color: panelDesign.colors.primary, offsetY: 0, blurRadius: 5, opacity: 0.4, elevation: 2 }),
        elevation: 2,
    },
});

import { useState } from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle, useWindowDimensions } from "react-native";
import { panelDesign } from "./panelDesign";
import { makeShadow } from "@/src/lib/shadowStyle";

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

const getButtonColors = (variant: PanelButtonVariant) => {
    if (variant === "primary") {
        return { backgroundColor: panelDesign.colors.primary, borderColor: panelDesign.colors.primary, textColor: "#FFFFFF" };
    }
    if (variant === "danger") {
        return { backgroundColor: panelDesign.colors.dangerSoft, borderColor: "#EDC3CD", textColor: panelDesign.colors.danger };
    }
    if (variant === "success") {
        return { backgroundColor: panelDesign.colors.successSoft, borderColor: "#B7EAD4", textColor: panelDesign.colors.success };
    }
    if (variant === "outline") {
        return {
            backgroundColor: panelDesign.colors.primarySoft,
            borderColor: panelDesign.colors.primary,
            textColor: "#B94900",
        };
    }
    return {
        backgroundColor: panelDesign.colors.backgroundSoft,
        borderColor: panelDesign.colors.border,
        textColor: panelDesign.colors.text,
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
    const isPhone = width < 760;
    const palette = getButtonColors(variant);
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

const styles = StyleSheet.create({
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

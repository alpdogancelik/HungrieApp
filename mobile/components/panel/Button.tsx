import { useState } from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";

type Variant = "primary" | "secondary" | "destructive" | "outline" | "ghost" | "danger";

type Props = {
    label: string;
    onPress?: () => void;
    variant?: Variant;
    disabled?: boolean;
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
    iconName?: keyof typeof Feather.glyphMap;
};

const palette = {
    primary: { bg: "#FFE3C4", border: "#EE7A14", fg: "#A34700" },
    secondary: { bg: "#FFF5EA", border: "#EE7A14", fg: "#B94900" },
    destructive: { bg: "#FFF1F4", border: "#E3A3B2", fg: "#B62B4D" },
    outline: { bg: "#FFFFFF", border: "#D88942", fg: "#A34700" },
    ghost: { bg: "#FFF9F2", border: "#D8C6AF", fg: "#627189" },
    danger: { bg: "#FFF1F4", border: "#E3A3B2", fg: "#B62B4D" },
};

const Button = ({
    label,
    onPress,
    variant = "primary",
    disabled = false,
    loading = false,
    style,
    accessibilityLabel,
    iconName,
}: Props) => {
    const { width } = useWindowDimensions();
    const isPhone = width < 760;
    const [focused, setFocused] = useState(false);
    const tone = palette[variant] ?? palette.secondary;
    const isDisabled = disabled || loading;

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
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                    opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
                },
                focused ? styles.focused : null,
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={tone.fg} />
            ) : (
                <>
                    {iconName ? <Feather name={iconName} size={15} color={tone.fg} /> : null}
                    <Text style={[styles.label, isPhone ? styles.labelPhone : null, { color: tone.fg }]}>{label}</Text>
                </>
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    base: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1.2,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
        flexDirection: "row",
        gap: 8,
        shadowColor: "#D6B28A",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
    },
    basePhone: {
        minHeight: 40,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 18,
        textAlign: "center",
        flexShrink: 1,
        fontWeight: "600",
    },
    labelPhone: {
        fontSize: 15,
        lineHeight: 17,
    },
    focused: {
        shadowColor: "#EE7A14",
        shadowOpacity: 0.4,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 0 },
        elevation: 2,
    },
});

export default Button;

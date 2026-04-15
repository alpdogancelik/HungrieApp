import { useState } from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { makeShadow } from "@/src/lib/shadowStyle";

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
                <View style={styles.content}>
                    {iconName ? (
                        <View style={styles.iconWrap}>
                            <Feather name={iconName} size={15} color={tone.fg} />
                        </View>
                    ) : null}
                    <Text style={[styles.label, isPhone ? styles.labelPhone : null, { color: tone.fg }]}>{label}</Text>
                </View>
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
        ...makeShadow({ color: "#D6B28A", offsetY: 3, blurRadius: 8, opacity: 0.08, elevation: 1 }),
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
        ...makeShadow({ color: "#EE7A14", offsetY: 0, blurRadius: 5, opacity: 0.4, elevation: 2 }),
        elevation: 2,
    },
    content: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    iconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
});

export default Button;

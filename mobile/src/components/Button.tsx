import { ActivityIndicator, Text, TouchableOpacity, ViewStyle } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/theme/themeContext";

type ButtonVariant = "solid" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const sizeMap: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
    sm: { paddingVertical: 8, paddingHorizontal: 14, fontSize: 14 },
    md: { paddingVertical: 12, paddingHorizontal: 18, fontSize: 16 },
    lg: { paddingVertical: 16, paddingHorizontal: 22, fontSize: 18 },
};

export type ButtonProps = {
    label: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    onPress?: () => void;
    style?: ViewStyle;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
};

export const Button = ({
    label,
    variant = "solid",
    size = "md",
    loading = false,
    disabled = false,
    onPress,
    style,
    leftIcon,
    rightIcon,
}: ButtonProps) => {
    const { theme } = useTheme();
    const sizeToken = sizeMap[size];

    const backgroundColor = useMemo(() => {
        if (variant === "solid") return theme.colors.primary;
        if (variant === "outline") return theme.colors.surface;
        return "transparent";
    }, [variant, theme.colors.primary, theme.colors.surface]);

    const borderColor = useMemo(() => {
        if (variant === "ghost") return "transparent";
        if (variant === "outline") return theme.colors.border;
        return theme.colors.primary;
    }, [variant, theme.colors.border, theme.colors.primary]);

    const textColor = useMemo(() => {
        if (variant === "solid") return theme.colors.surface;
        if (variant === "outline") return theme.colors.ink;
        return theme.colors.primary;
    }, [variant, theme.colors.surface, theme.colors.ink, theme.colors.primary]);

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            style={[
                {
                    backgroundColor,
                    borderColor,
                    borderWidth: variant === "ghost" ? 0 : 1,
                    borderRadius: theme.radius.lg,
                    paddingVertical: sizeToken.paddingVertical,
                    paddingHorizontal: sizeToken.paddingHorizontal,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: theme.spacing.sm,
                    opacity: disabled ? 0.5 : 1,
                },
                style,
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            {loading ? (
                <ActivityIndicator color={textColor} />
            ) : (
                <>
                    {leftIcon}
                    <Text
                        style={{
                            color: textColor,
                            fontFamily: "ChairoSans",
                            fontSize: sizeToken.fontSize,
                        }}
                    >
                        {label}
                    </Text>
                    {rightIcon}
                </>
            )}
        </TouchableOpacity>
    );
};

export default Button;



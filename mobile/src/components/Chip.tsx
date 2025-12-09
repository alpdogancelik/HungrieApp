import { ReactNode } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";

type ChipProps = {
    label: string;
    selected?: boolean;
    badgeCount?: number;
    onPress?: () => void;
    icon?: ReactNode;
};

export const Chip = ({ label, selected = false, badgeCount, onPress, icon }: ChipProps) => {
    const { theme } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? `${theme.colors.primary}22` : theme.colors.surface,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
        >
            {icon}
            <Text
                style={{
                    color: selected ? theme.colors.primary : theme.colors.ink,
                    fontFamily: "ChairoSans",
                }}
            >
                {label}
            </Text>
            {badgeCount !== undefined && (
                <View
                    style={{
                        backgroundColor: selected ? theme.colors.primary : theme.colors.border,
                        borderRadius: theme.radius.sm,
                        paddingHorizontal: theme.spacing.xs,
                        paddingVertical: 2,
                    }}
                >
                    <Text
                        style={{
                            color: selected ? theme.colors.surface : theme.colors.ink,
                            fontSize: theme.typography.caption,
                            fontFamily: "ChairoSans",
                        }}
                    >
                        {badgeCount}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
};

export default Chip;



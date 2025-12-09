import { ReactNode } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";

type ActionConfig = {
    label?: string;
    icon?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
};

type AppBarProps = {
    title: string;
    leftAction?: ActionConfig;
    rightAction?: ActionConfig;
};

const renderAction = (action: ActionConfig | undefined, themeColors: ReturnType<typeof useTheme>["theme"]["colors"]) => {
    if (!action) return <View style={{ width: 48 }} />;
    const content = action.icon ? (
        action.icon
    ) : (
        <Text style={{ color: themeColors.primary, fontFamily: "ChairoSans" }}>{action.label}</Text>
    );
    return (
        <TouchableOpacity
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel || action.label}
            style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {content}
        </TouchableOpacity>
    );
};

export const AppBar = ({ title, leftAction, rightAction }: AppBarProps) => {
    const { theme } = useTheme();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
                backgroundColor: theme.colors.surface,
            }}
        >
            {renderAction(leftAction, theme.colors)}
            <Text
                style={{
                    fontFamily: "ChairoSans",
                    fontSize: theme.typography.h1,
                    color: theme.colors.ink,
                }}
            >
                {title}
            </Text>
            {renderAction(rightAction, theme.colors)}
        </View>
    );
};

export default AppBar;



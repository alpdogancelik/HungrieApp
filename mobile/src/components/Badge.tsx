import { Text, View } from "react-native";
import { useTheme } from "@/src/theme/themeContext";

type BadgeStatus = "success" | "warning" | "danger" | "info";

const statusMap = (colors: ReturnType<typeof useTheme>["theme"]["colors"]) => ({
    success: { bg: `${colors.success}22`, text: colors.success },
    warning: { bg: `${colors.warning}22`, text: colors.warning },
    danger: { bg: `${colors.danger}22`, text: colors.danger },
    info: { bg: `${colors.primary}22`, text: colors.primary },
});

export const Badge = ({ label, status = "info" }: { label: string; status?: BadgeStatus }) => {
    const { theme } = useTheme();
    const palette = statusMap(theme.colors)[status];
    return (
        <View
            style={{
                backgroundColor: palette.bg,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 4,
                borderRadius: theme.radius.md,
            }}
        >
            <Text
                style={{
                    color: palette.text,
                    fontFamily: "ChairoSans",
                    fontSize: theme.typography.caption,
                }}
            >
                {label}
            </Text>
        </View>
    );
};

export default Badge;



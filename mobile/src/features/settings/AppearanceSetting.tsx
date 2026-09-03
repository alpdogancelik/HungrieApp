import { StyleSheet, Switch, Text, View } from "react-native";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/src/theme/themeContext";

type AppearanceSettingProps = {
    compact?: boolean;
};

const AppearanceSetting = ({ compact = false }: AppearanceSettingProps) => {
    const { i18n } = useTranslation();
    const { theme, variant, setVariant } = useTheme();
    const isDark = variant === "dark";
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const title = isTurkish ? "Koyu mod" : "Dark mode";
    const description = isTurkish
        ? "Hungrie'yi koyu renklerle kullan."
        : "Use Hungrie with a dark color palette.";

    return (
        <View
            style={[
                styles.container,
                compact ? styles.compact : null,
                { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
            ]}
        >
            <View style={[styles.iconWrap, { backgroundColor: isDark ? theme.colors.surfaceMuted : "#FFF1E7" }]}>
                <Ionicons name={isDark ? "moon" : "moon-outline"} size={21} color={theme.colors.primary} />
            </View>
            <View style={styles.copy}>
                <Text style={[styles.title, { color: theme.colors.ink }]}>{title}</Text>
                <Text style={[styles.description, { color: theme.colors.textSecondary }]}>{description}</Text>
            </View>
            <Switch
                value={isDark}
                onValueChange={(enabled) => setVariant(enabled ? "dark" : "light")}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor={isDark ? theme.colors.onPrimary : theme.colors.surface}
                ios_backgroundColor={theme.colors.border}
                accessibilityLabel={title}
                accessibilityHint={description}
            />
        </View>
    );
};

const styles = createAdaptiveStyleSheet({
    container: {
        width: "100%",
        minHeight: 76,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 13,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    compact: {
        marginTop: 18,
    },
    iconWrap: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    copy: {
        flex: 1,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 21,
    },
    description: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 13,
        lineHeight: 18,
    },
});

export default AppearanceSetting;

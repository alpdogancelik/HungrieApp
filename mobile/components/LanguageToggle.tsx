import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";

import { useTheme, ThemeDefinition } from "@/src/theme/themeContext";

const STORAGE_KEY = "hungrie.language";

const LanguageToggle = () => {
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const [hydrated, setHydrated] = useState(false);
    const [current, setCurrent] = useState(i18n.language || "en");
    const styles = useMemo(() => createStyles(theme), [theme]);

    useEffect(() => {
        const loadLanguage = async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored && stored !== current) {
                    setCurrent(stored);
                    await i18n.changeLanguage(stored);
                }
            } catch {
                // ignore hydration errors, fall back to default language
            } finally {
                setHydrated(true);
            }
        };

        void loadLanguage();
    }, []);

    useEffect(() => {
        const handleChange = (lng: string) => setCurrent(lng);
        i18n.on("languageChanged", handleChange);
        return () => i18n.off("languageChanged", handleChange);
    }, [i18n]);

    const toggleLanguage = async () => {
        const next = current === "en" ? "tr" : "en";
        setCurrent(next);
        try {
            await i18n.changeLanguage(next);
            await AsyncStorage.setItem(STORAGE_KEY, next);
        } catch {
            // noop
        }
    };

    const helperText = current === "tr" ? "Dil" : "Language";

    return (
        <TouchableOpacity
            onPress={toggleLanguage}
            disabled={!hydrated}
            accessibilityRole="button"
            accessibilityLabel="Toggle language"
            style={[styles.container, { opacity: hydrated ? 1 : 0.6 }]}
        >
            <Text style={styles.helper}>{helperText}</Text>
            <View style={styles.badge}>
                {!hydrated ? (
                    <ActivityIndicator size="small" color={theme.colors.ink} />
                ) : (
                    <Text style={styles.label}>{current.toUpperCase()}</Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

const createStyles = (theme: ThemeDefinition) =>
    StyleSheet.create({
        container: {
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.sm,
        },
        badge: {
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            minWidth: 52,
        },
        helper: {
            color: theme.colors.muted,
            fontFamily: "ChairoSans",
            fontSize: 11,
        },
        label: {
            fontFamily: "ChairoSans",
            color: theme.colors.ink,
            letterSpacing: 0.5,
            fontSize: 12,
        },
    });

export default LanguageToggle;

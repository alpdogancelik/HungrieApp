import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";

import { useTheme, ThemeDefinition } from "@/src/theme/themeContext";

const STORAGE_KEY = "hungrie.language";

type LanguageToggleProps = {
    appearance?: "default" | "inverse";
    showLabel?: boolean;
};

const LanguageToggle = ({ appearance = "default", showLabel = true }: LanguageToggleProps) => {
    const { theme } = useTheme();
    const { i18n } = useTranslation();
    const [hydrated, setHydrated] = useState(false);
    const [current, setCurrent] = useState(i18n.language || "en");
    const styles = useMemo(() => createStyles(theme, appearance), [theme, appearance]);

    useEffect(() => {
        const loadLanguage = async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (stored && stored !== i18n.language) {
                    setCurrent(stored);
                    await i18n.changeLanguage(stored);
                }
            } catch {
                // ignore hydration errors
            } finally {
                setHydrated(true);
            }
        };

        void loadLanguage();
    }, [i18n]);

    useEffect(() => {
        const handleChange = (lng: string) => setCurrent(lng);
        i18n.on("languageChanged", handleChange);
        return () => i18n.off("languageChanged", handleChange);
    }, [i18n]);

    const selectLanguage = async (next: "tr" | "en") => {
        if (next === current) return;
        setCurrent(next);
        try {
            await i18n.changeLanguage(next);
            await AsyncStorage.setItem(STORAGE_KEY, next);
        } catch {
            // noop
        }
    };

    return (
        <View style={[styles.container, { opacity: hydrated ? 1 : 0.75 }]}>
            {showLabel ? <Text style={styles.helper}>{current === "tr" ? "Dil" : "Language"}</Text> : null}

            <View style={styles.segmentedControl}>
                {!hydrated ? (
                    <View style={styles.loaderWrap}>
                        <ActivityIndicator size="small" color={appearance === "inverse" ? "#FFFFFF" : theme.colors.ink} />
                    </View>
                ) : (
                    <>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Switch language to Turkish"
                            onPress={() => selectLanguage("tr")}
                            style={[styles.option, current === "tr" && styles.optionActive]}
                        >
                            <Text style={[styles.optionLabel, current === "tr" && styles.optionLabelActive]}>TR</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Switch language to English"
                            onPress={() => selectLanguage("en")}
                            style={[styles.option, current === "en" && styles.optionActive]}
                        >
                            <Text style={[styles.optionLabel, current === "en" && styles.optionLabelActive]}>EN</Text>
                        </Pressable>
                    </>
                )}
            </View>
        </View>
    );
};

const createStyles = (theme: ThemeDefinition, appearance: "default" | "inverse") => {
    const inverse = appearance === "inverse";
    const baseBorder = inverse ? "rgba(255,255,255,0.35)" : theme.colors.border;
    const baseSurface = inverse ? "rgba(255,255,255,0.12)" : theme.colors.surface;
    const activeSurface = inverse ? "#FFFFFF" : theme.colors.surface;
    const baseText = inverse ? "rgba(255,255,255,0.8)" : theme.colors.muted;
    const activeText = inverse ? "#0F172A" : theme.colors.ink;

    return StyleSheet.create({
        container: {
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.sm,
        },
        helper: {
            color: baseText,
            fontFamily: "ChairoSans",
            fontSize: 11,
        },
        segmentedControl: {
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: baseBorder,
            backgroundColor: baseSurface,
            padding: 4,
            minHeight: 40,
        },
        loaderWrap: {
            width: 88,
            alignItems: "center",
            justifyContent: "center",
        },
        option: {
            minWidth: 40,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
        },
        optionActive: {
            backgroundColor: activeSurface,
        },
        optionLabel: {
            color: baseText,
            fontFamily: "ChairoSans",
            fontSize: 12,
            letterSpacing: 0.5,
        },
        optionLabelActive: {
            color: activeText,
        },
    });
};

export default LanguageToggle;

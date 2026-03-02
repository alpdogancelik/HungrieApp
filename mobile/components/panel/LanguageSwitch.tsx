import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PanelLocale } from "@/src/features/restaurantPanel/panelLocale";

type Props = {
    locale: PanelLocale;
    onChange: (next: PanelLocale) => void;
    getAccessibilityLabel?: (next: PanelLocale) => string;
};

const LanguageSwitch = ({ locale, onChange, getAccessibilityLabel }: Props) => {
    return (
        <View style={styles.wrap}>
            {(["tr", "en"] as const).map((item) => {
                const active = locale === item;
                return (
                    <Pressable
                        key={item}
                        onPress={() => onChange(item)}
                        accessibilityRole="button"
                        accessibilityLabel={getAccessibilityLabel ? getAccessibilityLabel(item) : `Switch language to ${item.toUpperCase()}`}
                        style={({ pressed }) => [
                            styles.pill,
                            active ? styles.pillActive : null,
                            pressed ? { opacity: 0.9 } : null,
                        ]}
                    >
                        <Text style={[styles.label, active ? styles.labelActive : null]}>{item.toUpperCase()}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        gap: 6,
        alignSelf: "flex-start",
        padding: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E7DCCF",
        backgroundColor: "#FFFDF8",
    },
    pill: {
        minWidth: 44,
        minHeight: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#D8C6AF",
        backgroundColor: "#FFF9F2",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    pillActive: {
        borderColor: "#EE7A14",
        backgroundColor: "#FFF1E3",
        shadowColor: "#EE7A14",
        shadowOpacity: 0.14,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#546276",
    },
    labelActive: {
        color: "#B94900",
    },
});

export default LanguageSwitch;

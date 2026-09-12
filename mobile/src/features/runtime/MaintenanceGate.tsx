import { useEffect, useState } from "react";
import { Modal, Platform, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { useTheme } from "@/src/theme/themeContext";
import { subscribeRuntimeStatus, type RuntimeStatus } from "./runtimeStatus";

const MaintenanceGate = () => {
    const { i18n } = useTranslation();
    const { theme } = useTheme();
    const [status, setStatus] = useState<RuntimeStatus | null>(null);
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    useEffect(() => subscribeRuntimeStatus(setStatus), []);
    return (
        <Modal visible={status?.mode === "maintenance"} transparent animationType="fade" statusBarTranslucent>
            <SafeAreaView style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
                <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]} accessibilityRole="alert">
                    <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Ionicons name="construct-outline" size={38} color="#FE8C00" />
                    </View>
                    <Text style={[styles.title, { color: theme.colors.ink }]}>
                        {isTurkish ? "Kısa bir bakımdayız" : "We’ll be back shortly"}
                    </Text>
                    <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
                        {isTurkish
                            ? "Hungrie şu anda güvenli bir güncellemeden geçiyor. Lütfen birkaç dakika sonra tekrar deneyin."
                            : "Hungrie is undergoing a safe update. Please try again in a few minutes."}
                    </Text>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = createAdaptiveStyleSheet({
    overlay: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
    card: {
        width: "100%", maxWidth: 420, alignItems: "center", borderRadius: 28, paddingHorizontal: 24, paddingVertical: 30,
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.2, shadowRadius: 28 },
            android: { elevation: 16 },
            default: { boxShadow: "0 14px 40px rgba(0,0,0,0.2)" },
        }),
    },
    iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 18 },
    title: { fontFamily: "ChairoSans", fontSize: 23, lineHeight: 30, textAlign: "center" },
    message: { marginTop: 10, fontFamily: "ChairoSans", fontSize: 15, lineHeight: 23, textAlign: "center" },
});

export default MaintenanceGate;

import { useCallback, useEffect, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Network from "expo-network";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/themeContext";

const isOfflineState = (state: Network.NetworkState) =>
    state.isConnected === false || state.isInternetReachable === false;

const InternetConnectionGate = () => {
    const { i18n } = useTranslation();
    const { theme } = useTheme();
    const [isOffline, setIsOffline] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");

    const checkConnection = useCallback(async () => {
        setIsChecking(true);
        try {
            const state = await Network.getNetworkStateAsync();
            setIsOffline(isOfflineState(state));
        } catch {
            // A failed status check should not lock a connected user out of the app.
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        void checkConnection();

        const networkSubscription = Network.addNetworkStateListener((state) => {
            setIsOffline(isOfflineState(state));
        });
        const appStateSubscription = AppState.addEventListener("change", (state) => {
            if (state === "active") void checkConnection();
        });

        return () => {
            networkSubscription.remove();
            appStateSubscription.remove();
        };
    }, [checkConnection]);

    return (
        <Modal
            visible={isOffline}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => undefined}
        >
            <SafeAreaView style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
                <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]} accessibilityRole="alert">
                    <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <Ionicons name="cloud-offline-outline" size={38} color="#E56E00" />
                    </View>
                    <Text style={[styles.title, { color: theme.colors.ink }]}>{isTurkish ? "İnternet bağlantısı gerekli" : "Internet connection required"}</Text>
                    <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
                        {isTurkish
                            ? "Hungrie'yi kullanmak için internete bağlı olmanız gerekiyor. Bağlantınızı kontrol edip tekrar deneyin."
                            : "You need to be connected to the internet to use Hungrie. Check your connection and try again."}
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isTurkish ? "Bağlantıyı tekrar kontrol et" : "Check connection again"}
                        disabled={isChecking}
                        onPress={() => void checkConnection()}
                        style={({ pressed }) => [
                            styles.retryButton,
                            pressed ? styles.retryButtonPressed : null,
                            isChecking ? styles.retryButtonDisabled : null,
                        ]}
                    >
                        <Ionicons name="refresh" size={19} color="#FFFFFF" />
                        <Text style={styles.retryText}>
                            {isChecking
                                ? isTurkish
                                    ? "Kontrol ediliyor..."
                                    : "Checking..."
                                : isTurkish
                                  ? "Tekrar dene"
                                  : "Try again"}
                        </Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = createAdaptiveStyleSheet({
    overlay: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        backgroundColor: "rgba(11, 18, 32, 0.72)",
    },
    card: {
        width: "100%",
        maxWidth: 420,
        alignItems: "center",
        borderRadius: 28,
        paddingHorizontal: 24,
        paddingVertical: 28,
        backgroundColor: "#FFFFFF",
        ...Platform.select({
            ios: {
                shadowColor: "#000000",
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.2,
                shadowRadius: 28,
            },
            android: { elevation: 16 },
            default: { boxShadow: "0 14px 40px rgba(0,0,0,0.2)" },
        }),
    },
    iconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 18,
        backgroundColor: "#FFF1E7",
    },
    title: {
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 23,
        lineHeight: 30,
        textAlign: "center",
    },
    message: {
        marginTop: 10,
        color: "#475569",
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 23,
        textAlign: "center",
    },
    retryButton: {
        minHeight: 48,
        marginTop: 22,
        paddingHorizontal: 24,
        borderRadius: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#FE8C00",
    },
    retryButtonPressed: {
        opacity: 0.84,
    },
    retryButtonDisabled: {
        opacity: 0.62,
    },
    retryText: {
        color: "#FFFFFF",
        fontFamily: "ChairoSans",
        fontSize: 16,
    },
});

export default InternetConnectionGate;

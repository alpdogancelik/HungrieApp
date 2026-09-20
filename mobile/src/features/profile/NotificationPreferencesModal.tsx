import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import { useTheme } from "@/src/theme/themeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { profileImages } from "@/constants/profileMedia";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { getNotificationPreferences, updateNotificationPreferences } from "@/src/data/notificationRepository";
import type { NotificationPreferences } from "@/src/data/contracts";
const defaultPrefs: NotificationPreferences = {
    orderStatus: true,
    restaurantOrders: false,
    reviewReplies: true,
};
const notificationUi = createAdaptiveStyleSheet({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        justifyContent: "flex-end",
    },
    dismissArea: {
        flex: 1,
    },
    sheet: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24,
        rowGap: 20,
    },
    dragHandle: {
        height: 4,
        width: 64,
        borderRadius: 999,
        backgroundColor: "#E5E7EB",
        alignSelf: "center",
    },
    heroRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
    heroImage: {
        width: 56,
        height: 56,
        borderRadius: 16,
    },
    title: {
        fontSize: 22,
        lineHeight: 28,
        color: "#111827",
        fontFamily: "ChairoSans-Bold",
    },
    subtitle: {
        marginTop: 2,
        fontSize: 14,
        lineHeight: 20,
        color: "#6B7280",
        fontFamily: "ChairoSans",
    },
    permissionError: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 16,
        color: "#EF4444",
        fontFamily: "ChairoSans",
    },
    permissionHint: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 16,
        color: "#94A3B8",
        fontFamily: "ChairoSans",
    },
    rows: {
        rowGap: 8,
    },
    rowButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    rowLabel: {
        flex: 1,
        paddingRight: 12,
        fontSize: 16,
        lineHeight: 22,
        color: "#111827",
        fontFamily: "ChairoSans-SemiBold",
    },
    toggleTrack: {
        width: 50,
        height: 30,
        borderRadius: 999,
        padding: 4,
        justifyContent: "center",
    },
    toggleThumb: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#FFFFFF",
    },
    saveButton: {
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    saveButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        lineHeight: 22,
        fontFamily: "ChairoSans-SemiBold",
    },
});

export const NotificationPreferencesModal = ({
    visible,
    isRestaurantMember,
    onClose,
}: {
    visible: boolean;
    isRestaurantMember: boolean;
    onClose: () => void;
}) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const [prefs, setPrefs] = useState<NotificationPreferences>(defaultPrefs);
    const [loading, setLoading] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

    useEffect(() => {
        if (!visible) return;
        const loadPrefs = async () => {
            try {
                setPrefs(await getNotificationPreferences());
            } catch {
                Alert.alert(t("cart.screen.notifications.title"), t("cart.screen.notifications.loadError"));
            }
        };
        void loadPrefs();
    }, [t, visible]);

    useEffect(() => {
        if (!visible) return;
        const request = async () => {
            const granted = await NotificationManager.requestPermissions();
            setPermissionGranted(granted);
        };
        void request();
    }, [visible]);

    const toggle = (key: keyof NotificationPreferences) => {
        setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            setPrefs(await updateNotificationPreferences(prefs));
            onClose();
        } catch {
            Alert.alert(t("cart.screen.notifications.title"), t("cart.screen.notifications.saveError"));
        } finally {
            setLoading(false);
        }
    };

    const rows: Array<{ key: keyof NotificationPreferences; label: string }> = [
        { key: "orderStatus", label: t("cart.screen.notifications.orderStatus") },
        ...(isRestaurantMember
            ? [{ key: "restaurantOrders" as const, label: t("cart.screen.notifications.restaurantOrders", "Restaurant orders and reminders") }]
            : []),
        { key: "reviewReplies", label: t("cart.screen.notifications.reviewReplies") },
    ];

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={notificationUi.backdrop}>
                <Pressable style={notificationUi.dismissArea} onPress={onClose} />
                <View style={[notificationUi.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <View style={notificationUi.dragHandle} />

                    <View style={notificationUi.heroRow}>
                        <Image source={profileImages.deliveryReview} style={notificationUi.heroImage} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                            <Text style={notificationUi.title}>{t("cart.screen.notifications.title")}</Text>
                            <Text style={notificationUi.subtitle}>{t("cart.screen.notifications.subtitle")}</Text>

                            {permissionGranted === false ? (
                                <Text style={notificationUi.permissionError}>{t("cart.screen.notifications.permissionDenied")}</Text>
                            ) : null}
                            {permissionGranted === null ? (
                                <Text style={notificationUi.permissionHint}>{t("cart.screen.notifications.permissionNeeded")}</Text>
                            ) : null}
                        </View>
                    </View>

                    <View style={notificationUi.rows}>
                        {rows.map((row) => (
                            <TouchableOpacity key={row.key} style={notificationUi.rowButton} onPress={() => toggle(row.key)}>
                                <Text style={notificationUi.rowLabel}>{row.label}</Text>

                                <View
                                    style={[
                                        notificationUi.toggleTrack,
                                        {
                                            backgroundColor: prefs[row.key] ? theme.colors.primary : "#E2E8F0",
                                            alignItems: prefs[row.key] ? "flex-end" : "flex-start",
                                        },
                                    ]}
                                >
                                    <View style={notificationUi.toggleThumb} />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[notificationUi.saveButton, { opacity: loading ? 0.7 : 1 }]}
                        disabled={loading}
                        onPress={handleSave}
                    >
                        <Text style={notificationUi.saveButtonText}>
                            {loading ? t("cart.screen.notifications.saving") : t("cart.screen.notifications.save")}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

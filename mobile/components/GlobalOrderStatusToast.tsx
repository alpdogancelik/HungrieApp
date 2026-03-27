import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useAuthStore from "@/store/auth.store";
import { auth } from "@/lib/firebase";
import { subscribeUserOrders } from "@/src/services/firebaseOrders";
import { makeShadow } from "@/src/lib/shadowStyle";
import { cookingScenes } from "@/constants/mediaCatalog";

type NormalizedOrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "canceled";
type ToastTone = "info" | "success" | "danger";

type ToastPayload = {
    key: string;
    orderId: string;
    status: NormalizedOrderStatus;
    title: string;
    subtitle: string;
    tone: ToastTone;
};

const VISIBLE_DURATION_MS = 120000;

const ACTIVE_STATUSES: NormalizedOrderStatus[] = ["pending", "preparing", "ready", "out_for_delivery"];
const TERMINAL_STATUSES: NormalizedOrderStatus[] = ["delivered", "canceled"];

const normalizeStatus = (status?: string | null): NormalizedOrderStatus => {
    const raw = String(status || "").toLowerCase();
    if (raw === "accepted") return "preparing";
    if (raw === "rejected") return "canceled";
    if (["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(raw)) {
        return raw as NormalizedOrderStatus;
    }
    return "pending";
};

const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value?.toMillis === "function") {
        return value.toMillis();
    }
    if (typeof value?.seconds === "number") {
        const nanos = typeof value?.nanoseconds === "number" ? value.nanoseconds : 0;
        return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
    return 0;
};

const pickTrackedOrder = (orders: any[]) => {
    if (!Array.isArray(orders) || !orders.length) return null;
    const normalized = orders
        .filter((item) => item && item.id)
        .map((item) => {
            const status = normalizeStatus(item.status);
            const updatedAt = toMillis(item.updatedAt) || toMillis(item.createdAt);
            return { ...item, status, updatedAt };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);

    const active = normalized.find((order) => ACTIVE_STATUSES.includes(order.status));
    if (active) return active;
    return normalized.find((order) => TERMINAL_STATUSES.includes(order.status)) ?? normalized[0];
};

const buildToast = (order: any): ToastPayload => {
    const status = normalizeStatus(order?.status);
    const orderId = String(order?.id || "");
    switch (status) {
        case "pending":
            return {
                key: `${orderId}:${status}`,
                orderId,
                status,
                title: "Siparis onayi bekleniyor",
                subtitle: "Restorandan yanit bekleniyor.",
                tone: "info",
            };
        case "canceled":
            return {
                key: `${orderId}:${status}`,
                orderId,
                status,
                title: "Siparis onaylanmadi",
                subtitle: "Restoran bu siparisi reddetti.",
                tone: "danger",
            };
        case "delivered":
            return {
                key: `${orderId}:${status}`,
                orderId,
                status,
                title: "Siparis tamamlandi",
                subtitle: "Teslimat basariyla tamamlandi.",
                tone: "success",
            };
        case "ready":
            return {
                key: `${orderId}:${status}`,
                orderId,
                status,
                title: "Siparis onaylandi",
                subtitle: "Siparisin teslime hazir.",
                tone: "success",
            };
        case "out_for_delivery":
            return {
                key: `${orderId}:${status}`,
                orderId,
                status,
                title: "Siparis onaylandi",
                subtitle: "Surdurulen bir siparisin var, kurye yolda.",
                tone: "success",
            };
        default:
            return {
                key: `${orderId}:${status}`,
                orderId,
                status,
                title: "Siparis onaylandi",
                subtitle: "Surdurulen bir siparisin var.",
                tone: "success",
            };
    }
};

const GlobalOrderStatusToast = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const userId = useAuthStore((state) => state.user?.accountId ?? null);
    const [toast, setToast] = useState<ToastPayload | null>(null);
    const [visible, setVisible] = useState(false);
    const progress = useRef(new Animated.Value(0)).current;
    const useNativeDriver = Platform.OS !== "web";
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastKeyRef = useRef<string | null>(null);

    const clearHideTimer = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    }, []);

    const animateOut = useCallback(() => {
        clearHideTimer();
        Animated.timing(progress, {
            toValue: 0,
            duration: 260,
            useNativeDriver,
        }).start(({ finished }) => {
            if (finished) {
                setVisible(false);
            }
        });
    }, [clearHideTimer, progress, useNativeDriver]);

    const scheduleHide = useCallback(() => {
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
            animateOut();
        }, VISIBLE_DURATION_MS);
    }, [animateOut, clearHideTimer]);

    const showToast = useCallback(
        (next: ToastPayload) => {
            setToast(next);
            setVisible(true);
            progress.setValue(0);
            Animated.timing(progress, {
                toValue: 1,
                duration: 300,
                useNativeDriver,
            }).start();
            scheduleHide();
        },
        [progress, scheduleHide, useNativeDriver],
    );

    useEffect(() => {
        const resolvedUserId = auth?.currentUser?.uid ?? userId ?? null;
        if (!resolvedUserId) {
            setToast(null);
            setVisible(false);
            clearHideTimer();
            lastKeyRef.current = null;
            return undefined;
        }

        return subscribeUserOrders(resolvedUserId, (orders) => {
            const tracked = pickTrackedOrder(orders || []);
            if (!tracked) return;
            const nextToast = buildToast(tracked);
            if (lastKeyRef.current === nextToast.key) return;
            lastKeyRef.current = nextToast.key;
            showToast(nextToast);
        });
    }, [clearHideTimer, showToast, userId]);

    useEffect(() => {
        return () => {
            clearHideTimer();
        };
    }, [clearHideTimer]);

    const translateY = useMemo(
        () =>
            progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-18, 0],
            }),
        [progress],
    );

    const opacity = useMemo(
        () =>
            progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
            }),
        [progress],
    );

    if (!visible || !toast) return null;

    const accent = toast.tone === "danger" ? "#EF4444" : toast.tone === "success" ? "#10B981" : "#0EA5E9";
    const bg = toast.tone === "danger" ? "#FEF2F2" : toast.tone === "success" ? "#ECFDF5" : "#F0F9FF";
    const border = toast.tone === "danger" ? "#FECACA" : toast.tone === "success" ? "#A7F3D0" : "#BAE6FD";
    const iconName = toast.tone === "danger" ? "x" : toast.tone === "success" ? "check" : "clock";
    const StatusIllustration = toast.tone === "danger" ? cookingScenes.kitchenRush : cookingScenes.orderAccepted;

    return (
        <Animated.View
            style={[
                styles.wrap,
                {
                    pointerEvents: "box-none",
                    top: Math.max(insets.top + 6, 12),
                    opacity,
                    transform: [{ translateY }],
                },
            ]}
        >
            <Pressable
                onPress={() =>
                    router.push({
                        pathname: "/order/pending",
                        params: { orderId: toast.orderId },
                    })
                }
                style={[styles.card, { backgroundColor: bg, borderColor: border }]}
            >
                <View style={[styles.iconCircle, { backgroundColor: "#FFFFFF", borderColor: border }]}>
                    <Feather name={iconName} size={13} color={accent} />
                </View>
                <View style={styles.textWrap}>
                    <Text style={[styles.title, { color: "#0F172A" }]} numberOfLines={1}>
                        {toast.title}
                    </Text>
                    <Text style={[styles.subtitle, { color: "#334155" }]} numberOfLines={1}>
                        {toast.subtitle}
                    </Text>
                </View>
                <View style={styles.artWrap}>
                    <StatusIllustration width={26} height={26} />
                </View>
            </Pressable>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        left: 12,
        right: 12,
        zIndex: 9998,
    },
    card: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
        ...makeShadow({ color: "#0F172A", offsetY: 4, blurRadius: 8, opacity: 0.08, elevation: 3 }),
        elevation: 3,
    },
    iconCircle: {
        width: 20,
        height: 20,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    textWrap: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 14,
    },
    subtitle: {
        marginTop: 1,
        fontFamily: "ChairoSans",
        fontSize: 10,
        lineHeight: 12,
    },
    artWrap: {
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.95,
    },
});

export default GlobalOrderStatusToast;

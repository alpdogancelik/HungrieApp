import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Platform,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import useOrderRealtime from "@/src/hooks/useOrderRealtime";
import { changeStatus, nudgeRestaurant } from "@/src/api/client";
import { emitOrderEvent } from "@/src/lib/realtime";
import type { OrderStatus } from "@/src/domain/types";

type Props = {
    orderId: string;
    restaurantName: string;
    etaSeconds?: number;
    onConfirmed?: (orderId: string) => void;
    onRejected?: (orderId: string) => void;
};

const colors = {
    bg: "#0E0F12",
    card: "#15171C",
    elevated: "#1C2027",
    text: "#EDEFF3",
    sub: "#A8B0BF",
    primary: "#63E6FF",
    secondary: "#B98CFF",
    success: "#38D39F",
    danger: "#FF6B6B",
    warning: "#FFD166",
    border: "#262A33",
};

const radius = {
    sm: 12,
    md: 16,
    lg: 24,
};

const CANCEL_WINDOW_SECONDS = 60;

const getCancelWindowRemaining = (timestamp?: string) => {
    if (!timestamp) return CANCEL_WINDOW_SECONDS;
    const createdAt = new Date(timestamp).getTime();
    if (Number.isNaN(createdAt)) return CANCEL_WINDOW_SECONDS;
    const diffSeconds = Math.floor((Date.now() - createdAt) / 1000);
    return Math.max(CANCEL_WINDOW_SECONDS - diffSeconds, 0);
};

const formatTime = (seconds: number) => {
    const safe = Math.max(seconds, 0);
    const mm = Math.floor(safe / 60)
        .toString()
        .padStart(2, "0");
    const ss = (safe % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
};

const StepRow = ({
    icon,
    title,
    subtitle,
    status,
}: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    status: "done" | "active" | "pending" | "danger";
}) => {
    const tint =
        status === "done"
            ? colors.success
            : status === "active"
                ? colors.primary
                : status === "danger"
                    ? colors.danger
                    : colors.sub;

    return (
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <View
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: colors.elevated,
                }}
            >
                {icon}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: "Ezra-SemiBold", fontSize: 16 }}>{title}</Text>
                {subtitle ? (
                    <Text style={{ color: colors.sub, marginTop: 2, fontSize: 14 }}>{subtitle}</Text>
                ) : null}
            </View>
            <View
                style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: tint,
                }}
            />
        </View>
    );
};

const OrderPendingScreen = ({
    orderId,
    restaurantName,
    etaSeconds = 120,
    onConfirmed,
    onRejected,
}: Props) => {
    const { order } = useOrderRealtime(orderId);
    const orderStatus = (order?.status ?? "pending") as OrderStatus;
    const baseEtaSeconds = useMemo(() => (order?.etaMinutes ? order.etaMinutes * 60 : etaSeconds), [order?.etaMinutes, etaSeconds]);
    const [sla, setSla] = useState(baseEtaSeconds);
    const [cooldown, setCooldown] = useState(0);
    const [sendingNudge, setSendingNudge] = useState(false);
    const [autoCanceled, setAutoCanceled] = useState(false);
    const [cancelWindowRemaining, setCancelWindowRemaining] = useState(CANCEL_WINDOW_SECONDS);
    const spinner = useRef(new Animated.Value(0)).current;
    const prevStatus = useRef<OrderStatus>("pending");
    const isCancelWindowActive = orderStatus === "pending" && cancelWindowRemaining > 0 && !autoCanceled;

    const handleAutoCancel = useCallback(async () => {
        if (autoCanceled || !orderId) return;
        setAutoCanceled(true);
        try {
            await changeStatus({ orderId, status: "canceled" });
            emitOrderEvent("order_auto_canceled", { id: orderId, status: "canceled" });
            setCancelWindowRemaining(0);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
            onRejected?.(orderId);
        } catch (err: any) {
            setAutoCanceled(false);
            Alert.alert("Unable to cancel", err?.message || "Please try again.");
        }
    }, [autoCanceled, orderId, onRejected]);

    useEffect(() => {
        setSla(baseEtaSeconds);
    }, [baseEtaSeconds]);

    useEffect(() => {
        Animated.loop(
            Animated.timing(spinner, {
                toValue: 1,
                duration: 2000,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        ).start();
    }, [spinner]);

    useEffect(() => {
        if (orderStatus === "delivered" || orderStatus === "canceled") return;
        const timer = setInterval(() => {
            setSla((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleAutoCancel();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [orderStatus, handleAutoCancel]);

    useEffect(() => {
        const ticker = setInterval(() => {
            setSla((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(ticker);
    }, []);

    useEffect(() => {
        if (!cooldown) return undefined;
        const timer = setInterval(() => {
            setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    useEffect(() => {
        const timestamp = order?.createdAt || order?.updatedAt;
        setCancelWindowRemaining(getCancelWindowRemaining(timestamp));
    }, [order?.createdAt, order?.updatedAt]);

    useEffect(() => {
        if (!isCancelWindowActive) return undefined;
        const timer = setInterval(() => {
            setCancelWindowRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [isCancelWindowActive]);

    useEffect(() => {
        if (prevStatus.current === orderStatus) return;
        if (["preparing", "ready", "out_for_delivery", "delivered"].includes(orderStatus)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
            onConfirmed?.(orderId);
        } else if (orderStatus === "canceled") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
            Alert.alert("Order canceled", `${restaurantName} bu siparişi şu anda onaylayamıyor.`);
            onRejected?.(orderId);
        }
        prevStatus.current = orderStatus;
    }, [orderStatus, onConfirmed, onRejected, orderId, restaurantName]);

    const slaColor = sla === 0 ? colors.danger : sla < 30 ? colors.warning : colors.primary;

    const steps = useMemo(() => {
        const sequence = [
            {
                id: "received",
                title: "Sipariş alındı",
                subtitle: "Ödeme onaylandı",
                indicator: "received" as const,
                icon: <Feather name="check-circle" size={22} color={colors.success} />,
            },
            {
                id: "pending",
                title: "Restorana iletildi",
                subtitle: `${restaurantName} paneline düştü`,
                indicator: "pending" as OrderStatus,
                icon: <MaterialCommunityIcons name="storefront-outline" size={22} color={colors.primary} />,
            },
            {
                id: "preparing",
                title: "Hazırlanıyor",
                subtitle: "Şefler siparişi hazırlıyor",
                indicator: "preparing" as OrderStatus,
                icon: <Ionicons name="time-outline" size={22} color={colors.warning} />,
            },
            {
                id: "ready",
                title: "Teslime hazır",
                subtitle: "Kurye teslim alacak",
                indicator: "ready" as OrderStatus,
                icon: <Feather name="thumbs-up" size={22} color={colors.success} />,
            },
            {
                id: "out_for_delivery",
                title: "Yolda",
                subtitle: "Kurye kampüse geliyor",
                indicator: "out_for_delivery" as OrderStatus,
                icon: <MaterialCommunityIcons name="bike" size={22} color={colors.primary} />,
            },
        ];

        const statusOrder: OrderStatus[] = ["pending", "preparing", "ready", "out_for_delivery", "delivered"];
        const activeIndex = statusOrder.indexOf(orderStatus);

        const mapped = sequence.map((step) => {
            let state: "done" | "active" | "pending" | "danger" = "pending";
            if (step.indicator === "received") state = "done";
            else if (orderStatus === "canceled") state = "danger";
            else {
                const idx = statusOrder.indexOf(step.indicator as OrderStatus);
                if (idx < activeIndex) state = "done";
                else if (idx === activeIndex) state = "active";
            }
            return { ...step, status: state };
        });

        if (orderStatus === "delivered") {
            mapped.push({
                id: "delivered",
                title: "Teslim edildi",
                subtitle: "Afiyet olsun!",
                indicator: "delivered",
                status: "done",
                icon: <Feather name="check" size={22} color={colors.success} />,
            });
        }

        if (orderStatus === "canceled") {
            mapped.push({
                id: "canceled",
                title: "Sipariş iptal edildi",
                subtitle: "Ödeme iadesi başlatılıyor",
                indicator: "canceled",
                status: "danger",
                icon: <Feather name="x-circle" size={22} color={colors.danger} />,
            });
        }

        return mapped;
    }, [orderStatus, restaurantName]);

    const handleNudge = useCallback(async () => {
        if (cooldown > 0) {
            Alert.alert("Please wait", `You can remind again in ${cooldown}s.`);
            return;
        }
        if (sendingNudge || orderStatus !== "pending") return;
        setSendingNudge(true);
        try {
            await nudgeRestaurant(orderId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
            Alert.alert("Reminder sent", `${restaurantName} was notified.`);
            setCooldown(20);
        } catch (error: any) {
            Alert.alert("Unable to send reminder", error?.message || "Please try again.");
        } finally {
            setSendingNudge(false);
        }
    }, [cooldown, sendingNudge, orderStatus, orderId, restaurantName]);

    const handleCancel = () => {
        if (!isCancelWindowActive) {
            Alert.alert("Cancellation unavailable", "Orders can only be canceled within the first minute.");
            return;
        }
        if (Platform.OS === "web") {
            const g = globalThis as { confirm?: (message?: string) => boolean } | undefined;
            const confirmed = g?.confirm
                ? g.confirm("Cancel order?\nIf you cancel now we'll start the refund automatically.")
                : true;
            if (confirmed) {
                handleAutoCancel();
            }
            return;
        }
        Alert.alert("Cancel order?", "If you cancel now we'll start the refund automatically.", [
            { text: "Keep waiting", style: "cancel" },
            {
                text: "Cancel anyway",
                style: "destructive",
                onPress: () => handleAutoCancel(),
            },
        ]);
    };

    const rotation = spinner.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
            <LinearGradient
                colors={["#15171C", "#0E0F12"]}
                style={{ padding: 20, paddingTop: 48 }}
            >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <TouchableOpacity
                        onPress={() => onRejected?.(orderId)}
                        accessibilityRole="button"
                        accessibilityLabel="Geri dön"
                        hitSlop={12}
                    >
                        <Feather name="chevron-left" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.text, fontSize: 16, fontFamily: "Ezra-SemiBold" }}>Sipariş Onayı Bekleniyor</Text>
                    <TouchableOpacity
                        onPress={() => Alert.alert("Yardım", "Restoran 2 dakika içinde yanıt vermezse sipariş otomatik iptal olur.")}
                        accessibilityRole="button"
                        accessibilityLabel="Yardım"
                        hitSlop={12}
                    >
                        <Feather name="help-circle" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            <View style={{ flex: 1, padding: 20, gap: 24 }}>
                <View
                    style={{
                        backgroundColor: colors.card,
                        borderRadius: radius.lg,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: 16,
                    }}
                >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                        <Animated.View
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 28,
                                borderWidth: 2,
                                borderColor: colors.border,
                                alignItems: "center",
                                justifyContent: "center",
                                transform: [{ rotate: rotation }],
                            }}
                        >
                            <Ionicons name="sync" size={24} color={colors.primary} />
                        </Animated.View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontFamily: "Ezra-Bold", fontSize: 18 }}>Restoran onayı bekleniyor…</Text>
                            <Text style={{ color: colors.sub, marginTop: 4 }}>
                                {restaurantName} siparişini aldı. Onay gelince haber vereceğiz.
                            </Text>
                        </View>
                    </View>
                    <View
                        style={{
                            alignSelf: "flex-start",
                            paddingHorizontal: 14,
                            paddingVertical: 6,
                            borderRadius: radius.md,
                            backgroundColor: `${slaColor}22`,
                            borderWidth: 1,
                            borderColor: `${slaColor}66`,
                        }}
                    >
                        <Text style={{ color: slaColor, fontFamily: "Ezra-SemiBold" }}>
                            SLA: {formatTime(sla)}
                        </Text>
                    </View>
                </View>

                <View
                    style={{
                        backgroundColor: colors.card,
                        borderRadius: radius.lg,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: 20,
                    }}
                >
                    {steps.map((step) => (
                        <StepRow
                            key={step.id}
                            icon={step.icon}
                            title={step.title}
                            subtitle={step.subtitle}
                            status={step.status as "done" | "active" | "pending" | "danger"}
                        />
                    ))}
                </View>

                <View style={{ gap: 12 }}>
                    <TouchableOpacity
                        onPress={handleNudge}
                        disabled={sendingNudge || cooldown > 0 || orderStatus !== "pending"}
                        accessibilityLabel="Remind restaurant"
                        accessibilityRole="button"
                        style={{ borderRadius: radius.lg, overflow: "hidden" }}
                    >
                        <LinearGradient
                            colors={["#63E6FF", "#B98CFF"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                                paddingVertical: 16,
                                justifyContent: "center",
                                alignItems: "center",
                                opacity: sendingNudge || cooldown > 0 || orderStatus !== "pending" ? 0.6 : 1,
                            }}
                        >
                            <Text style={{ color: "#0E0F12", fontFamily: "Ezra-Bold", fontSize: 16 }}>
                                {cooldown > 0 ? `Wait ${cooldown}s` : "Remind restaurant"}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {isCancelWindowActive ? (
                        <TouchableOpacity
                            onPress={handleCancel}
                            accessibilityRole="button"
                            accessibilityLabel="Siparişi iptal et"
                            style={{
                                borderRadius: radius.lg,
                                borderWidth: 1,
                                borderColor: colors.border,
                                paddingVertical: 14,
                                alignItems: "center",
                            }}
                        >
                            <Text style={{ color: colors.text, fontFamily: "Ezra-SemiBold" }}>
                                Cancel order ({cancelWindowRemaining}s)
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View
                            style={{
                                borderRadius: radius.lg,
                                borderWidth: 1,
                                borderColor: colors.border,
                                paddingVertical: 14,
                                alignItems: "center",
                                opacity: 0.4,
                            }}
                        >
                            <Text style={{ color: colors.sub, fontFamily: "Ezra-SemiBold" }}>Cancel window closed</Text>
                        </View>
                    )}

                    <Text style={{ color: colors.sub, fontSize: 13, lineHeight: 18 }}>
                        * Restoran {Math.ceil(etaSeconds / 60)} dakika içinde onay vermezse otomatik iptal ve iade başlatılır.
                        {"\n"}* Customer cancellations are limited to the first 60 seconds after placing an order.
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
};

export default OrderPendingScreen;


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import useOrderRealtime from "@/src/hooks/useOrderRealtime";
import useOrderStatus from "@/src/hooks/useOrderStatus";
import { transitionOrder } from "@/src/services/firebaseOrders";
import { nudgeRestaurant } from "@/src/api/client";
import OrderRider from "@/assets/illustrations/Order Rider.svg";
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
                <Text style={{ color: colors.text, fontFamily: "ChairoSans", fontSize: 16 }}>{title}</Text>
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
    const insets = useSafeAreaInsets();
    const { order } = useOrderRealtime(orderId);
    const { status: pendingStatus } = useOrderStatus(orderId);
    const orderStatus = useMemo<OrderStatus>(() => {
        const rawStatus = String(order?.status ?? "");
        if (rawStatus === "accepted") return "preparing";
        if (rawStatus === "rejected") return "canceled";
        if (rawStatus) return rawStatus as OrderStatus;
        switch (pendingStatus) {
            case "confirmed":
                return "preparing";
            case "rejected":
                return "canceled";
            default:
                return "pending";
        }
    }, [order?.status, pendingStatus]);
    const baseEtaSeconds = useMemo(() => (order?.etaMinutes ? order.etaMinutes * 60 : etaSeconds), [order?.etaMinutes, etaSeconds]);
    const [sla, setSla] = useState(baseEtaSeconds);
    const [cooldown, setCooldown] = useState(0);
    const [sendingNudge, setSendingNudge] = useState(false);
    const [autoCanceled, setAutoCanceled] = useState(false);
    const [cancelWindowRemaining, setCancelWindowRemaining] = useState(CANCEL_WINDOW_SECONDS);
    const spinner = useRef(new Animated.Value(0)).current;
    const prevStatus = useRef<OrderStatus>("pending");
    const isCancelWindowActive = orderStatus === "pending" && cancelWindowRemaining > 0 && !autoCanceled;
    const safeTop = Math.max(insets.top, 16);

    const handleAutoCancel = useCallback(async () => {
        if (autoCanceled || !orderId) return;
        setAutoCanceled(true);
        try {
            await transitionOrder(orderId, "canceled");
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
        if (orderStatus !== "pending") return;
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
        if (orderStatus !== "pending") return;
        const ticker = setInterval(() => {
            setSla((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(ticker);
    }, [orderStatus]);

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
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
            <LinearGradient
                colors={["#15171C", "#0E0F12"]}
                style={{ paddingHorizontal: 20, paddingBottom: 16, paddingTop: safeTop + 12 }}
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
                    <Text style={{ color: colors.text, fontSize: 16, fontFamily: "ChairoSans" }}>
                        {orderStatus === "pending"
                            ? "Sipariş Onayı Bekleniyor"
                            : orderStatus === "preparing"
                            ? "Restoran Siparişi Onayladı"
                            : orderStatus === "ready"
                            ? "Sipariş Teslime Hazır"
                            : orderStatus === "out_for_delivery"
                            ? "Sipariş Yolda"
                            : orderStatus === "delivered"
                            ? "Teslim Edildi"
                            : "Sipariş İptal Edildi"}
                    </Text>
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

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom, gap: 24 }}
            >
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
                            <Text style={{ color: colors.text, fontFamily: "ChairoSans", fontSize: 18 }}>
                                {orderStatus === "pending"
                                    ? "Restoran onayı bekleniyor…"
                                    : orderStatus === "preparing"
                                    ? "Restoran siparişi onayladı."
                                    : orderStatus === "ready"
                                    ? "Sipariş teslime hazır."
                                    : orderStatus === "out_for_delivery"
                                    ? "Kurye siparişi teslim alıyor."
                                    : orderStatus === "delivered"
                                    ? "Teslim edildi. Afiyet olsun!"
                                    : "Sipariş iptal edildi."}
                            </Text>
                            <Text style={{ color: colors.sub, marginTop: 4 }}>
                                {orderStatus === "pending"
                                    ? `${restaurantName} siparişini aldı. Onay gelince haber vereceğiz.`
                                    : orderStatus === "preparing"
                                    ? `${restaurantName} siparişi hazırlıyor.`
                                    : orderStatus === "ready"
                                    ? "Kurye teslim almak üzere yönlendirildi."
                                    : orderStatus === "out_for_delivery"
                                    ? "Kurye yolda, kısa süre içinde yanında olacak."
                                    : orderStatus === "delivered"
                                    ? "Sipariş tamamlandı."
                                    : "Bu sipariş iptal edildi."}
                            </Text>
                        </View>
                        <OrderRider width={110} height={110} />
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
                        <Text style={{ color: slaColor, fontFamily: "ChairoSans" }}>
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
                            <Text style={{ color: "#0E0F12", fontFamily: "ChairoSans", fontSize: 16 }}>
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
                            <Text style={{ color: colors.text, fontFamily: "ChairoSans" }}>
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
                            <Text style={{ color: colors.sub, fontFamily: "ChairoSans" }}>Cancel window closed</Text>
                        </View>
                    )}

                    <Text style={{ color: colors.sub, fontSize: 13, lineHeight: 18 }}>
                        * Restoran {Math.ceil(etaSeconds / 60)} dakika içinde onay vermezse otomatik iptal ve iade başlatılır.
                        {"\n"}* Customer cancellations are limited to the first 60 seconds after placing an order.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default OrderPendingScreen;

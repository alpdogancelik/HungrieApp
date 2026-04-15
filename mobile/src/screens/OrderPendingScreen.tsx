import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    Alert,
    Animated,
    Easing,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import useOrderRealtime from "@/src/hooks/useOrderRealtime";
import useOrderStatus from "@/src/hooks/useOrderStatus";
import { transitionOrder } from "@/src/services/firebaseOrders";
import { nudgeRestaurant } from "@/src/api/client";
import useAuthStore from "@/store/auth.store";
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
    md: 16,
    lg: 24,
};

const CANCEL_WINDOW_SECONDS = 60;
const APPROVAL_SLA_SECONDS = 5 * 60;
const REMINDER_UNLOCK_SECONDS = 4 * 60;

const toMillis = (value: unknown) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof (value as any)?.toDate === "function") return (value as any).toDate().getTime();
    if (typeof (value as any)?.seconds === "number") return (value as any).seconds * 1000;
    return 0;
};

const resolveUserId = (user: unknown): string | undefined => {
    const candidates = [(user as any)?.id, (user as any)?.$id, (user as any)?.uid];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate;
        }
    }
    return undefined;
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
    icon: ReactNode;
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
                {subtitle ? <Text style={{ color: colors.sub, marginTop: 2, fontSize: 14 }}>{subtitle}</Text> : null}
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

const OrderPendingScreen = ({ orderId, restaurantName, etaSeconds = 120, onConfirmed, onRejected }: Props) => {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
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

    const [sla, setSla] = useState(APPROVAL_SLA_SECONDS);
    const [reminderUnlockRemaining, setReminderUnlockRemaining] = useState(REMINDER_UNLOCK_SECONDS);
    const [cooldown, setCooldown] = useState(0);
    const [sendingNudge, setSendingNudge] = useState(false);
    const [autoCanceled, setAutoCanceled] = useState(false);
    const [cancelWindowRemaining, setCancelWindowRemaining] = useState(CANCEL_WINDOW_SECONDS);

    const spinner = useRef(new Animated.Value(0)).current;
    const useNativeDriver = Platform.OS !== "web";
    const prevStatus = useRef<OrderStatus>("pending");
    const isCancelWindowActive = orderStatus === "pending" && cancelWindowRemaining > 0 && !autoCanceled;
    const isReminderLocked = orderStatus === "pending" && reminderUnlockRemaining > 0;
    const safeTop = Math.max(insets.top, 16);
    const isCompactPhone = Platform.OS === "android" || windowHeight < 860;

    const handleAutoCancel = useCallback(async () => {
        if (autoCanceled || !orderId) return;
        setAutoCanceled(true);

        try {
            await transitionOrder(orderId, "canceled");
            setCancelWindowRemaining(0);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
            onRejected?.(orderId);
        } catch (error: any) {
            setAutoCanceled(false);
            Alert.alert(t("orderPending.alerts.unableCancelTitle"), error?.message || t("orderPending.alerts.pleaseTryAgain"));
        }
    }, [autoCanceled, onRejected, orderId, t]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(spinner, {
                toValue: 1,
                duration: 2000,
                easing: Easing.linear,
                useNativeDriver,
            }),
        );
        loop.start();
        return () => loop.stop();
    }, [spinner, useNativeDriver]);

    useEffect(() => {
        if (orderStatus !== "pending") {
            setSla(0);
            setReminderUnlockRemaining(0);
            setCancelWindowRemaining(0);
            return;
        }

        const sourceTimestamp = order?.createdAt || order?.updatedAt;
        const sourceMs = toMillis(sourceTimestamp);

        const tick = () => {
            const elapsedSeconds = sourceMs ? Math.max(0, Math.floor((Date.now() - sourceMs) / 1000)) : 0;
            const nextSla = Math.max(APPROVAL_SLA_SECONDS - elapsedSeconds, 0);
            const nextReminderLock = Math.max(REMINDER_UNLOCK_SECONDS - elapsedSeconds, 0);
            const nextCancelWindow = Math.max(CANCEL_WINDOW_SECONDS - elapsedSeconds, 0);

            setSla(nextSla);
            setReminderUnlockRemaining(nextReminderLock);
            setCancelWindowRemaining(nextCancelWindow);

            if (nextSla === 0) {
                void handleAutoCancel();
            }
        };

        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [handleAutoCancel, order?.createdAt, order?.updatedAt, orderStatus]);

    useEffect(() => {
        if (!cooldown) return undefined;
        const timer = setInterval(() => {
            setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    useEffect(() => {
        if (prevStatus.current === orderStatus) return;

        if (["preparing", "ready", "out_for_delivery", "delivered"].includes(orderStatus)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
            onConfirmed?.(orderId);
        } else if (orderStatus === "canceled") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
            Alert.alert(
                t("orderPending.alerts.orderCanceledTitle"),
                t("orderPending.alerts.orderCanceledBody", { restaurantName }),
            );
            onRejected?.(orderId);
        }

        prevStatus.current = orderStatus;
    }, [onConfirmed, onRejected, orderId, orderStatus, restaurantName, t]);

    const slaColor = sla === 0 ? colors.danger : sla < 30 ? colors.warning : colors.primary;

    const steps = useMemo(() => {
        const sequence = [
            {
                id: "received",
                title: t("orderPending.steps.receivedTitle"),
                subtitle: t("orderPending.steps.receivedSubtitle"),
                indicator: "received" as const,
                icon: <Feather name="check-circle" size={22} color={colors.success} />,
            },
            {
                id: "pending",
                title: t("orderPending.steps.sentTitle"),
                subtitle: t("orderPending.steps.sentSubtitle", { restaurantName }),
                indicator: "pending" as OrderStatus,
                icon: <MaterialCommunityIcons name="storefront-outline" size={22} color={colors.primary} />,
            },
            {
                id: "preparing",
                title: t("orderPending.steps.preparingTitle"),
                subtitle: t("orderPending.steps.preparingSubtitle"),
                indicator: "preparing" as OrderStatus,
                icon: <Ionicons name="time-outline" size={22} color={colors.warning} />,
            },
            {
                id: "ready",
                title: t("orderPending.steps.readyTitle"),
                subtitle: t("orderPending.steps.readySubtitle"),
                indicator: "ready" as OrderStatus,
                icon: <Feather name="thumbs-up" size={22} color={colors.success} />,
            },
            {
                id: "out_for_delivery",
                title: t("orderPending.steps.outForDeliveryTitle"),
                subtitle: t("orderPending.steps.outForDeliverySubtitle"),
                indicator: "out_for_delivery" as OrderStatus,
                icon: <MaterialCommunityIcons name="bike" size={22} color={colors.primary} />,
            },
        ];

        const statusOrder: OrderStatus[] = ["pending", "preparing", "ready", "out_for_delivery", "delivered"];
        const activeIndex = statusOrder.indexOf(orderStatus);

        const mapped = sequence.map((step) => {
            let state: "done" | "active" | "pending" | "danger" = "pending";

            if (step.indicator === "received") {
                state = "done";
            } else if (orderStatus === "canceled") {
                state = "danger";
            } else {
                const stepIndex = statusOrder.indexOf(step.indicator as OrderStatus);
                if (stepIndex < activeIndex) state = "done";
                else if (stepIndex === activeIndex) state = "active";
            }

            return { ...step, status: state };
        });

        if (orderStatus === "delivered") {
            mapped.push({
                id: "delivered",
                title: t("orderPending.steps.deliveredTitle"),
                subtitle: t("orderPending.steps.deliveredSubtitle"),
                indicator: "delivered",
                status: "done",
                icon: <Feather name="check" size={22} color={colors.success} />,
            });
        }

        if (orderStatus === "canceled") {
            mapped.push({
                id: "canceled",
                title: t("orderPending.steps.canceledTitle"),
                subtitle: t("orderPending.steps.canceledSubtitle"),
                indicator: "canceled",
                status: "danger",
                icon: <Feather name="x-circle" size={22} color={colors.danger} />,
            });
        }

        return mapped;
    }, [orderStatus, restaurantName, t]);

    const handleNudge = useCallback(async () => {
        if (cooldown > 0) {
            Alert.alert(t("orderPending.alerts.waitTitle"), t("orderPending.alerts.waitReminderBody", { seconds: cooldown }));
            return;
        }

        if (isReminderLocked) {
            Alert.alert(t("orderPending.alerts.waitTitle"), t("orderPending.alerts.reminderLockedBody"));
            return;
        }

        if (sendingNudge || orderStatus !== "pending") return;
        setSendingNudge(true);

        try {
            await nudgeRestaurant(orderId, resolveUserId(user));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
            Alert.alert(
                t("orderPending.alerts.reminderSentTitle"),
                t("orderPending.alerts.reminderSentBody", { restaurantName }),
            );
            setCooldown(20);
        } catch (error: any) {
            Alert.alert(t("orderPending.alerts.reminderFailedTitle"), error?.message || t("orderPending.alerts.pleaseTryAgain"));
        } finally {
            setSendingNudge(false);
        }
    }, [cooldown, isReminderLocked, orderId, orderStatus, restaurantName, sendingNudge, t, user]);

    const handleCancel = () => {
        if (!isCancelWindowActive) {
            Alert.alert(t("orderPending.alerts.cancelUnavailableTitle"), t("orderPending.alerts.cancelUnavailableBody"));
            return;
        }

        if (Platform.OS === "web") {
            const g = globalThis as { confirm?: (message?: string) => boolean } | undefined;
            const confirmMessage = `${t("orderPending.alerts.cancelConfirmTitle")}\n${t("orderPending.alerts.cancelConfirmBody")}`;
            const confirmed = g?.confirm ? g.confirm(confirmMessage) : true;
            if (confirmed) {
                void handleAutoCancel();
            }
            return;
        }

        Alert.alert(t("orderPending.alerts.cancelConfirmTitle"), t("orderPending.alerts.cancelConfirmBody"), [
            { text: t("orderPending.alerts.keepWaiting"), style: "cancel" },
            {
                text: t("orderPending.alerts.cancelAnyway"),
                style: "destructive",
                onPress: () => void handleAutoCancel(),
            },
        ]);
    };

    const rotation = spinner.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });

    const headerTitle = useMemo(() => {
        switch (orderStatus) {
            case "preparing":
                return t("orderPending.header.preparing");
            case "ready":
                return t("orderPending.header.ready");
            case "out_for_delivery":
                return t("orderPending.header.outForDelivery");
            case "delivered":
                return t("orderPending.header.delivered");
            case "canceled":
                return t("orderPending.header.canceled");
            case "pending":
            default:
                return t("orderPending.header.pending");
        }
    }, [orderStatus, t]);

    const cardTitle = useMemo(() => {
        switch (orderStatus) {
            case "preparing":
                return t("orderPending.card.preparingTitle");
            case "ready":
                return t("orderPending.card.readyTitle");
            case "out_for_delivery":
                return t("orderPending.card.outForDeliveryTitle");
            case "delivered":
                return t("orderPending.card.deliveredTitle");
            case "canceled":
                return t("orderPending.card.canceledTitle");
            case "pending":
            default:
                return t("orderPending.card.pendingTitle");
        }
    }, [orderStatus, t]);

    const cardSubtitle = useMemo(() => {
        switch (orderStatus) {
            case "preparing":
                return t("orderPending.card.preparingSubtitle", { restaurantName });
            case "ready":
                return t("orderPending.card.readySubtitle");
            case "out_for_delivery":
                return t("orderPending.card.outForDeliverySubtitle");
            case "delivered":
                return t("orderPending.card.deliveredSubtitle");
            case "canceled":
                return t("orderPending.card.canceledSubtitle");
            case "pending":
            default:
                return t("orderPending.card.pendingSubtitle", { restaurantName });
        }
    }, [orderStatus, restaurantName, t]);

    const nudgeDisabled = sendingNudge || orderStatus !== "pending" || cooldown > 0 || isReminderLocked;
    const nudgeLabel = sendingNudge
        ? t("orderPending.remind.sending")
        : orderStatus !== "pending"
          ? t("orderPending.remind.disabled")
          : isReminderLocked
            ? t("orderPending.remind.unlockIn", { time: formatTime(reminderUnlockRemaining) })
            : cooldown > 0
              ? t("orderPending.remind.waitSeconds", { seconds: cooldown })
              : t("orderPending.remind.cta");
    const helpMessage = useMemo(
        () =>
            [
                t("orderPending.helpBody"),
                "",
                t("orderPending.remind.note"),
            ].join("\n"),
        [t],
    );

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
                        accessibilityLabel={t("orderPending.a11y.back")}
                        hitSlop={12}
                    >
                        <Feather name="chevron-left" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.text, fontSize: 16, fontFamily: "ChairoSans" }}>{headerTitle}</Text>
                    <TouchableOpacity
                        onPress={() => Alert.alert(t("orderPending.helpTitle"), helpMessage)}
                        accessibilityRole="button"
                        accessibilityLabel={t("orderPending.a11y.help")}
                        hitSlop={12}
                    >
                        <Feather name="help-circle" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    padding: 20,
                    paddingBottom: 24 + insets.bottom,
                    gap: isCompactPhone ? 16 : 24,
                }}
            >
                <View
                    style={{
                        backgroundColor: colors.card,
                        borderRadius: radius.lg,
                        padding: isCompactPhone ? 16 : 20,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: isCompactPhone ? 12 : 16,
                    }}
                >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: isCompactPhone ? 10 : 16 }}>
                        <Animated.View
                            style={{
                                width: isCompactPhone ? 42 : 56,
                                height: isCompactPhone ? 42 : 56,
                                borderRadius: isCompactPhone ? 21 : 28,
                                borderWidth: 2,
                                borderColor: colors.border,
                                alignItems: "center",
                                justifyContent: "center",
                                transform: [{ rotate: rotation }],
                            }}
                        >
                            <Ionicons name="sync" size={isCompactPhone ? 20 : 24} color={colors.primary} />
                        </Animated.View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                                style={{
                                    color: colors.text,
                                    fontFamily: "ChairoSans",
                                    fontSize: isCompactPhone ? 15 : 18,
                                    lineHeight: isCompactPhone ? 18 : 24,
                                }}
                            >
                                {cardTitle}
                            </Text>
                            <Text
                                style={{
                                    color: colors.sub,
                                    marginTop: 4,
                                    fontSize: isCompactPhone ? 12 : 14,
                                    lineHeight: isCompactPhone ? 16 : 20,
                                }}
                            >
                                {cardSubtitle}
                            </Text>
                        </View>
                        <View style={{ width: isCompactPhone ? 90 : 110, alignItems: "flex-end" }}>
                            <OrderRider width={isCompactPhone ? 74 : 110} height={isCompactPhone ? 74 : 110} />
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
                        <Text style={{ color: slaColor, fontFamily: "ChairoSans" }}>SLA: {formatTime(sla)}</Text>
                    </View>
                </View>

                <View
                    style={{
                        backgroundColor: colors.card,
                        borderRadius: radius.lg,
                        padding: isCompactPhone ? 16 : 20,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: isCompactPhone ? 14 : 20,
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
                        disabled={nudgeDisabled}
                        accessibilityLabel={t("orderPending.a11y.remind")}
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
                                opacity: nudgeDisabled ? 0.6 : 1,
                            }}
                        >
                            <Text style={{ color: "#0E0F12", fontFamily: "ChairoSans", fontSize: 16 }}>{nudgeLabel}</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    {isCancelWindowActive ? (
                        <TouchableOpacity
                            onPress={handleCancel}
                            accessibilityRole="button"
                            accessibilityLabel={t("orderPending.a11y.cancel")}
                            style={{
                                borderRadius: radius.lg,
                                borderWidth: 1,
                                borderColor: colors.border,
                                paddingVertical: 14,
                                alignItems: "center",
                            }}
                        >
                            <Text style={{ color: colors.text, fontFamily: "ChairoSans" }}>
                                {t("orderPending.cancel.cta", { seconds: cancelWindowRemaining })}
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
                            <Text style={{ color: colors.sub, fontFamily: "ChairoSans" }}>{t("orderPending.cancel.closed")}</Text>
                        </View>
                    )}

                    <Text style={{ color: colors.sub, fontSize: 13, lineHeight: 18 }}>
                        {t("orderPending.footnote.cancelWindow")}
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default OrderPendingScreen;

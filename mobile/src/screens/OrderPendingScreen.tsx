import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import useOrderRealtime from "@/src/hooks/useOrderRealtime";
import useOrderStatus from "@/src/hooks/useOrderStatus";
import { transitionOrder } from "@/src/data/orderRepository";
import { nudgeRestaurant } from "@/src/api/client";
import useAuthStore from "@/store/auth.store";
import type { OrderStatus } from "@/src/domain/types";
import { OrderProgressTimer } from "@/src/components/order/OrderProgressTimer";
import { formatCurrency } from "@/lib/cart.utils";
import { useTheme } from "@/src/theme/themeContext";

type Props = {
    orderId: string;
    restaurantName: string;
    etaSeconds?: number;
    onBack?: () => void;
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

const normalizeRealtimeStatus = (status: unknown): OrderStatus => {
    const raw = String(status || "")
        .trim()
        .toLowerCase();

    if (!raw) return "pending";

    if (
        [
            "pending",
            "received",
            "sent_to_restaurant",
            "awaiting_restaurant_approval",
            "pending_restaurant_approval",
            "awaiting_confirmation",
            "waiting_restaurant",
        ].includes(raw)
    ) {
        return "pending";
    }

    if (["accepted", "restaurant_accepted", "preparing"].includes(raw)) return "preparing";
    if (["ready", "ready_for_pickup"].includes(raw)) return "ready";
    if (["out_for_delivery", "on_the_way", "picked_up", "delivering"].includes(raw)) return "out_for_delivery";
    if (["delivered", "completed"].includes(raw)) return "delivered";
    if (["canceled", "cancelled", "rejected"].includes(raw)) return "canceled";

    return "pending";
};

const StepRow = ({
    icon,
    title,
    subtitle,
    status,
    tone,
    dark,
    isLast,
}: {
    icon: ReactNode;
    title: string;
    subtitle?: string;
    status: "done" | "active" | "pending" | "danger";
    tone: "green" | "blue" | "orange" | "neutral";
    dark: boolean;
    isLast: boolean;
}) => {
    const tint =
        status === "done"
            ? colors.success
            : status === "active"
              ? colors.primary
              : status === "danger"
                ? colors.danger
                : colors.sub;

    const text = dark ? "#F5F7FA" : "#111318";
    const secondary = dark ? "#98A2B3" : status === "pending" ? "#98A2B3" : "#667085";
    const border = dark ? "#2A2E35" : "#EAECF0";
    const backgrounds = dark
        ? { green: "#183128", blue: "#172C35", orange: "#352319", neutral: "#22262E" }
        : { green: "#ECFDF3", blue: "#EFF8FF", orange: "#FFF3EC", neutral: "#F5F6F8" };

    return (
        <View
            accessibilityLabel={`${title}, ${status}. ${subtitle || ""}`}
            style={[pendingStyles.stepRow, !isLast && { borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth }]}
        >
            <View style={[pendingStyles.stepIcon, { backgroundColor: backgrounds[tone] }]}>{icon}</View>
            <View style={pendingStyles.stepCopy}>
                <Text style={[pendingStyles.stepTitle, { color: text }, status === "active" && pendingStyles.stepTitleActive]}>{title}</Text>
                {subtitle ? <Text style={[pendingStyles.stepSubtitle, { color: secondary }]}>{subtitle}</Text> : null}
            </View>
            <View style={[pendingStyles.statusDot, { backgroundColor: tint }]} />
        </View>
    );
};

const OrderPendingScreen = ({ orderId, restaurantName, etaSeconds = 120, onBack, onConfirmed, onRejected }: Props) => {
    const { t, i18n } = useTranslation();
    const { variant } = useTheme();
    const dark = variant === "dark";
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const screenStyles = useMemo(() => createScreenStyles(dark), [dark]);
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const { order } = useOrderRealtime(orderId);
    const { status: pendingStatus } = useOrderStatus(orderId);
    const localCreatedAtMsRef = useRef(Date.now());

    useEffect(() => {
        localCreatedAtMsRef.current = Date.now();
    }, [orderId]);

    const orderStatus = useMemo<OrderStatus>(() => {
        if (order?.status) {
            return normalizeRealtimeStatus(order.status);
        }

        switch (pendingStatus) {
            case "confirmed":
                return "preparing";
            case "rejected":
                return "canceled";
            default:
                return "pending";
        }
    }, [order?.status, pendingStatus]);

    const createdAtMs = useMemo(
        () =>
            toMillis((order as any)?.createdAtMs) ||
            toMillis(order?.createdAt) ||
            toMillis((order as any)?.updatedAtMs) ||
            toMillis(order?.updatedAt) ||
            localCreatedAtMsRef.current,
        [order],
    );
    const approvalDeadlineMs = useMemo(() => {
        const fromServer =
            toMillis((order as any)?.restaurantApprovalDeadline) ||
            toMillis((order as any)?.approvalDeadline) ||
            toMillis((order as any)?.slaDeadline);

        if (fromServer) return fromServer;
        return createdAtMs + APPROVAL_SLA_SECONDS * 1000;
    }, [createdAtMs, order]);
    const cancelAllowedUntilMs = useMemo(() => {
        const fromServer = toMillis((order as any)?.cancelAllowedUntil);
        if (fromServer) return fromServer;
        return createdAtMs + CANCEL_WINDOW_SECONDS * 1000;
    }, [createdAtMs, order]);

    const [reminderUnlockRemaining, setReminderUnlockRemaining] = useState(REMINDER_UNLOCK_SECONDS);
    const [cooldown, setCooldown] = useState(0);
    const [sendingNudge, setSendingNudge] = useState(false);
    const [autoCanceled, setAutoCanceled] = useState(false);
    const [cancelWindowRemaining, setCancelWindowRemaining] = useState(CANCEL_WINDOW_SECONDS);

    const prevStatus = useRef<OrderStatus>("pending");
    const isCancelWindowActive = orderStatus === "pending" && cancelWindowRemaining > 0 && !autoCanceled;
    const isReminderLocked = orderStatus === "pending" && reminderUnlockRemaining > 0;
    const safeTop = Math.max(insets.top, 16);

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
        if (orderStatus !== "pending") {
            setReminderUnlockRemaining(0);
            setCancelWindowRemaining(0);
            return;
        }

        const tick = () => {
            const nowMs = Date.now();
            const sourceMs = createdAtMs;
            const elapsedSeconds = sourceMs ? Math.max(0, Math.floor((nowMs - sourceMs) / 1000)) : 0;
            const nextSla = approvalDeadlineMs
                ? Math.max(0, Math.ceil((approvalDeadlineMs - nowMs) / 1000))
                : Math.max(APPROVAL_SLA_SECONDS - elapsedSeconds, 0);
            const nextReminderLock = Math.max(REMINDER_UNLOCK_SECONDS - elapsedSeconds, 0);
            const nextCancelWindow = cancelAllowedUntilMs
                ? Math.max(0, Math.ceil((cancelAllowedUntilMs - nowMs) / 1000))
                : Math.max(CANCEL_WINDOW_SECONDS - elapsedSeconds, 0);

            setReminderUnlockRemaining(nextReminderLock);
            setCancelWindowRemaining(nextCancelWindow);

            if (nextSla === 0) {
                void handleAutoCancel();
            }
        };

        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [approvalDeadlineMs, cancelAllowedUntilMs, createdAtMs, handleAutoCancel, orderStatus]);

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
            const confirmMessage = `${t("orderPending.alerts.cancelConfirmTitle")}
${t("orderPending.alerts.cancelConfirmBody")}`;
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
    const orderTotal = Number((order as any)?.total ?? (order as any)?.totalPrice);
    const orderEta = Number((order as any)?.etaMinutes ?? (order as any)?.eta);
    const restaurantMeta = String((order as any)?.restaurant?.cuisine || (order as any)?.restaurantCuisine || "").trim();
    const showOrderSummary = Number.isFinite(orderTotal) || restaurantMeta || (Number.isFinite(orderEta) && orderEta > 0);

    return (
        <SafeAreaView style={screenStyles.screen} edges={["left", "right", "bottom"]}>
            <View style={[screenStyles.header, { paddingTop: safeTop }]}>
                <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t("orderPending.a11y.back")} style={screenStyles.headerButton}>
                    <Feather name="chevron-left" size={22} color={screenStyles.primary.color} />
                </TouchableOpacity>
                <Text style={screenStyles.headerTitle}>{isTurkish ? "Sipariş durumu" : "Order status"}</Text>
                <TouchableOpacity
                    onPress={() => Alert.alert(t("orderPending.helpTitle"), helpMessage)}
                    accessibilityRole="button"
                    accessibilityLabel={t("orderPending.a11y.help")}
                    style={screenStyles.headerButton}
                >
                    <Feather name="help-circle" size={22} color={screenStyles.primary.color} />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[screenStyles.content, { paddingBottom: 24 + insets.bottom }]}
            >
                <OrderProgressTimer
                    currentStatus={String(order?.status ?? orderStatus)}
                    createdAt={(order as any)?.createdAtMs ?? order?.createdAt ?? createdAtMs}
                    approvalDeadline={
                        (order as any)?.restaurantApprovalDeadline ??
                        (order as any)?.approvalDeadline ??
                        (order as any)?.slaDeadline ??
                        (approvalDeadlineMs || undefined)
                    }
                    cancelAllowedUntil={(order as any)?.cancelAllowedUntil ?? (cancelAllowedUntilMs || undefined)}
                    totalApprovalSeconds={APPROVAL_SLA_SECONDS}
                    restaurantName={restaurantName}
                    onCancel={isCancelWindowActive ? handleCancel : undefined}
                    onApprovalExpired={() => {
                        if (orderStatus === "pending") void handleAutoCancel();
                    }}
                />

                <View style={screenStyles.section}>
                    <Text style={screenStyles.sectionTitle}>{isTurkish ? "Sipariş süreci" : "Order progress"}</Text>
                    <View style={screenStyles.progressCard}>
                    {steps.slice(0, 5).map((step, index) => (
                        <StepRow
                            key={step.id}
                            icon={step.icon}
                            title={step.title}
                            subtitle={step.subtitle}
                            status={step.status as "done" | "active" | "pending" | "danger"}
                            tone={index === 0 ? "green" : index === 1 ? "blue" : index === 2 ? "orange" : "neutral"}
                            dark={dark}
                            isLast={index === 4}
                        />
                    ))}
                    </View>
                </View>

                {showOrderSummary ? <View style={screenStyles.summaryCard}>
                    <View style={screenStyles.summaryHeader}>
                        <View style={screenStyles.restaurantMark}><Ionicons name="restaurant-outline" size={22} color="#FF5A00" /></View>
                        <View style={screenStyles.summaryNameWrap}>
                            <Text numberOfLines={1} style={screenStyles.summaryName}>{restaurantName}</Text>
                            {restaurantMeta ? <Text numberOfLines={1} style={screenStyles.summaryMeta}>{restaurantMeta}</Text> : null}
                        </View>
                    </View>
                    {(Number.isFinite(orderTotal) || (Number.isFinite(orderEta) && orderEta > 0)) ? <>
                        <View style={screenStyles.summaryDivider} />
                        <View style={screenStyles.summaryStats}>
                            {Number.isFinite(orderTotal) ? <View style={screenStyles.summaryStat}><Text style={screenStyles.summaryLabel}>{isTurkish ? "Toplam" : "Total"}</Text><Text style={screenStyles.summaryValue}>{formatCurrency(orderTotal)}</Text></View> : null}
                            {Number.isFinite(orderEta) && orderEta > 0 ? <View style={[screenStyles.summaryStat, screenStyles.etaStat]}><Ionicons name="time-outline" size={20} color="#FF5A00" /><View><Text style={screenStyles.summaryLabel}>{isTurkish ? "Tahmini teslimat" : "Estimated delivery"}</Text><Text style={screenStyles.summaryEta}>{Math.round(orderEta)} {isTurkish ? "dk" : "min"}</Text></View></View> : null}
                        </View>
                    </> : null}
                </View> : null}

                {orderStatus === "pending" ? <View style={screenStyles.secondaryActions}>
                    <TouchableOpacity
                        onPress={handleNudge}
                        disabled={nudgeDisabled}
                        accessibilityLabel={t("orderPending.a11y.remind")}
                        accessibilityRole="button"
                        style={[screenStyles.reminderButton, nudgeDisabled && screenStyles.reminderButtonDisabled]}
                    >
                        <Text style={screenStyles.reminderText}>{nudgeLabel}</Text>
                    </TouchableOpacity>
                    <Text style={screenStyles.footnote}>{t("orderPending.footnote.cancelWindow")}</Text>
                </View> : null}
            </ScrollView>
        </SafeAreaView>
    );
};

const pendingStyles = StyleSheet.create({
    stepRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 14 },
    stepIcon: { width: 48, height: 48, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    stepCopy: { flex: 1, minWidth: 0 },
    stepTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
    stepTitleActive: { fontWeight: "700" },
    stepSubtitle: { marginTop: 1, fontSize: 13, lineHeight: 18 },
    statusDot: { width: 12, height: 12, borderRadius: 999, flexShrink: 0 },
});

const createScreenStyles = (dark: boolean) => {
    const page = dark ? "#0F1115" : "#FAFBFC";
    const surface = dark ? "#171A20" : "#FFFFFF";
    const primary = dark ? "#F5F7FA" : "#111318";
    const secondary = dark ? "#98A2B3" : "#667085";
    const border = dark ? "#2A2E35" : "#EAECF0";
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: page },
        primary: { color: primary },
        header: { minHeight: 54, paddingHorizontal: 22, paddingBottom: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: page },
        headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
        headerTitle: { color: primary, fontSize: 21, lineHeight: 26, fontWeight: "700" },
        content: { width: "100%", maxWidth: 620, alignSelf: "center", paddingHorizontal: 22, paddingTop: 12, gap: 22 },
        section: { gap: 12 },
        sectionTitle: { color: primary, fontSize: 18, lineHeight: 23, fontWeight: "700" },
        progressCard: { borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: surface, paddingHorizontal: 14, overflow: "hidden" },
        summaryCard: { borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: surface, padding: 14 },
        summaryHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 },
        restaurantMark: { width: 48, height: 48, borderRadius: 12, backgroundColor: dark ? "#352319" : "#FFF3EC", alignItems: "center", justifyContent: "center" },
        summaryNameWrap: { flex: 1, minWidth: 0 },
        summaryName: { color: primary, fontSize: 16, lineHeight: 20, fontWeight: "700" },
        summaryMeta: { marginTop: 2, color: secondary, fontSize: 13, lineHeight: 18 },
        summaryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: border, marginVertical: 12 },
        summaryStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
        summaryStat: { flex: 1, minWidth: 0 },
        etaStat: { flexDirection: "row", alignItems: "center", gap: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: border, paddingLeft: 18 },
        summaryLabel: { color: secondary, fontSize: 13, lineHeight: 18 },
        summaryValue: { marginTop: 2, color: primary, fontSize: 20, lineHeight: 24, fontWeight: "700" },
        summaryEta: { color: primary, fontSize: 15, lineHeight: 20, fontWeight: "700" },
        secondaryActions: { gap: 10 },
        reminderButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: "#FF5A00", backgroundColor: surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
        reminderButtonDisabled: { borderColor: border, opacity: 0.65 },
        reminderText: { color: dark ? "#FF9A62" : "#C2410C", fontSize: 14, lineHeight: 18, fontWeight: "600", textAlign: "center" },
        footnote: { color: secondary, fontSize: 13, lineHeight: 18 },
    });
};

export default OrderPendingScreen;

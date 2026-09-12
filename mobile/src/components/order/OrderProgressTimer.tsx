import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path } from "react-native-svg";

import { useTheme } from "@/src/theme/themeContext";

export type OrderStatus =
    | "received"
    | "sent_to_restaurant"
    | "awaiting_restaurant_approval"
    | "preparing"
    | "ready_for_pickup"
    | "on_the_way"
    | "delivered"
    | "cancelled";

type FirestoreTimestampLike = {
    toDate?: () => Date;
    seconds?: number;
    nanoseconds?: number;
};

type TimestampInput = Date | number | string | FirestoreTimestampLike | null | undefined;

type OrderProgressTimerProps = {
    currentStatus: OrderStatus | string;
    createdAt?: TimestampInput;
    approvalDeadline?: TimestampInput;
    cancelAllowedUntil?: TimestampInput;
    totalApprovalSeconds?: number;
    restaurantName?: string;
    onCancel?: () => void;
    onApprovalExpired?: () => void;
};

const ORDER_STEPS: Array<{
    key: OrderStatus;
    title: string;
    description: string;
}> = [
    {
        key: "received",
        title: "Sipariş alındı",
        description: "Ödeme onaylandı",
    },
    {
        key: "sent_to_restaurant",
        title: "Restorana iletildi",
        description: "Sipariş panele düştü",
    },
    {
        key: "awaiting_restaurant_approval",
        title: "Restoran onayı bekleniyor",
        description: "Restoran siparişini inceliyor",
    },
    {
        key: "preparing",
        title: "Hazırlanıyor",
        description: "Mutfak siparişini hazırlıyor",
    },
    {
        key: "ready_for_pickup",
        title: "Teslime hazır",
        description: "Kurye teslim alacak",
    },
    {
        key: "on_the_way",
        title: "Yolda",
        description: "Kurye sana doğru geliyor",
    },
];

const STATUS_ALIASES: Record<string, OrderStatus> = {
    received: "received",
    order_received: "received",
    paid: "received",

    sent_to_restaurant: "sent_to_restaurant",
    restaurant_notified: "sent_to_restaurant",

    awaiting_restaurant_approval: "awaiting_restaurant_approval",
    pending_restaurant_approval: "awaiting_restaurant_approval",
    pending: "awaiting_restaurant_approval",
    awaiting_confirmation: "awaiting_restaurant_approval",
    waiting_restaurant: "awaiting_restaurant_approval",

    preparing: "preparing",
    accepted: "preparing",
    restaurant_accepted: "preparing",

    ready_for_pickup: "ready_for_pickup",
    ready: "ready_for_pickup",

    on_the_way: "on_the_way",
    picked_up: "on_the_way",
    delivering: "on_the_way",
    out_for_delivery: "on_the_way",

    delivered: "delivered",
    completed: "delivered",

    cancelled: "cancelled",
    canceled: "cancelled",
    rejected: "cancelled",
};

function normalizeStatus(status: string): OrderStatus {
    const key = String(status || "").trim().toLowerCase();
    return STATUS_ALIASES[key] ?? "awaiting_restaurant_approval";
}

function normalizeNumberTimestamp(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value < 10_000_000_000) return Math.round(value * 1000);
    return Math.round(value);
}

function toMillis(input: TimestampInput): number | null {
    if (!input) return null;

    if (typeof input === "number") {
        const normalized = normalizeNumberTimestamp(input);
        return normalized || null;
    }

    if (typeof input === "string") {
        const numeric = Number(input);
        if (Number.isFinite(numeric) && input.trim() !== "") {
            const normalized = normalizeNumberTimestamp(numeric);
            if (normalized) return normalized;
        }
        const parsed = Date.parse(input);
        return Number.isNaN(parsed) ? null : parsed;
    }

    if (input instanceof Date) {
        return input.getTime();
    }

    if (typeof input.toDate === "function") {
        return input.toDate().getTime();
    }

    if (typeof input.seconds === "number") {
        return input.seconds * 1000 + Math.floor((input.nanoseconds ?? 0) / 1_000_000);
    }

    return null;
}

export function formatRemainingTime(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getOrderStepIndex(status: string): number {
    const normalized = normalizeStatus(status);

    if (normalized === "delivered") return ORDER_STEPS.length;
    if (normalized === "cancelled") return 0;

    const index = ORDER_STEPS.findIndex((step) => step.key === normalized);
    return index >= 0 ? index : 2;
}

export function getStatusLabel(status: string): string {
    const normalized = normalizeStatus(status);

    if (normalized === "delivered") return "Sipariş tamamlandı";
    if (normalized === "cancelled") return "Sipariş iptal edildi";

    return ORDER_STEPS.find((step) => step.key === normalized)?.title ?? "Sipariş takip ediliyor";
}

export function getStatusDescription(status: string, restaurantName?: string): string {
    const normalized = normalizeStatus(status);

    if (normalized === "awaiting_restaurant_approval") {
        return restaurantName ? `${restaurantName} siparişini inceliyor.` : "Restoran siparişini inceliyor.";
    }

    if (normalized === "delivered") return "Sipariş başarıyla teslim edildi.";
    if (normalized === "cancelled") return "Bu sipariş artık aktif değil.";

    return ORDER_STEPS.find((step) => step.key === normalized)?.description ?? "Sipariş güncelleniyor.";
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

    return {
        x: cx + r * Math.cos(angleInRadians),
        y: cy + r * Math.sin(angleInRadians),
    };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return ["M", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

function useNowMs(intervalMs = 250) {
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setNowMs(Date.now());
        }, intervalMs);

        return () => clearInterval(interval);
    }, [intervalMs]);

    return nowMs;
}

function useAnimatedNumber(target: number, durationMs = 450) {
    const [value, setValue] = useState(target);
    const valueRef = useRef(target);
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        const startValue = valueRef.current;
        const difference = target - startValue;
        const startedAt = Date.now();

        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current);
        }

        const tick = () => {
            const elapsed = Date.now() - startedAt;
            const rawProgress = Math.min(1, elapsed / durationMs);
            const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
            const nextValue = startValue + difference * easedProgress;

            valueRef.current = nextValue;
            setValue(nextValue);

            if (rawProgress < 1) {
                frameRef.current = requestAnimationFrame(tick);
            }
        };

        frameRef.current = requestAnimationFrame(tick);

        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [target, durationMs]);

    return value;
}

export function OrderProgressTimer({
    currentStatus,
    createdAt,
    approvalDeadline,
    cancelAllowedUntil,
    totalApprovalSeconds = 5 * 60,
    restaurantName,
    onCancel,
    onApprovalExpired,
}: OrderProgressTimerProps) {
    const { i18n } = useTranslation();
    const { variant } = useTheme();
    const dark = variant === "dark";
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const styles = useMemo(() => createStyles(dark), [dark]);
    const nowMs = useNowMs(250);
    const normalizedStatus = normalizeStatus(String(currentStatus));
    const approvalExpiredNotified = useRef(false);

    const createdAtMs = toMillis(createdAt);
    const explicitApprovalDeadlineMs = toMillis(approvalDeadline);
    const approvalDeadlineMs =
        explicitApprovalDeadlineMs || (createdAtMs ? createdAtMs + totalApprovalSeconds * 1000 : null);
    const cancelAllowedUntilMs = toMillis(cancelAllowedUntil);

    const currentStepIndex = getOrderStepIndex(normalizedStatus);

    const approvalRemainingSeconds = useMemo(() => {
        if (!approvalDeadlineMs) return 0;
        return Math.max(0, Math.ceil((approvalDeadlineMs - nowMs) / 1000));
    }, [approvalDeadlineMs, nowMs]);

    const cancelRemainingSeconds = useMemo(() => {
        if (!cancelAllowedUntilMs) return 0;
        return Math.max(0, Math.ceil((cancelAllowedUntilMs - nowMs) / 1000));
    }, [cancelAllowedUntilMs, nowMs]);

    const activeStepProgress = useMemo(() => {
        if (normalizedStatus === "delivered") return 1;
        if (normalizedStatus === "cancelled") return 0;

        if (normalizedStatus !== "awaiting_restaurant_approval") {
            return 1;
        }

        if (!approvalDeadlineMs) return 0.2;

        const totalMs = totalApprovalSeconds * 1000;
        const startedAtMs = createdAtMs ?? approvalDeadlineMs - totalMs;
        const elapsedMs = Math.max(0, nowMs - startedAtMs);

        return Math.min(1, Math.max(0, elapsedMs / totalMs));
    }, [normalizedStatus, approvalDeadlineMs, createdAtMs, nowMs, totalApprovalSeconds]);

    const totalProgress = useMemo(() => {
        if (normalizedStatus === "delivered") return 1;
        if (normalizedStatus === "cancelled") return 0;

        return Math.min(1, Math.max(0, (currentStepIndex + activeStepProgress) / ORDER_STEPS.length));
    }, [normalizedStatus, currentStepIndex, activeStepProgress]);

    const animatedProgress = useAnimatedNumber(totalProgress, 500);

    useEffect(() => {
        if (!approvalDeadlineMs || normalizedStatus !== "awaiting_restaurant_approval") {
            approvalExpiredNotified.current = false;
            return;
        }
        if (approvalDeadlineMs > nowMs) {
            approvalExpiredNotified.current = false;
            return;
        }
        if (approvalExpiredNotified.current) {
            return;
        }
        approvalExpiredNotified.current = true;
        onApprovalExpired?.();
    }, [normalizedStatus, approvalDeadlineMs, nowMs, onApprovalExpired]);

    const size = 148;
    const strokeWidth = 10;
    const center = size / 2;
    const radius = 59;
    const segmentGap = 8;
    const segmentAngle = 360 / ORDER_STEPS.length;
    const activeEndAngle = animatedProgress * 360;

    const label = normalizedStatus === "awaiting_restaurant_approval"
        ? isTurkish ? "Restoran onayı bekleniyor" : "Restaurant approval pending"
        : normalizedStatus === "preparing"
          ? isTurkish ? "Hazırlanıyor" : "Preparing"
          : normalizedStatus === "ready_for_pickup"
            ? isTurkish ? "Teslimata hazır" : "Ready for pickup"
            : normalizedStatus === "on_the_way"
              ? isTurkish ? "Yolda" : "On the way"
              : normalizedStatus === "delivered"
                ? isTurkish ? "Teslim edildi" : "Delivered"
                : isTurkish ? "Sipariş iptal edildi" : "Order canceled";
    const description = normalizedStatus === "awaiting_restaurant_approval"
        ? restaurantName
            ? isTurkish ? `${restaurantName} siparişinizi inceliyor.` : `${restaurantName} is reviewing your order.`
            : isTurkish ? "Restoran siparişinizi inceliyor." : "The restaurant is reviewing your order."
        : normalizedStatus === "preparing"
          ? isTurkish ? "Mutfak siparişinizi hazırlıyor." : "The kitchen is preparing your order."
          : normalizedStatus === "ready_for_pickup"
            ? isTurkish ? "Siparişiniz kurye için hazır." : "Your order is ready for the courier."
            : normalizedStatus === "on_the_way"
              ? isTurkish ? "Kurye adresinize geliyor." : "The courier is heading to you."
              : normalizedStatus === "delivered"
                ? isTurkish ? "Siparişiniz başarıyla teslim edildi." : "Your order was delivered successfully."
                : isTurkish ? "Bu sipariş artık aktif değil." : "This order is no longer active.";

    const mainTime =
        normalizedStatus === "awaiting_restaurant_approval"
            ? formatRemainingTime(approvalRemainingSeconds)
            : normalizedStatus === "delivered"
              ? "✓"
              : normalizedStatus === "cancelled"
                ? "!"
                : "✓";

    return (
        <View style={styles.card}>
            <View style={styles.ringWrap}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {ORDER_STEPS.map((step, index) => {
                        const start = index * segmentAngle + segmentGap / 2;
                        const end = (index + 1) * segmentAngle - segmentGap / 2;
                        const completed = normalizedStatus === "delivered" || index < currentStepIndex;

                        return (
                            <Path
                                key={step.key}
                                d={describeArc(center, center, radius, start, end)}
                                stroke={completed ? "#FF5A00" : styles.ringTrack.color}
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                                fill="none"
                            />
                        );
                    })}

                    {activeEndAngle >= 359 ? (
                        <Circle cx={center} cy={center} r={radius} stroke="#FF5A00" strokeWidth={strokeWidth} fill="none" />
                    ) : activeEndAngle > 2 ? (
                        <Path
                            d={describeArc(center, center, radius, 0, activeEndAngle)}
                            stroke="#FF5A00"
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            fill="none"
                        />
                    ) : null}

                    <Circle cx={center} cy={center} r={43} stroke={styles.innerRing.borderColor} strokeWidth={1} fill={styles.innerRing.backgroundColor} />
                </Svg>

                <View style={styles.centerContent}>
                    <Text style={styles.timeText}>{mainTime}</Text>
                    <Text style={styles.centerLabel} numberOfLines={2}>
                        {normalizedStatus === "awaiting_restaurant_approval"
                            ? isTurkish ? "Onay bekleniyor" : "Waiting for approval"
                            : label}
                    </Text>
                </View>
            </View>

            <View style={styles.copy}>
                <Text style={styles.title}>{label}</Text>
                <Text style={styles.description}>{description}</Text>

                {normalizedStatus === "awaiting_restaurant_approval" ? (
                    <Text style={styles.hint}>{isTurkish ? "Genellikle birkaç dakika içinde onaylanır." : "Usually approved within a few minutes."}</Text>
                ) : null}

                {cancelRemainingSeconds > 0 ? (
                    <Pressable
                        accessibilityRole={onCancel ? "button" : undefined}
                        accessibilityLabel={isTurkish ? `İptal hakkı ${cancelRemainingSeconds} saniye` : `Cancel window ${cancelRemainingSeconds} seconds`}
                        disabled={!onCancel}
                        onPress={onCancel}
                        style={styles.cancelBadge}
                    >
                        <Ionicons color="#FF5A00" name="time-outline" size={16} />
                        <Text numberOfLines={1} style={styles.cancelBadgeText}>
                            {isTurkish ? "İptal hakkı:" : "Cancel window:"} <Text style={styles.cancelBadgeTime}>{cancelRemainingSeconds} {isTurkish ? "sn" : "sec"}</Text>
                        </Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

const createStyles = (dark: boolean) => StyleSheet.create({
    card: {
        backgroundColor: dark ? "#171A20" : "#FFFFFF",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: dark ? "#2A2E35" : "#EAECF0",
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    ringWrap: {
        width: 148,
        height: 148,
        alignItems: "center",
        justifyContent: "center",
    },
    centerContent: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
        width: 88,
    },
    timeText: {
        color: dark ? "#F5F7FA" : "#111318",
        fontSize: 30,
        lineHeight: 36,
        fontWeight: "700",
        letterSpacing: -0.8,
    },
    centerLabel: {
        marginTop: 4,
        color: dark ? "#98A2B3" : "#667085",
        fontSize: 12.5,
        lineHeight: 17,
        fontWeight: "500",
        textAlign: "center",
    },
    copy: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: dark ? "#F5F7FA" : "#111318",
        fontSize: 18,
        lineHeight: 23,
        fontWeight: "700",
        letterSpacing: -0.2,
    },
    description: {
        marginTop: 6,
        color: dark ? "#98A2B3" : "#667085",
        fontSize: 13.5,
        lineHeight: 19,
    },
    hint: {
        marginTop: 10,
        color: dark ? "#AAB2C0" : "#667085",
        fontSize: 13,
        lineHeight: 18,
        fontWeight: "500",
    },
    cancelBadge: {
        marginTop: 12,
        alignSelf: "flex-start",
        minHeight: 42,
        borderRadius: 12,
        backgroundColor: dark ? "#30231D" : "#FFF3EC",
        borderWidth: 1,
        borderColor: dark ? "#603620" : "#FFE1D2",
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    cancelBadgeText: {
        flexShrink: 1,
        color: dark ? "#FF9A62" : "#C2410C",
        fontSize: 11.5,
        lineHeight: 16,
        fontWeight: "500",
    },
    cancelBadgeTime: { color: "#FF5A00", fontWeight: "700" },
    ringTrack: { color: dark ? "#2A2E35" : "#EAECF0" },
    innerRing: { borderColor: dark ? "#2A2E35" : "#EAECF0", backgroundColor: dark ? "#171A20" : "#FFFFFF" },
});

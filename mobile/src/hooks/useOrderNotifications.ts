import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import type { PanelOrder } from "@/src/features/restaurantPanel/model/panelOrders";
import { storage } from "@/src/lib/storage";
import { SOUND_BLOCKED_ERROR, useNotificationSound } from "@/src/hooks/useNotificationSound";

type UseOrderNotificationsParams = {
    restaurantId: string | null;
    orders: PanelOrder[];
    t: (key: string, vars?: Record<string, string | number>) => string;
};

type ToastState = {
    visible: boolean;
    message: string;
};

const STORAGE_KEYS = {
    notificationsEnabled: "panel_notifications_enabled",
};

const isWeb = Platform.OS === "web";
const THROTTLE_MS = 10_000;

const getLastSeenKey = (restaurantId: string | null) =>
    `panel_last_seen_pending_${restaurantId || "unknown"}`;

const parseIds = (value: string | null) => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
};

export const useOrderNotifications = ({ restaurantId, orders, t }: UseOrderNotificationsParams) => {
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [toast, setToast] = useState<ToastState>({ visible: false, message: "" });
    const [highlightedOrderIds, setHighlightedOrderIds] = useState<string[]>([]);
    const [ready, setReady] = useState(false);
    const {
        isEnabled: soundEnabled,
        lastError: soundError,
        enableSound,
        toggleSound,
        play,
        clearError,
    } = useNotificationSound({ throttleMs: 5000 });

    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const seenPendingIdsRef = useRef<Set<string>>(new Set());
    const hasBaselineRef = useRef(false);
    const lastNotifyAtRef = useRef(0);

    const persistSeenIds = useCallback(async () => {
        if (!restaurantId) return;
        await storage.setItem(getLastSeenKey(restaurantId), JSON.stringify(Array.from(seenPendingIdsRef.current)));
    }, [restaurantId]);

    const showToast = useCallback((message: string) => {
        setToast({ visible: true, message });
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => {
            setToast((prev) => ({ ...prev, visible: false }));
        }, 3600);
    }, []);

    const triggerBrowserNotification = useCallback((title: string, body: string) => {
        if (!isWeb || !notificationsEnabled) return;
        if (typeof window === "undefined" || typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        const isHidden = typeof document !== "undefined" && (document.hidden || !document.hasFocus());
        if (!isHidden) return;
        new Notification(title, { body });
    }, [notificationsEnabled]);

    const notifyGrouped = useCallback(async (newCount: number, force = false) => {
        const now = Date.now();
        if (!force && now - lastNotifyAtRef.current < THROTTLE_MS) return;
        lastNotifyAtRef.current = now;

        const message = newCount === 1 ? t("toast.newOrderSingle") : t("toast.newOrderMulti", { count: newCount });
        showToast(message);
        const soundResult = await play();
        if (soundResult.blocked) {
            showToast(t("toast.soundBlocked"));
        }
        triggerBrowserNotification(t("toast.newOrderTitle"), message);
    }, [play, showToast, t, triggerBrowserNotification]);

    const dismissToast = useCallback(() => {
        setToast((prev) => ({ ...prev, visible: false }));
    }, []);

    const toggleNotifications = useCallback(async () => {
        const next = !notificationsEnabled;
        setNotificationsEnabled(next);
        await storage.setItem(STORAGE_KEYS.notificationsEnabled, next ? "1" : "0");

        if (!isWeb || typeof Notification === "undefined" || !next) return;
        if (Notification.permission === "default") {
            try {
                await Notification.requestPermission();
            } catch {
                // noop
            }
        }
    }, [notificationsEnabled]);

    const testNotification = useCallback(() => {
        void notifyGrouped(1, true);
    }, [notifyGrouped]);

    useEffect(() => {
        let mounted = true;
        const hydrate = async () => {
            const [notifRaw, seenRaw] = await Promise.all([
                storage.getItem(STORAGE_KEYS.notificationsEnabled),
                storage.getItem(getLastSeenKey(restaurantId)),
            ]);
            if (!mounted) return;
            setNotificationsEnabled(notifRaw === "1");
            seenPendingIdsRef.current = new Set(parseIds(seenRaw));
            hasBaselineRef.current = false;
            setHighlightedOrderIds([]);
            setReady(true);
        };
        if (restaurantId) {
            hydrate().catch(() => null);
        } else {
            setReady(false);
            seenPendingIdsRef.current = new Set();
        }
        return () => {
            mounted = false;
        };
    }, [restaurantId]);

    useEffect(() => {
        if (!ready || !restaurantId) return;

        const pendingIds = orders.filter((order) => order.status === "pending").map((order) => order.id);
        const pendingSet = new Set(pendingIds);

        if (!hasBaselineRef.current) {
            if (seenPendingIdsRef.current.size === 0) {
                seenPendingIdsRef.current = new Set(pendingIds);
                void persistSeenIds();
            }
            hasBaselineRef.current = true;
            return;
        }

        const incomingIds = pendingIds.filter((orderId) => !seenPendingIdsRef.current.has(orderId));
        if (incomingIds.length) {
            incomingIds.forEach((orderId) => seenPendingIdsRef.current.add(orderId));
            void persistSeenIds();

            setHighlightedOrderIds((prev) => Array.from(new Set([...prev, ...incomingIds])));
            incomingIds.forEach((orderId) => {
                if (highlightTimeoutsRef.current[orderId]) clearTimeout(highlightTimeoutsRef.current[orderId]);
                highlightTimeoutsRef.current[orderId] = setTimeout(() => {
                    setHighlightedOrderIds((prev) => prev.filter((id) => id !== orderId));
                    delete highlightTimeoutsRef.current[orderId];
                }, 2200);
            });

            if (notificationsEnabled) {
                void notifyGrouped(incomingIds.length);
            } else if (soundEnabled) {
                void play().then((soundResult) => {
                    if (soundResult.blocked) showToast(t("toast.soundBlocked"));
                });
            }
        }

        // Prevent unbounded growth by keeping seen ids relevant to pending + previously stored.
        const cleaned = new Set(
            Array.from(seenPendingIdsRef.current).filter((id) => pendingSet.has(id) || !orders.find((order) => order.id === id)),
        );
        seenPendingIdsRef.current = cleaned;
    }, [notifyGrouped, notificationsEnabled, orders, persistSeenIds, play, ready, restaurantId, showToast, soundEnabled, t]);

    useEffect(() => {
        if (!soundError) return;
        if (soundError === SOUND_BLOCKED_ERROR) {
            showToast(t("toast.soundBlocked"));
        }
        clearError();
    }, [clearError, showToast, soundError, t]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            Object.values(highlightTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
        };
    }, []);

    return useMemo(
        () => ({
            notificationsEnabled,
            soundEnabled,
            toast,
            highlightedOrderIds,
            dismissToast,
            toggleNotifications,
            enableSound,
            toggleSound,
            testNotification,
        }),
        [
            notificationsEnabled,
            soundEnabled,
            toast,
            highlightedOrderIds,
            dismissToast,
            toggleNotifications,
            enableSound,
            toggleSound,
            testNotification,
        ],
    );
};

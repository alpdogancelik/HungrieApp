import { getMessaging, isSupported, onMessage } from "firebase/messaging";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import type { RestaurantRole } from "@hungrie/domain";
import { parseRestaurantDashboard, RestaurantDashboardContractError, type RestaurantDashboard } from "./dashboardContract";
import { firebaseApp } from "./firebase";
import { alertRestaurantOrder, unlockOrderAlert } from "./push";
import { supabase } from "./supabase";
import { deriveRestaurantRuntimeStatus, runtimeResultIsCurrent, type RestaurantRuntimeStatus } from "./restaurantRuntimeModel";
import { resetAcknowledgementIntents } from "./orders/orderAcknowledgementModel";
import { acceptServiceWorkerQualificationMessage, firebaseMessagingIdentity, recordNotificationQualification } from "./notificationQualification";
import { runForegroundNotificationHandler } from "./foregroundNotificationHandler";
import { restaurantOrderRepository } from "./orders/orderRepository";
export type { RestaurantRuntimeStatus } from "./restaurantRuntimeModel";

type RestaurantRuntimeValue = {
  dashboard: RestaurantDashboard | null;
  status: RestaurantRuntimeStatus;
  online: boolean;
  realtimeConnected: boolean;
  lastDashboardReconciledAt: number | null;
  orderEventRevision: number;
  refreshDashboard: () => Promise<RestaurantDashboard | null>;
};

const RestaurantRuntimeContext = createContext<RestaurantRuntimeValue | null>(null);
const REALTIME_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export function useRestaurantRuntime() {
  const value = useContext(RestaurantRuntimeContext);
  if (!value) throw new Error("Restaurant runtime is unavailable");
  return value;
}

export function RestaurantRuntimeProvider({ restaurantId, role, suspended = false, children }: PropsWithChildren<{ restaurantId: string | null; role: RestaurantRole | null; suspended?: boolean }>) {
  const [dashboard, setDashboard] = useState<RestaurantDashboard | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [lastDashboardReconciledAt, setLastDashboardReconciledAt] = useState<number | null>(null);
  const [orderEventRevision, setOrderEventRevision] = useState(0);
  const identityGeneration = useRef(0);
  const requestSequence = useRef(0);
  const latestAppliedRequest = useRef(0);
  const inactive = suspended || !restaurantId || !role;

  const refreshDashboard = useCallback(async () => {
    if (suspended || !restaurantId || !role) return null;
    const generation = identityGeneration.current;
    const request = ++requestSequence.current;
    const result = await supabase.rpc("restaurant_get_dashboard_v1");
    if (!runtimeResultIsCurrent({ resultGeneration: generation, currentGeneration: identityGeneration.current, request, latestAppliedRequest: latestAppliedRequest.current })) return null;
    latestAppliedRequest.current = request;
    if (result.error) {
      setRefreshFailed(true);
      return null;
    }
    try {
      const parsed = parseRestaurantDashboard(result.data);
      if (parsed.restaurantId !== restaurantId || parsed.role !== role) throw new RestaurantDashboardContractError();
      setDashboard(parsed);
      setLastDashboardReconciledAt(Date.now());
      setRefreshFailed(false);
      return parsed;
    } catch {
      setRefreshFailed(true);
      return null;
    }
  }, [restaurantId, role, suspended]);

  useEffect(() => {
    let live = true;
    let unsubscribeMessage: (() => void) | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;
    let connectionSequence = 0;
    identityGeneration.current += 1;
    resetAcknowledgementIntents();
    requestSequence.current = 0;
    latestAppliedRequest.current = 0;
    setDashboard(null);
    setRealtimeConnected(false);
    setRefreshFailed(false);
    setLastDashboardReconciledAt(null);
    setOrderEventRevision(0);
    if (inactive) {
      setOnline(false);
      return;
    }
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);

    const reconcile = () => { if (live) void refreshDashboard(); };
    const removeRealtimeChannel = () => {
      const current = channel;
      channel = undefined;
      if (current) void supabase.removeChannel(current);
    };
    const scheduleRealtimeReconnect = (delayOverride?: number) => {
      if (!live || !navigator.onLine || reconnectTimer) return;
      const delay = delayOverride ?? REALTIME_RETRY_DELAYS_MS[Math.min(reconnectAttempt, REALTIME_RETRY_DELAYS_MS.length - 1)];
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        void connectRealtime();
      }, delay);
    };
    const connectRealtime = async () => {
      if (!live || !navigator.onLine) return;
      const sequence = ++connectionSequence;
      removeRealtimeChannel();
      setRealtimeConnected(false);
      try {
        await supabase.realtime.setAuth();
        if (!live || sequence !== connectionSequence) return;
        // Re-resolve the authorized topic on every attempt. The topic embeds
        // the current account authorization version and must not be cached
        // across membership, suspension, or sign-in transitions.
        const topicResult = await supabase.rpc("restaurant_order_realtime_topic_v2");
        if (!live || sequence !== connectionSequence) return;
        if (topicResult.error || typeof topicResult.data !== "string" || !topicResult.data) {
          throw topicResult.error || new Error("Restaurant Realtime authority is unavailable.");
        }
        const nextChannel = supabase.channel(topicResult.data, { config: { private: true } })
          .on("broadcast", { event: "order_changed" }, ({ payload }) => {
            if (!live || channel !== nextChannel) return;
            setOrderEventRevision(value => value + 1);
            // A second request receives a larger sequence number, so an older
            // initialization response cannot overwrite this reconciliation.
            reconcile();
            if (payload?.operation === "insert" && payload?.order_id) {
              const generation = identityGeneration.current;
              const orderId = String(payload.order_id);
              // Broadcast is only an invalidation hint. Re-authorize the order
              // before turning even its identifier into a user-visible alert.
              void restaurantOrderRepository.get(orderId).then(order => {
                if (!live || channel !== nextChannel || generation !== identityGeneration.current || order.id !== orderId) return;
                return alertRestaurantOrder({ data: { eventType: "restaurant_new_order", orderId } });
              }).catch(() => undefined);
            }
          });
        channel = nextChannel;
        nextChannel.subscribe(status => {
          if (!live || channel !== nextChannel) return;
          if (status === "SUBSCRIBED") {
            reconnectAttempt = 0;
            setRealtimeConnected(true);
            reconcile();
            return;
          }
          setRealtimeConnected(false);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            scheduleRealtimeReconnect();
          }
        });
      } catch {
        if (!live || sequence !== connectionSequence) return;
        setRealtimeConnected(false);
        scheduleRealtimeReconnect();
      }
    };
    const updateNetwork = () => {
      if (!live) return;
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (nextOnline) {
        reconcile();
        scheduleRealtimeReconnect(0);
      } else {
        connectionSequence += 1;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        removeRealtimeChannel();
        setRealtimeConnected(false);
      }
    };
    const recoverVisible = () => {
      if (live && document.visibilityState === "visible" && navigator.onLine) reconcile();
    };
    const unlock = () => void unlockOrderAlert();
    const observeServiceWorker = (event: MessageEvent) => { acceptServiceWorkerQualificationMessage(event.data); };

    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", recoverVisible);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    navigator.serviceWorker?.addEventListener?.("message", observeServiceWorker);

    reconcile();

    recordNotificationQualification("foreground_listener_initializing", undefined, firebaseMessagingIdentity(firebaseApp));
    void isSupported().then(supported => {
      if (!live || !supported) throw new Error("Firebase Messaging is unavailable.");
      unsubscribeMessage = onMessage(getMessaging(firebaseApp), payload => {
        recordNotificationQualification("page_on_message", payload);
        void runForegroundNotificationHandler({ payload, alert: alertRestaurantOrder, record: recordNotificationQualification });
      });
      recordNotificationQualification("foreground_listener_ready", undefined, firebaseMessagingIdentity(firebaseApp));
    }).catch(() => { if (live) recordNotificationQualification("foreground_listener_failed"); });

    void connectRealtime();

    return () => {
      live = false;
      identityGeneration.current += 1;
      resetAcknowledgementIntents();
      unsubscribeMessage?.();
      recordNotificationQualification("foreground_listener_removed");
      connectionSequence += 1;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      removeRealtimeChannel();
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", recoverVisible);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      navigator.serviceWorker?.removeEventListener?.("message", observeServiceWorker);
    };
  }, [inactive, refreshDashboard, restaurantId]);

  const status = deriveRestaurantRuntimeStatus({ online, realtimeConnected, dashboard, refreshFailed });

  const value = useMemo<RestaurantRuntimeValue>(() => ({
    dashboard,
    status,
    online,
    realtimeConnected,
    lastDashboardReconciledAt,
    orderEventRevision,
    refreshDashboard,
  }), [dashboard, status, online, realtimeConnected, lastDashboardReconciledAt, orderEventRevision, refreshDashboard]);

  return <RestaurantRuntimeContext.Provider value={value}>{children}</RestaurantRuntimeContext.Provider>;
}

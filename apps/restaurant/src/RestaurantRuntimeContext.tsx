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

export function useRestaurantRuntime() {
  const value = useContext(RestaurantRuntimeContext);
  if (!value) throw new Error("Restaurant runtime is unavailable");
  return value;
}

export function RestaurantRuntimeProvider({ restaurantId, role, children }: PropsWithChildren<{ restaurantId: string; role: RestaurantRole }>) {
  const [dashboard, setDashboard] = useState<RestaurantDashboard | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [lastDashboardReconciledAt, setLastDashboardReconciledAt] = useState<number | null>(null);
  const [orderEventRevision, setOrderEventRevision] = useState(0);
  const identityGeneration = useRef(0);
  const requestSequence = useRef(0);
  const latestAppliedRequest = useRef(0);

  const refreshDashboard = useCallback(async () => {
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
  }, [restaurantId, role]);

  useEffect(() => {
    let live = true;
    let unsubscribeMessage: (() => void) | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    identityGeneration.current += 1;
    resetAcknowledgementIntents();
    requestSequence.current = 0;
    latestAppliedRequest.current = 0;
    setDashboard(null);
    setRealtimeConnected(false);
    setRefreshFailed(false);
    setLastDashboardReconciledAt(null);
    setOrderEventRevision(0);

    const reconcile = () => { if (live) void refreshDashboard(); };
    const updateNetwork = () => {
      if (!live) return;
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (nextOnline) reconcile();
    };
    const recoverVisible = () => {
      if (live && document.visibilityState === "visible" && navigator.onLine) reconcile();
    };
    const unlock = () => void unlockOrderAlert();

    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", recoverVisible);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    reconcile();

    void isSupported().then(supported => {
      if (!live || !supported) return;
      unsubscribeMessage = onMessage(getMessaging(firebaseApp), payload => {
        void alertRestaurantOrder(payload);
      });
    }).catch(() => undefined);

    void supabase.realtime.setAuth().then(() => {
      if (!live) return;
      channel = supabase.channel(`restaurant-orders:v1:${restaurantId}`, { config: { private: true } })
        .on("broadcast", { event: "order_changed" }, ({ payload }) => {
          if (!live) return;
          setOrderEventRevision(value => value + 1);
          // A second request receives a larger sequence number, so an older
          // initialization response cannot overwrite this reconciliation.
          reconcile();
          if (payload?.operation === "insert" && payload?.order_id) {
            void alertRestaurantOrder({ data: {
              eventType: "restaurant_new_order",
              orderId: String(payload.order_id),
            } });
          }
        })
        .subscribe(status => {
          if (!live) return;
          const subscribed = status === "SUBSCRIBED";
          setRealtimeConnected(subscribed);
          if (subscribed) reconcile();
        });
    }).catch(() => {
      if (live) setRealtimeConnected(false);
    });

    return () => {
      live = false;
      identityGeneration.current += 1;
      resetAcknowledgementIntents();
      unsubscribeMessage?.();
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", recoverVisible);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [refreshDashboard, restaurantId]);

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

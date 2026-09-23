import { useCallback, useEffect, useRef, useState } from "react";
import { useRestaurantRuntime } from "../RestaurantRuntimeContext";
import { restaurantOrderRepository } from "./orderRepository";
import { replaceOrdersMonotonically } from "./orderModel";
import type { RestaurantOrder } from "./orderContract";

const pollMs = Math.min(60000, Math.max(10000, Number(process.env.EXPO_PUBLIC_RESTAURANT_POLL_MS || 15000)));

export function useActiveOrders() {
  const runtime = useRestaurantRuntime();
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [lastReconciledAt, setLastReconciledAt] = useState<number | null>(null);
  const generation = useRef(0);
  const request = useRef(0);
  const applied = useRef(0);
  const observedRealtime = useRef(runtime.orderEventRevision);
  const requestAbort = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const currentGeneration = generation.current;
    const currentRequest = ++request.current;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    try {
      const page = await restaurantOrderRepository.listActive(null, 50, controller.signal);
      if (controller.signal.aborted || generation.current !== currentGeneration || currentRequest < applied.current) return;
      applied.current = currentRequest;
      setOrders(previous => replaceOrdersMonotonically(previous, page.items));
      setLastReconciledAt(Date.now());
      setStale(false);
      setError("");
    } catch {
      if (controller.signal.aborted || generation.current !== currentGeneration || currentRequest < applied.current) return;
      applied.current = currentRequest;
      setStale(true);
      setError("unavailable");
    } finally {
      if (requestAbort.current === controller && generation.current === currentGeneration && currentRequest >= applied.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    request.current = 0;
    applied.current = 0;
    setLoading(true);
    void reload();
    const recover = () => { if (document.visibilityState === "visible" && navigator.onLine) void reload(); };
    const offline = () => setStale(true);
    const timer = setInterval(recover, pollMs);
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", recover);
    return () => {
      generation.current += 1;
      requestAbort.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [reload]);

  useEffect(() => {
    if (observedRealtime.current === runtime.orderEventRevision) return;
    observedRealtime.current = runtime.orderEventRevision;
    void reload();
  }, [reload, runtime.orderEventRevision]);

  return { orders, loading, stale, error, lastReconciledAt, reload };
}

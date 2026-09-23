import { useCallback, useEffect, useRef, useState } from "react";
import { useRestaurantRuntime } from "../RestaurantRuntimeContext";
import type { RestaurantOrder } from "./orderContract";
import { restaurantOrderRepository } from "./orderRepository";

const pollMs = Math.min(60000, Math.max(10000, Number(process.env.EXPO_PUBLIC_RESTAURANT_POLL_MS || 15000)));

export function useOrderDetail(orderId: string, initial?: RestaurantOrder | null) {
  const runtime = useRestaurantRuntime();
  const [order, setOrder] = useState<RestaurantOrder | null>(initial || null);
  const [loading, setLoading] = useState(!initial);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(initial || null);
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
      const next = await restaurantOrderRepository.get(orderId, controller.signal);
      if (controller.signal.aborted || generation.current !== currentGeneration || currentRequest < applied.current) return latest.current;
      applied.current = currentRequest;
      if (!latest.current || Date.parse(next.updated_at) >= Date.parse(latest.current.updated_at)) latest.current = next;
      setOrder(latest.current);
      setStale(false); setError("");
      return latest.current;
    } catch {
      if (!controller.signal.aborted && generation.current === currentGeneration && currentRequest >= applied.current) { applied.current = currentRequest; setStale(Boolean(latest.current)); setError("unavailable"); }
      return latest.current;
    } finally { if (requestAbort.current === controller && generation.current === currentGeneration) setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    generation.current += 1; request.current = 0; applied.current = 0; latest.current = initial || null; setOrder(initial || null); setLoading(!initial); setError(""); setStale(false);
    void reload();
    const recover = () => { if (document.visibilityState === "visible" && navigator.onLine) void reload(); };
    const offline = () => setStale(Boolean(latest.current));
    const timer = setInterval(recover, pollMs);
    window.addEventListener("focus", recover); window.addEventListener("online", recover); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", recover);
    return () => { generation.current += 1; requestAbort.current?.abort(); clearInterval(timer); window.removeEventListener("focus", recover); window.removeEventListener("online", recover); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", recover); };
  }, [initial, orderId, reload]);

  useEffect(() => { if (observedRealtime.current !== runtime.orderEventRevision) { observedRealtime.current = runtime.orderEventRevision; void reload(); } }, [reload, runtime.orderEventRevision]);
  return { order, loading, stale, error, reload };
}

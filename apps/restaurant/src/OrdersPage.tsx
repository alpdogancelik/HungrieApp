import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "expo-router";
import { Shell } from "./Shell";
import { supabase } from "./supabase";
import { useLocale } from "./providers";
import type { OrderPage } from "./contracts";
import { useRestaurantRuntime } from "./RestaurantRuntimeContext";

const poll = Math.min(60000, Math.max(10000, Number(process.env.EXPO_PUBLIC_RESTAURANT_POLL_MS || 15000)));

export function OrdersPage() {
  const { t } = useLocale();
  const runtime = useRestaurantRuntime();
  const [orders, setOrders] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState("");
  const observedEvent = useRef(runtime.orderEventRevision);
  const load = useCallback(async () => {
    const result = await supabase.rpc("restaurant_list_orders_v1" as any, { p_queue: "active", p_cursor: null, p_limit: 50 });
    if (result.error) { setError(t.unavailable); return; }
    const items = (result.data as unknown as OrderPage)?.items || [];
    setOrders(previous => {
      const versions = new Map(previous.map(item => [item.id, item.updated_at]));
      return items.map(item => versions.get(item.id) === item.updated_at ? previous.find(value => value.id === item.id) || item : item);
    });
    setError("");
  }, [t.unavailable]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    void load();
    timer = setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void load(); }, poll);
    const focus = () => void load();
    const network = () => { if (navigator.onLine) void load(); };
    window.addEventListener("focus", focus);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [load]);

  useEffect(() => {
    if (observedEvent.current === runtime.orderEventRevision) return;
    observedEvent.current = runtime.orderEventRevision;
    void load();
  }, [load, runtime.orderEventRevision]);

  useEffect(() => {
    orders.forEach(order => {
      if (order.updated_at) void supabase.rpc("restaurant_acknowledge_order_seen_v1", {
        p_order_id: order.id,
        p_order_version: order.updated_at,
        p_operation_id: crypto.randomUUID(),
      });
    });
  }, [orders]);

  const connected = runtime.status === "connected";
  return <Shell><div className={`banner ${connected ? "healthy" : ""}`}><strong>{t.connection}:</strong> {connected ? "✓" : "⚠"}</div><div className="toolbar"><h1>{t.orders}</h1><button onClick={() => void load()}>{t.refresh}</button></div>{error && <p className="danger">{error}</p>}<div className="grid">{orders.map(order => <article className="card" key={order.id}><h3>#{String(order.id).slice(0, 8)}</h3><p>{order.customer_name || order.customer?.name || "Customer"}</p><p>{order.status} · {order.total_kurus != null ? `₺${(Number(order.total_kurus) / 100).toFixed(2)}` : ""}</p><Link href={`/orders/detail?orderId=${encodeURIComponent(String(order.id))}` as never}>{t.open}</Link></article>)}</div>{!orders.length && !error && <p>{t.noRows}</p>}</Shell>;
}

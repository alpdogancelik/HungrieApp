import { useState } from "react";
import { Shell } from "./Shell";
import { supabase } from "./supabase";
import { useLocale } from "./providers";
import { useRestaurantRuntime } from "./RestaurantRuntimeContext";

export function DashboardPage() {
  const { t } = useLocale();
  const runtime = useRestaurantRuntime();
  const data = runtime.dashboard;
  const [error, setError] = useState("");
  async function toggle() {
    if (!data || (!data.restaurant.acceptingOrders && runtime.status !== "connected")) return;
    const result = await supabase.rpc("restaurant_set_accepting_orders_v1", {
      p_accepting: !data.restaurant.acceptingOrders,
      p_operation_id: crypto.randomUUID(),
    });
    if (result.error) { setError(t.unavailable); return; }
    setError("");
    await runtime.refreshDashboard();
  }
  const ready = runtime.status === "connected";
  return <Shell><div className={`banner ${ready ? "healthy" : ""}`}><strong>{t.connection}:</strong> {ready ? "✓" : "⚠"}</div><h1>{t.dashboard}</h1>{error && <p className="danger">{error}</p>}{data && <><div className="grid"><div className="card"><h2>{data.restaurant.name}</h2><p>{data.restaurant.lifecycleStatus}</p></div>{Object.entries(data.counts).map(([key, value]) => <div className="card" key={key}><strong>{key}</strong><p>{String(value)}</p></div>)}</div><p><button className="button" disabled={!data.restaurant.acceptingOrders && !ready} onClick={() => void toggle()}>{t.accepting}: {data.restaurant.acceptingOrders ? "ON" : "OFF"}</button></p></>}</Shell>;
}

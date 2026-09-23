import { useState } from "react";
import { useLocale } from "./providers";
import { useRestaurantRuntime } from "./RestaurantRuntimeContext";
import { supabase } from "./supabase";

const intents = new Map<string, string>();
export function useRestaurantAcceptance() {
  const runtime = useRestaurantRuntime(), { locale, t } = useLocale();
  const [submitting, setSubmitting] = useState(false), [notice, setNotice] = useState("");
  const dashboard = runtime.dashboard;
  const copy = locale === "tr" ? { connect: "Sipariş alımını açmak için canlı bağlantının kurulmasını bekleyin.", changed: "Ayar sunucudan yeniden yüklendi. Güncel durum gösteriliyor.", failed: "Ayarın sonucu doğrulanamadı. Güncel durum sunucudan yeniden yüklendi." } : { connect: "Wait for the live connection before enabling order acceptance.", changed: "The setting was reloaded from the server. The current state is shown.", failed: "The outcome could not be verified. The current setting was reloaded from the server." };
  async function toggle() {
    if (!dashboard || submitting) return;
    const target = !dashboard.restaurant.acceptingOrders;
    if (target && runtime.status !== "connected") { setNotice(copy.connect); return; }
    if (!target && !runtime.online) { setNotice(t.offlineTitle); return; }
    setSubmitting(true); setNotice("");
    const key = `${dashboard.restaurantId}:${target}`;
    let operationId = intents.get(key); if (!operationId) { operationId = crypto.randomUUID(); intents.set(key, operationId); }
    let requestFailed = false;
    try { const result = await supabase.rpc("restaurant_set_accepting_orders_v1", { p_accepting: target, p_operation_id: operationId }); requestFailed = Boolean(result.error); } catch { requestFailed = true; }
    const current = await runtime.refreshDashboard();
    if (current?.restaurant.acceptingOrders === target) intents.delete(key); else setNotice(requestFailed ? copy.failed : copy.changed);
    setSubmitting(false);
  }
  return { accepting: dashboard?.restaurant.acceptingOrders ?? false, available: Boolean(dashboard), disabled: submitting || (dashboard?.restaurant.acceptingOrders ? !runtime.online : runtime.status !== "connected"), submitting, notice, toggle };
}

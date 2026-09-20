import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/Shell";
import { supabase } from "../../src/supabase";
import { useLocale } from "../../src/providers";
import { useRestaurantAccessReady } from "../../src/RestaurantAccessReady";

const reasons = ["too_busy", "item_unavailable", "closing", "equipment_issue", "delivery_unavailable", "other"];
const requestTimeoutMs = 12000;
const pollMs = Math.min(60000, Math.max(10000, Number(process.env.EXPO_PUBLIC_RESTAURANT_POLL_MS || 15000)));

type OrderItem = {
  id: string;
  name?: string;
  quantity?: number;
  unit_price_kurus?: number;
  customization_total_kurus?: number;
  customizations?: unknown[];
};

type OrderDetail = {
  id: string;
  status: string;
  items?: OrderItem[];
  notes?: string;
  created_at?: string;
  approval_deadline_at?: string;
  payment_method?: string;
  subtotal_kurus?: number;
  discount_kurus?: number;
  service_fee_kurus?: number;
  delivery_fee_kurus?: number;
  tip_kurus?: number;
  total_kurus?: number;
  updated_at: string;
};

const statusLabel = (status: string, locale: "en" | "tr") => {
  const labels: Record<string, [string, string]> = {
    pending: ["Waiting for response", "Yanıt bekliyor"],
    preparing: ["Preparing", "Hazırlanıyor"],
    ready: ["Ready", "Hazır"],
    out_for_delivery: ["Out for delivery", "Teslimata çıktı"],
    delivered: ["Delivered", "Teslim edildi"],
    canceled: ["Canceled", "İptal edildi"],
  };
  return labels[status]?.[locale === "tr" ? 1 : 0] || status.replaceAll("_", " ");
};

const customizationLabels = (value: unknown, locale: "en" | "tr"): string[] => {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  const direct = item.name || item.option_name || item.label || item.value;
  if (direct) return [String(direct)];
  const groups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
  const options = groups.flatMap((group) => {
    if (!group || typeof group !== "object") return [];
    const values = (group as Record<string, unknown>).options;
    return Array.isArray(values) ? values.flatMap((option) => customizationLabels(option, locale)) : [];
  });
  const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
  const removed = ingredients.flatMap((ingredient) => {
    if (!ingredient || typeof ingredient !== "object" || !(ingredient as Record<string, unknown>).removed) return [];
    const name = (ingredient as Record<string, unknown>).name;
    return name ? [`${locale === "tr" ? "Olmasın" : "No"} ${String(name)}`] : [];
  });
  return [...options, ...removed];
};

export default function Order() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const accessReady = useRestaurantAccessReady();
  const { locale, t } = useLocale();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("too_busy");
  const [note, setNote] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const version = useRef("");
  const latestOrder = useRef<OrderDetail | null>(null);
  const inFlight = useRef(false);
  const money = (kurus: number | undefined) => new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    style: "currency", currency: "TRY",
  }).format(Number(kurus || 0) / 100);
  const date = (value?: string) => value
    ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";
  const labels = locale === "tr" ? {
    placed: "Sipariş zamanı", deadline: "Yanıt sonu", payment: "Ödeme", items: "Ürünler",
    subtotal: "Ara toplam", discount: "İndirim", service: "Hizmet bedeli", delivery: "Teslimat",
    tip: "Bahşiş", total: "Toplam", notes: "Müşteri notu", cancel: "Siparişi iptal et",
    customerMessage: "Müşteriye mesaj (isteğe bağlı)",
  } : {
    placed: "Order placed", deadline: "Response deadline", payment: "Payment", items: "Items",
    subtotal: "Subtotal", discount: "Discount", service: "Service fee", delivery: "Delivery",
    tip: "Tip", total: "Total", notes: "Customer note", cancel: "Cancel order",
    customerMessage: "Message to customer (optional)",
  };

  const changedNotice = useCallback((status: string) => locale === "tr"
    ? `Bu sipariş değişti. Güncel durum: ${statusLabel(status, locale)}.`
    : `This order changed. Current status: ${statusLabel(status, locale)}.`, [locale]);

  const load = useCallback(async (notifyChange = true): Promise<OrderDetail | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const result = await supabase.rpc("restaurant_get_order_v1" as never, { p_order_id: String(orderId) } as never)
        .abortSignal(controller.signal) as { data: unknown; error: Error | null };
      if (result.error || !result.data) throw result.error || new Error("Order unavailable");
      const current = result.data as unknown as OrderDetail;
      if (latestOrder.current && Date.parse(current.updated_at) < Date.parse(latestOrder.current.updated_at)) {
        return latestOrder.current;
      }
      if (notifyChange && version.current && version.current !== current.updated_at) setNotice(changedNotice(current.status));
      version.current = current.updated_at;
      latestOrder.current = current;
      setData(current);
      setError("");
      return current;
    } catch {
      setError(t.unavailable);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, [orderId, t.unavailable, changedNotice]);

  useEffect(() => {
    version.current = "";
    latestOrder.current = null;
    setData(null);
    setNotice("");
    if (!accessReady || !orderId) return;
    void load();
    const reconcile = () => { if (document.visibilityState === "visible" && navigator.onLine) void load(); };
    const timer = setInterval(reconcile, pollMs);
    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [accessReady, load, orderId]);

  async function transition(status: string) {
    if (!data || inFlight.current) return;
    inFlight.current = true;
    setTransitioning(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const operationId = crypto.randomUUID();
      const request = status === "canceled"
        ? supabase.rpc("restaurant_cancel_order_v2" as never, {
          p_order_id: String(orderId), p_expected_version: data.updated_at,
          p_reason_code: reason, p_customer_message: note.trim(), p_operation_id: operationId,
        } as never)
        : supabase.rpc("restaurant_transition_order_v1" as never, {
          p_order_id: String(orderId), p_expected_version: data.updated_at, p_new_status: status,
          p_reason_code: null, p_note: null, p_operation_id: operationId,
        } as never);
      const result = await request.abortSignal(controller.signal);
      if (result.error) {
        const current = await load();
        if (result.error.code === "40001" && current) setNotice(changedNotice(current.status));
        else if (current && current.updated_at !== data.updated_at) setNotice(changedNotice(current.status));
        else if (result.error.code !== "40001") setError(`${t.unavailable} Ref: ${crypto.randomUUID().slice(0, 8)}`);
        return;
      }
      const current = await load(false);
      if (current && current.status !== status) setNotice(changedNotice(current.status));
    } catch {
      const current = await load();
      if (!current || current.updated_at === data.updated_at) setError(`${t.unavailable} Ref: ${crypto.randomUUID().slice(0, 8)}`);
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setTransitioning(false);
    }
  }

  const next = data?.status === "pending" ? "preparing"
    : data?.status === "preparing" ? "ready"
      : data?.status === "ready" ? "out_for_delivery"
        : data?.status === "out_for_delivery" ? "delivered" : null;

  return <Shell>
    <div className="order-heading">
      <div><p className="eyebrow">{locale === "tr" ? "Sipariş" : "Order"}</p><h1>#{String(orderId).slice(0, 8)}</h1></div>
      {data && <span className={`order-status status-${data.status}`}>{statusLabel(data.status, locale)}</span>}
    </div>
    {accessReady && error && <p className="danger" role="alert">{error}</p>}
    {notice && <p className="banner" role="status" aria-live="polite">{notice}</p>}
    <p><button type="button" disabled={transitioning || !accessReady} onClick={() => void load()}>{t.refresh}</button></p>
    {!accessReady || !data ? <section className="card"><p>{t.loading}</p></section> : <>
      <section className="card order-meta">
        <div><span>{labels.placed}</span><strong>{date(data.created_at)}</strong></div>
        <div><span>{labels.deadline}</span><strong>{date(data.approval_deadline_at)}</strong></div>
        <div><span>{labels.payment}</span><strong>{String(data.payment_method || "—").toUpperCase()}</strong></div>
      </section>

      <section className="card order-detail-card">
        <h2>{labels.items}</h2>
        <div className="order-item-list">
          {(data.items || []).map((item) => {
            const quantity = Number(item.quantity || 1);
            const lineTotal = quantity * (Number(item.unit_price_kurus || 0) + Number(item.customization_total_kurus || 0));
            const customizations = (item.customizations || []).flatMap((value) => customizationLabels(value, locale)).filter(Boolean);
            return <article className="order-line" key={item.id}>
              <div className="order-quantity">{quantity}×</div>
              <div><strong>{item.name || (locale === "tr" ? "Ürün" : "Item")}</strong>
                {customizations.length > 0 && <p>{customizations.join(" · ")}</p>}
              </div>
              <strong>{money(lineTotal)}</strong>
            </article>;
          })}
        </div>
        {data.notes && <div className="order-note"><span>{labels.notes}</span><p>{data.notes}</p></div>}
        <dl className="order-totals">
          <div><dt>{labels.subtotal}</dt><dd>{money(data.subtotal_kurus)}</dd></div>
          {Number(data.discount_kurus) > 0 && <div><dt>{labels.discount}</dt><dd>−{money(data.discount_kurus)}</dd></div>}
          {Number(data.service_fee_kurus) > 0 && <div><dt>{labels.service}</dt><dd>{money(data.service_fee_kurus)}</dd></div>}
          {Number(data.delivery_fee_kurus) > 0 && <div><dt>{labels.delivery}</dt><dd>{money(data.delivery_fee_kurus)}</dd></div>}
          {Number(data.tip_kurus) > 0 && <div><dt>{labels.tip}</dt><dd>{money(data.tip_kurus)}</dd></div>}
          <div className="order-total"><dt>{labels.total}</dt><dd>{money(data.total_kurus)}</dd></div>
        </dl>
      </section>

      {next && <p><button className="button" disabled={transitioning} onClick={() => void transition(next)}>{t.confirm}: {statusLabel(next, locale)}</button></p>}
      {!['delivered', 'canceled'].includes(data.status) && <section className="card cancel-card">
        <h2>{labels.cancel}</h2>
        <label className="field">{t.reason}<select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label className="field">{labels.customerMessage}<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button disabled={transitioning} onClick={() => void transition("canceled")}>{labels.cancel}</button>
      </section>}
    </>}
  </Shell>;
}

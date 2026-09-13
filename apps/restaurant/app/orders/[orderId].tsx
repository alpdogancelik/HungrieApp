import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/Shell";
import { supabase } from "../../src/supabase";
import { useLocale } from "../../src/providers";

const reasons = ["too_busy", "item_unavailable", "closing", "equipment_issue", "delivery_unavailable", "other"];

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
  const { locale, t } = useLocale();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("too_busy");
  const [note, setNote] = useState("");
  const [transitioning, setTransitioning] = useState(false);
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
  } : {
    placed: "Order placed", deadline: "Response deadline", payment: "Payment", items: "Items",
    subtotal: "Subtotal", discount: "Discount", service: "Service fee", delivery: "Delivery",
    tip: "Tip", total: "Total", notes: "Customer note", cancel: "Cancel order",
  };

  const load = useCallback(async () => {
    const result = await supabase.rpc("restaurant_get_order_v1" as never, { p_order_id: String(orderId) } as never);
    if (result.error) setError(t.unavailable);
    else {
      setData(result.data as unknown as OrderDetail);
      setError("");
    }
  }, [orderId, t.unavailable]);

  useEffect(() => { void load(); }, [load]);

  async function transition(status: string) {
    if (!data || transitioning) return;
    setTransitioning(true);
    setError("");
    try {
      const result = await supabase.rpc("restaurant_transition_order_v1" as never, {
        p_order_id: String(orderId), p_expected_version: data.updated_at, p_new_status: status,
        p_reason_code: status === "canceled" ? reason : null, p_note: status === "canceled" ? note : null,
        p_operation_id: crypto.randomUUID(),
      } as never);
      if (result.error) {
        await load();
        setError(result.error.code === "40001" ? t.changed : `${t.unavailable} Ref: ${crypto.randomUUID().slice(0, 8)}`);
        return;
      }
      await load();
    } catch {
      setError(`${t.unavailable} Ref: ${crypto.randomUUID().slice(0, 8)}`);
    } finally {
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
    {error && <p className="danger" role="alert">{error}</p>}
    {!data ? <section className="card"><p>{t.loading}</p></section> : <>
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
        <label className="field">{t.reason}<select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label className="field">{t.note}<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button disabled={transitioning} onClick={() => void transition("canceled")}>{labels.cancel}</button>
      </section>}
    </>}
  </Shell>;
}

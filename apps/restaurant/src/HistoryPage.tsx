import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "./Shell";
import { supabase } from "./supabase";
import { useLocale } from "./providers";
import type { OrderPage } from "./contracts";

const formatMoney = (value: unknown, locale: string) =>
  new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    style: "currency",
    currency: "TRY",
  }).format(Number(value || 0) / 100);

const formatDate = (value: unknown, locale: string) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(String(value)));
};

export function HistoryPage() {
  const { locale, t } = useLocale();
  const [orders, setOrders] = useState<Record<string, any>[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (cursor: string | null = null) => {
    setLoading(true);
    setError("");
    const result = await supabase.rpc("restaurant_list_orders_v1" as any, {
      p_queue: "history",
      p_cursor: cursor,
      p_limit: 25,
    });
    if (result.error) {
      setError(`${t.unavailable} Ref: ${crypto.randomUUID().slice(0, 8)}`);
      setLoading(false);
      return;
    }
    const page = result.data as unknown as OrderPage & { has_more?: boolean };
    setOrders(previous => cursor ? [...previous, ...(page.items || [])] : (page.items || []));
    setNextCursor(page.next_cursor || null);
    setHasMore(Boolean(page.has_more));
    setLoading(false);
  }, [t.unavailable]);

  useEffect(() => { void load(); }, [load]);

  const labels = locale === "tr"
    ? { order: "Sipariş", customer: "Müşteri", status: "Durum", total: "Toplam", date: "Tarih", more: "Daha fazla yükle", empty: "Henüz tamamlanmış veya iptal edilmiş sipariş yok." }
    : { order: "Order", customer: "Customer", status: "Status", total: "Total", date: "Date", more: "Load more", empty: "There are no completed or cancelled orders yet." };

  return <Shell>
    <div className="toolbar"><h1>{t.history}</h1><button onClick={() => void load()} disabled={loading}>{t.refresh}</button></div>
    {error && <p className="danger">{error}</p>}
    {!loading && !error && orders.length === 0 && <section className="card empty-state"><p>{labels.empty}</p></section>}
    {orders.length > 0 && <>
      <div className="table"><table>
        <thead><tr><th>{labels.order}</th><th>{labels.customer}</th><th>{labels.status}</th><th>{labels.total}</th><th>{labels.date}</th></tr></thead>
        <tbody>{orders.map(order => <tr key={order.id}>
          <td><Link href={`/orders/detail?orderId=${encodeURIComponent(String(order.id))}` as any}>#{String(order.id).slice(0, 8)}</Link></td>
          <td>{order.customer_name || "—"}</td><td><span className="badge">{order.status}</span></td>
          <td>{formatMoney(order.total_kurus, locale)}</td><td>{formatDate(order.created_at, locale)}</td>
        </tr>)}</tbody>
      </table></div>
      {hasMore && nextCursor && <p><button onClick={() => void load(nextCursor)} disabled={loading}>{labels.more}</button></p>}
    </>}
    {loading && orders.length === 0 && <p>{t.loading}</p>}
  </Shell>;
}

import { Link } from "expo-router";
import { Clock3, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "./Shell";
import { Button } from "./components/Button";
import { PageHeader } from "./components/PageHeader";
import { restaurantManagementRepository } from "./managementRepository";
import type { RestaurantOrder } from "./orders/orderContract";
import { normalizeOrderSearch, orderReference } from "./orders/orderPresentation";
import { useLocale } from "./providers";

const money = (value: number, locale: string) => new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency: "TRY" }).format(value / 100);
const date = (value: string, locale: string) => new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function HistoryPage() {
  const { locale, t } = useLocale();
  const [orders, setOrders] = useState<RestaurantOrder[]>([]), [cursor, setCursor] = useState<string | null>(null), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [stale, setStale] = useState(false), [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState("");
  const generation = useRef(0), abort = useRef<AbortController | null>(null), cursorGate = useRef(new Set<string>()), hasOrders = useRef(false);
  hasOrders.current = orders.length > 0;
  const copy = locale === "tr" ? { subtitle: "Tamamlanan ve iptal edilen siparişlerin sunucu kayıtları.", order: "Sipariş", status: "Durum", total: "Toplam", date: "Tarih", delivered: "Teslim edildi", canceled: "İptal edildi", more: "Daha fazla yükle", empty: "Henüz tamamlanmış veya iptal edilmiş sipariş yok.", noResults: "Bu sipariş numarasıyla eşleşen kayıt bulunamadı.", search: "Sipariş ara", searchPlaceholder: "Sipariş no. (örn. 188944BE)", clearSearch: "Aramayı temizle", stale: "Önceki sipariş geçmişi gösteriliyor.", failed: "Sipariş geçmişi yenilenemedi." } : { subtitle: "Authoritative records of delivered and cancelled orders.", order: "Order", status: "Status", total: "Total", date: "Date", delivered: "Delivered", canceled: "Cancelled", more: "Load more", empty: "There are no completed or cancelled orders yet.", noResults: "No record matches that order number.", search: "Search orders", searchPlaceholder: "Order no. (e.g. 188944BE)", clearSearch: "Clear search", stale: "The previous order history is shown.", failed: "Order history could not be refreshed." };

  const load = useCallback(async (next: string | null = null) => {
    const gateKey = `${search}:${next || "__first__"}`; if (cursorGate.current.has(gateKey)) return;
    cursorGate.current.add(gateKey); const request = ++generation.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError("");
    try {
      const page = await restaurantManagementRepository.listHistory(next, search, 25, controller.signal);
      if (request !== generation.current) return;
      setOrders(previous => { const combined = next ? [...previous, ...page.items] : page.items; return [...new Map(combined.map(order => [order.id, order])).values()]; });
      setCursor(page.next_cursor); setHasMore(page.has_more); setStale(false);
    } catch { if (request === generation.current && !controller.signal.aborted) { setError(copy.failed); setStale(hasOrders.current); } }
    finally { cursorGate.current.delete(gateKey); if (request === generation.current) setLoading(false); }
  }, [copy.failed, search]);
  useEffect(() => { void load(); return () => { generation.current += 1; abort.current?.abort(); }; }, [load]);

  const status = (value: RestaurantOrder["status"]) => value === "delivered" ? copy.delivered : copy.canceled;
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); setSearch(normalizeOrderSearch(searchInput)); };
  const clearSearch = () => { setSearchInput(""); setSearch(""); };
  return <Shell><PageHeader title={t.history} subtitle={copy.subtitle} action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} aria-hidden />{t.refresh}</Button>} />
    <form className="history-search" role="search" onSubmit={submitSearch}>
      <label htmlFor="history-order-search" className="sr-only">{copy.search}</label>
      <div className="history-search__field"><Search size={18} aria-hidden /><input id="history-order-search" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={copy.searchPlaceholder} autoComplete="off" maxLength={64} />{(searchInput || search) && <button type="button" onClick={clearSearch} aria-label={copy.clearSearch}><X size={18} aria-hidden /></button>}</div>
      <Button type="submit" disabled={loading || normalizeOrderSearch(searchInput) === search}>{copy.search}</Button>
    </form>
    {error && <p className="ui-notice ui-notice--danger" role="alert">{error} {!orders.length && <button onClick={() => void load()}>{t.retry}</button>}</p>}
    {stale && <p className="ui-notice ui-notice--warning" role="status">{copy.stale}</p>}
    {loading && !orders.length && <div className="ui-card history-loading" aria-busy="true"><Clock3 aria-hidden /><p>{t.loading}</p></div>}
    {!loading && !orders.length && !error && <section className="ui-card order-empty"><Clock3 aria-hidden /><p>{search ? copy.noResults : copy.empty}</p></section>}
    {!!orders.length && <><div className="history-table ui-card"><table><thead><tr><th>{copy.order}</th><th>{copy.status}</th><th>{copy.total}</th><th>{copy.date}</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><Link href={`/orders/detail?orderId=${encodeURIComponent(order.id)}` as never}>#{orderReference(order.id)}</Link></td><td><span className={`order-status order-status--${order.status}`}>{status(order.status)}</span></td><td>{money(order.total_kurus, locale)}</td><td>{date(order.created_at, locale)}</td></tr>)}</tbody></table></div>
      <div className="history-cards">{orders.map(order => <article className="ui-card history-card" key={order.id}><div><Link href={`/orders/detail?orderId=${encodeURIComponent(order.id)}` as never}>#{orderReference(order.id)}</Link><span className={`order-status order-status--${order.status}`}>{status(order.status)}</span></div><strong>{money(order.total_kurus, locale)}</strong><time dateTime={order.created_at}>{date(order.created_at, locale)}</time></article>)}</div>
      {hasMore && cursor && <div className="history-more"><Button variant="secondary" disabled={loading} onClick={() => void load(cursor)}>{loading ? t.loading : copy.more}</Button></div>}</>}
  </Shell>;
}

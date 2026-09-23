import { useMemo } from "react";
import { Clock3, MessageSquareText, Radio, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Shell } from "./Shell";
import { Button } from "./components/Button";
import { PageHeader } from "./components/PageHeader";
import { Toggle } from "./components/Toggle";
import { OrderCard } from "./orders/OrderCard";
import { useActiveOrders } from "./orders/useActiveOrders";
import { useLocale } from "./providers";
import { useRestaurantRuntime } from "./RestaurantRuntimeContext";
import { useRestaurantAcceptance } from "./useRestaurantAcceptance";

export function DashboardPage() {
  const { locale, t } = useLocale();
  const runtime = useRestaurantRuntime();
  const active = useActiveOrders();
  const data = runtime.dashboard;
  const acceptance = useRestaurantAcceptance();
  const pending = active.orders.filter(order => order.status === "pending").slice(0, 3);
  const freshness = active.lastReconciledAt ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(active.lastReconciledAt) : "—";
  const copy = locale === "tr" ? { title: "Operasyon özeti", subtitle: "Yetkili operasyon verileri ve canlı sipariş durumu.", open: "Restoran sipariş alıyor", closed: "Restoran sipariş almıyor", pending: "Bekleyen", active: "Aktif", reviews: "Yanıtsız değerlendirme", live: "Canlı bağlantı", preview: "Bekleyen siparişler", freshness: "Sipariş listesi son yenileme", noPending: "Bekleyen sipariş yok.", enablingGuard: "Sipariş alımını açmak için canlı bağlantının kurulmasını bekleyin.", changed: "Ayar sunucudan yeniden yüklendi. Güncel durum gösteriliyor.", failed: "Ayarın sonucu doğrulanamadı. Güncel durum sunucudan yeniden yüklendi." } : { title: "Operations overview", subtitle: "Authoritative operational data and live-order status.", open: "Restaurant is accepting orders", closed: "Restaurant is not accepting orders", pending: "Pending", active: "Active", reviews: "Unread reviews", live: "Live connection", preview: "Pending orders", freshness: "Order list last refreshed", noPending: "There are no pending orders.", enablingGuard: "Wait for the live connection before enabling order acceptance.", changed: "The setting was reloaded from the server. The current state is shown.", failed: "The outcome could not be verified. The current setting was reloaded from the server." };

  const metrics = useMemo(() => data ? [
    { label: copy.pending, value: data.counts.pending, icon: Clock3 },
    { label: copy.active, value: data.counts.active, icon: ShoppingBag },
    { label: copy.reviews, value: data.counts.unreadReviews, icon: MessageSquareText },
    { label: copy.live, value: t.runtimeStatus[runtime.status], icon: Radio },
  ] : [], [copy.active, copy.live, copy.pending, copy.reviews, data, runtime.status, t.runtimeStatus]);

  return <Shell><PageHeader title={copy.title} subtitle={copy.subtitle} />
    {acceptance.notice && <p className="ui-notice ui-notice--warning" role="status">{acceptance.notice}</p>}
    {data ? <>
      <section className="dashboard-hero"><div className="dashboard-hero__icon"><UtensilsCrossed aria-hidden /></div><div><p className="eyebrow">{data.restaurant.lifecycleStatus}</p><h2>{data.restaurant.name}</h2><p>{data.restaurant.acceptingOrders ? copy.open : copy.closed}</p></div><div className="dashboard-acceptance"><span>{t.accepting}</span><Toggle checked={acceptance.accepting} disabled={acceptance.disabled} onChange={() => void acceptance.toggle()} label={t.accepting} /></div></section>
      <section className="dashboard-metrics" aria-label={locale === "tr" ? "Operasyon ölçümleri" : "Operational metrics"}>{metrics.map(({ label, value, icon: Icon }) => <article className="ui-card dashboard-metric" key={label}><Icon aria-hidden /><span>{label}</span><strong>{value}</strong></article>)}</section>
      <section className="dashboard-preview"><div className="dashboard-preview__heading"><div><h2>{copy.preview}</h2><p>{copy.freshness}: <strong>{freshness}</strong></p></div><Button variant="secondary" onClick={() => void active.reload()}>{t.refresh}</Button></div>{active.stale && <p className="ui-notice ui-notice--warning">{locale === "tr" ? "Önceki sipariş listesi gösteriliyor." : "The previous order list is shown."}</p>}<div className="dashboard-preview__grid">{pending.map(order => <OrderCard key={`${order.id}:${order.updated_at}`} order={order} />)}{!active.loading && !pending.length && <div className="ui-card order-empty"><p>{copy.noPending}</p></div>}</div></section>
    </> : <div className="ui-card order-skeleton" aria-busy="true"><span /><span /><span /></div>}
  </Shell>;
}

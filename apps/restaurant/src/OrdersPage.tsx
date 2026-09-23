import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Shell } from "./Shell";
import { Button } from "./components/Button";
import { PageHeader } from "./components/PageHeader";
import { useLocale } from "./providers";
import { useRestaurantRuntime } from "./RestaurantRuntimeContext";
import { ACTIVE_ORDER_STATUSES, type ActiveOrderStatus, type RestaurantOrder } from "./orders/orderContract";
import { OrderCard } from "./orders/OrderCard";
import { OrderDetailView } from "./orders/OrderDetailView";
import { statusLabel } from "./orders/orderPresentation";
import { restaurantOrderRepository } from "./orders/orderRepository";
import { useActiveOrders } from "./orders/useActiveOrders";

export function OrdersPage() {
  const { locale, t } = useLocale();
  const runtime = useRestaurantRuntime();
  const active = useActiveOrders();
  const [filter, setFilter] = useState<ActiveOrderStatus | "all">("all");
  const [selectedId, setSelectedId] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selected = active.orders.find(order => order.id === selectedId) || active.orders[0] || null;
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  const refreshSelected = useCallback(async (): Promise<RestaurantOrder | null> => {
    if (!selected) return null;
    try {
      const next = await restaurantOrderRepository.get(selected.id);
      await active.reload();
      return next;
    } catch { await active.reload(); return null; }
  }, [active, selected]);
  const filtered = filter === "all" ? active.orders : active.orders.filter(order => order.status === filter);
  const freshness = active.lastReconciledAt ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(active.lastReconciledAt) : "—";
  const copy = locale === "tr" ? { title: "Canlı siparişler", subtitle: "Tüm sütunlar tek bir yetkili aktif sipariş listesinden oluşturulur.", all: "Tümü", empty: "Bu durumda aktif sipariş yok.", stale: "Daha önce yüklenen siparişler gösteriliyor. Son yenileme başarısız oldu.", refreshed: "Sipariş listesi son yenileme", board: "Sipariş panosu", detail: "Seçili sipariş" } : { title: "Live orders", subtitle: "Every column comes from one authoritative active-order list.", all: "All", empty: "There are no active orders in this state.", stale: "Previously loaded orders are shown. The latest refresh failed.", refreshed: "Order list last refreshed", board: "Order board", detail: "Selected order" };

  return <Shell><PageHeader title={copy.title} subtitle={copy.subtitle} action={<Button variant="secondary" disabled={active.loading} onClick={() => void active.reload()}><RefreshCw size={17} aria-hidden />{t.refresh}</Button>} />
    <div className="orders-freshness" role="status"><span className={`runtime-status runtime-status--${runtime.status}`}>{t.runtimeStatus[runtime.status]}</span><span>{copy.refreshed}: <strong>{freshness}</strong></span></div>
    {active.stale && <p className="ui-notice ui-notice--warning" role="status">{copy.stale}</p>}
    {active.error && !active.orders.length && <p className="danger" role="alert">{t.unavailable}</p>}
    <div className="orders-mobile">
      <div className="order-filters" role="group" aria-label={locale === "tr" ? "Sipariş durumu filtresi" : "Order status filter"}><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{copy.all} <span>{active.orders.length}</span></button>{ACTIVE_ORDER_STATUSES.map(status => <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{statusLabel(status, locale)} <span>{active.orders.filter(order => order.status === status).length}</span></button>)}</div>
      <div className="order-list">{filtered.map(order => <OrderCard key={`${order.id}:${order.updated_at}`} order={order} />)}{!active.loading && !filtered.length && <div className="ui-card order-empty"><p>{copy.empty}</p></div>}</div>
    </div>
    <div className="orders-desktop" aria-label={copy.board}>
      <div className="order-board" ref={boardRef}>{ACTIVE_ORDER_STATUSES.map(status => <section className="order-column" key={status} aria-labelledby={`column-${status}`}><header><h2 id={`column-${status}`}>{statusLabel(status, locale)}</h2><span>{active.orders.filter(order => order.status === status).length}</span></header><div className="order-column__list">{active.orders.filter(order => order.status === status).map(order => <OrderCard key={`${order.id}:${order.updated_at}`} order={order} selected={selected?.id === order.id} onSelect={() => setSelectedId(order.id)} rootRef={boardRef} />)}{!active.loading && !active.orders.some(order => order.status === status) && <p className="order-column__empty">{copy.empty}</p>}</div></section>)}</div>
      <aside ref={detailRef} className="order-detail-panel" aria-label={copy.detail}>{selected ? <OrderDetailView key={selected.id} compact stale={active.stale} order={selected} reload={refreshSelected} scrollRootRef={detailRef} /> : <div className="ui-card order-empty"><p>{copy.empty}</p></div>}</aside>
    </div>
  </Shell>;
}

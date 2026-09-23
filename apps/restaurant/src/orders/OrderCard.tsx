import { Link } from "expo-router";
import type { RefObject } from "react";
import { Clock3 } from "lucide-react";
import { useLocale } from "../providers";
import type { RestaurantOrder } from "./orderContract";
import { useVisibleOrderAcknowledgement } from "./orderAcknowledgement";
import { statusLabel } from "./orderPresentation";

export function OrderCard({ order, selected, onSelect, rootRef }: { order: RestaurantOrder; selected?: boolean; onSelect?: () => void; rootRef?: RefObject<Element | null> }) {
  const { locale } = useLocale();
  const acknowledgement = useVisibleOrderAcknowledgement(order.id, order.updated_at, rootRef);
  const money = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency: "TRY" }).format(order.total_kurus / 100);
  const time = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(order.created_at));
  return <article ref={acknowledgement.targetRef} className="order-card" data-selected={selected || undefined} aria-label={`${locale === "tr" ? "Sipariş" : "Order"} ${order.id.slice(0, 8)}`}>
    <div className="order-card__top"><strong>#{order.id.slice(0, 8)}</strong><span className={`order-status status-${order.status}`}>{statusLabel(order.status, locale)}</span></div>
    <p className="order-card__customer">{order.customer_name || (locale === "tr" ? "Müşteri" : "Customer")}</p>
    <div className="order-card__meta"><span><Clock3 size={15} aria-hidden />{time}</span><strong>{money}</strong></div>
    {acknowledgement.state === "failed" && <button className="order-card__ack" type="button" onClick={() => void acknowledgement.retry()}>{locale === "tr" ? "Görüldü bilgisini yeniden gönder" : "Retry seen acknowledgement"}</button>}
    <button className="order-card__desktop-action" type="button" aria-pressed={selected} onClick={onSelect}>{locale === "tr" ? "Detayları göster" : "Show details"}</button>
    <Link className="order-card__mobile-action" href={`/orders/detail?orderId=${encodeURIComponent(order.id)}` as never}>{locale === "tr" ? "Siparişi aç" : "Open order"}</Link>
  </article>;
}

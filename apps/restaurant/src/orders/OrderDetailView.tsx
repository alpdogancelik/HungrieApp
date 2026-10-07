import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { useLocale } from "../providers";
import { useRestaurantRuntime } from "../RestaurantRuntimeContext";
import { useVisibleOrderAcknowledgement } from "./orderAcknowledgement";
import { CANCELLATION_REASONS, normalizeCancellationMessage, type CancellationReason, type RestaurantOrder } from "./orderContract";
import { classifyMutationResult, deadlineRemainingMs, discardMutationIntent, getMutationIntent, mutationFailureKind, nextOrderStatus, type MutationIntent } from "./orderModel";
import { customizationLabels, orderReference, reasonLabel, statusLabel } from "./orderPresentation";
import { restaurantOrderRepository } from "./orderRepository";

export function OrderDetailView({ order, reload, compact = false, stale = false, scrollRootRef }: { order: RestaurantOrder; reload: () => Promise<RestaurantOrder | null>; compact?: boolean; stale?: boolean; scrollRootRef?: RefObject<Element | null> }) {
  const { locale } = useLocale();
  const runtime = useRestaurantRuntime();
  const [current, setCurrent] = useState(order);
  const [submitting, setSubmitting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReason>("too_busy");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unknownIntent, setUnknownIntent] = useState<MutationIntent | null>(null);
  const [now, setNow] = useState(Date.now());
  const expiredVersion = useRef("");
  const acknowledgement = useVisibleOrderAcknowledgement(current.id, current.updated_at, scrollRootRef);

  useEffect(() => { if (Date.parse(order.updated_at) >= Date.parse(current.updated_at)) setCurrent(order); }, [current.updated_at, order]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const deadlineRemaining = current.status === "pending" && current.approval_deadline_at ? deadlineRemainingMs(current.approval_deadline_at, now, runtime.dashboard?.serverTime, runtime.lastDashboardReconciledAt) : null;
  const expiredAwaiting = deadlineRemaining !== null && deadlineRemaining <= 0;

  useEffect(() => {
    if (!expiredAwaiting || expiredVersion.current === current.updated_at) return;
    expiredVersion.current = current.updated_at;
    void reload().then(next => { if (next) setCurrent(next); });
  }, [current.updated_at, expiredAwaiting, reload]);

  const copy = locale === "tr" ? {
    placed: "Sipariş zamanı", deadline: "Yanıt süresi", payment: "Ödeme", items: "Ürünler", subtotal: "Ara toplam", discount: "İndirim", service: "Hizmet bedeli", delivery: "Teslimat", tip: "Bahşiş", total: "Toplam", notes: "Müşteri notu", contact: "Teslimat bilgileri", cancel: "Siparişi iptal et", customerMessage: "Müşteriye mesaj (isteğe bağlı)", continue: "Sonraki duruma geçir", close: "Vazgeç", unknown: "İsteğin sonucu doğrulanamadı. Sipariş değişmedi; aynı isteği güvenle yeniden deneyebilirsiniz.", retrySame: "Aynı isteği yeniden dene", conflict: "Sipariş başka bir işlemle değişti. Güncel durum gösteriliyor.", expired: "Süre doldu; sunucu durumu doğrulanıyor.", unavailable: "İşlem tamamlanamadı. Güncel sipariş yeniden yüklendi.", cancelHelp: "Nedeni seçin. İsteğe bağlı mesaj müşteriye gösterilebilir.", countdown: "Kalan süre",
  } : {
    placed: "Order placed", deadline: "Response deadline", payment: "Payment", items: "Items", subtotal: "Subtotal", discount: "Discount", service: "Service fee", delivery: "Delivery", tip: "Tip", total: "Total", notes: "Customer note", contact: "Delivery information", cancel: "Cancel order", customerMessage: "Message to customer (optional)", continue: "Move to next status", close: "Keep order", unknown: "The request outcome could not be verified. The order is unchanged, so you can explicitly retry the same request.", retrySame: "Retry the same request", conflict: "The order changed elsewhere. The current state is shown.", expired: "The deadline passed; checking the server state.", unavailable: "The action could not be completed. The current order was reloaded.", cancelHelp: "Choose a reason. The optional message may be shown to the customer.", countdown: "Time remaining",
  };
  const money = (kurus: number) => new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency: "TRY" }).format(kurus / 100);
  const date = (value?: string) => value ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  const countdown = useMemo(() => {
    if (deadlineRemaining === null) return null;
    const seconds = Math.max(0, Math.ceil(deadlineRemaining / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }, [deadlineRemaining]);

  const execute = useCallback(async (intent: MutationIntent) => {
    if (stale || submitting || !runtime.online || expiredAwaiting) return;
    setSubmitting(true); setError(""); setNotice(""); setUnknownIntent(null);
    const before = current;
    let failure: unknown = null;
    try {
      if (intent.target === "canceled") await restaurantOrderRepository.cancel(intent.orderId, intent.expectedVersion, intent.reason!, intent.message, intent.operationId);
      else await restaurantOrderRepository.transition(intent.orderId, intent.expectedVersion, intent.target, intent.operationId);
    } catch (caught) {
      failure = caught;
      // Unknown transport and server outcomes are classified only after an
      // authoritative reload. They are never retried automatically.
    }
    const after = await reload();
    if (!after) { setError(copy.unavailable); setSubmitting(false); return; }
    setCurrent(after);
    const result = classifyMutationResult(before, after, intent.target);
    if (result === "success") { discardMutationIntent(intent); setCancelOpen(false); setMessage(""); }
    else if (result === "conflict") { discardMutationIntent(intent); setNotice(copy.conflict); setCancelOpen(false); }
    else if (failure && mutationFailureKind(failure) !== "unknown") { discardMutationIntent(intent); setNotice(mutationFailureKind(failure) === "conflict" ? copy.conflict : copy.unavailable); }
    else { setUnknownIntent(intent); setNotice(copy.unknown); }
    setSubmitting(false);
  }, [copy.conflict, copy.unavailable, copy.unknown, current, expiredAwaiting, reload, runtime.online, stale, submitting]);

  const next = nextOrderStatus(current.status);
  const mutationDisabled = !runtime.online || stale || submitting || expiredAwaiting;
  const transition = () => {
    if (!next) return;
    void execute(getMutationIntent({ orderId: current.id, expectedVersion: current.updated_at, target: next, reason: null, message: "" }));
  };
  const cancel = () => {
    try {
      const normalized = normalizeCancellationMessage(message);
      void execute(getMutationIntent({ orderId: current.id, expectedVersion: current.updated_at, target: "canceled", reason, message: normalized }));
    } catch { setError(locale === "tr" ? "Mesaj en fazla 500 karakter olmalı ve geçersiz kontrol karakteri içermemelidir." : "The message must be at most 500 characters and contain no unsupported control characters."); }
  };

  const address = current.delivery_address_snapshot && typeof current.delivery_address_snapshot === "object"
    ? Object.values(current.delivery_address_snapshot as Record<string, unknown>).filter(value => typeof value === "string" && value.trim()).join(", ") : "";

  return <section ref={acknowledgement.targetRef} className={`order-detail ${compact ? "order-detail--compact" : ""}`} aria-labelledby={`order-${current.id}-title`}>
    <header className="order-detail__header"><div><p className="eyebrow">{locale === "tr" ? "Sipariş" : "Order"}</p>{compact ? <h2 id={`order-${current.id}-title`}>#{orderReference(current.id)}</h2> : <h1 id={`order-${current.id}-title`}>#{orderReference(current.id)}</h1>}</div><span className={`order-status status-${current.status}`}>{statusLabel(current.status, locale)}</span></header>
    {runtime.status !== "connected" && runtime.online && <p className="ui-notice ui-notice--warning" role="status">{locale === "tr" ? "Canlı güncellemeler yeniden bağlanıyor. İşlemler sunucu tarafından doğrulanmaya devam eder." : "Live updates are reconnecting. Actions continue to be verified by the server."}</p>}
    {expiredAwaiting && <p className="ui-notice ui-notice--warning" role="status"><AlertTriangle size={18} aria-hidden /> {copy.expired}</p>}
    {notice && <p className="ui-notice ui-notice--warning" role="status" aria-live="polite">{notice}</p>}
    {error && <p className="danger" role="alert">{error}</p>}
    {acknowledgement.state === "failed" && <Button variant="secondary" onClick={() => void acknowledgement.retry()}>{locale === "tr" ? "Görüldü bilgisini yeniden gönder" : "Retry seen acknowledgement"}</Button>}
    <div className="order-meta">
      <div><span>{copy.placed}</span><strong>{date(current.created_at)}</strong></div>
      <div><span>{copy.deadline}</span><strong>{date(current.approval_deadline_at)}</strong></div>
      <div><span>{copy.payment}</span><strong>{current.payment_method.toUpperCase()}</strong></div>
      {countdown !== null && <div className="order-countdown"><span>{copy.countdown}</span><strong><Clock3 size={17} aria-hidden />{countdown}</strong></div>}
    </div>
    <section className="ui-card order-detail-card"><h2>{copy.items}</h2><div className="order-item-list">{current.items.map(item => {
      const customizations = item.customizations.flatMap(value => customizationLabels(value, locale));
      return <article className="order-line" key={item.id}><div className="order-quantity">{item.quantity}×</div><div><strong>{item.name}</strong>{customizations.length > 0 && <p>{customizations.join(" · ")}</p>}</div><strong>{money(item.quantity * (item.unit_price_kurus + item.customization_total_kurus))}</strong></article>;
    })}</div>
      {current.notes?.trim() && <div className="order-note"><span>{copy.notes}</span><p>{current.notes}</p></div>}
      {(current.customer_name || current.customer_email || current.customer_whatsapp || address) && <div className="order-note"><span>{copy.contact}</span>{current.customer_name && <p>{current.customer_name}</p>}{current.customer_email && <p>{current.customer_email}</p>}{current.customer_whatsapp && <p>{current.customer_whatsapp}</p>}{address && <p>{address}</p>}</div>}
      <dl className="order-totals"><div><dt>{copy.subtotal}</dt><dd>{money(current.subtotal_kurus)}</dd></div>{current.discount_kurus > 0 && <div><dt>{copy.discount}</dt><dd>−{money(current.discount_kurus)}</dd></div>}{current.service_fee_kurus > 0 && <div><dt>{copy.service}</dt><dd>{money(current.service_fee_kurus)}</dd></div>}{current.delivery_fee_kurus > 0 && <div><dt>{copy.delivery}</dt><dd>{money(current.delivery_fee_kurus)}</dd></div>}{current.tip_kurus > 0 && <div><dt>{copy.tip}</dt><dd>{money(current.tip_kurus)}</dd></div>}<div className="order-total"><dt>{copy.total}</dt><dd>{money(current.total_kurus)}</dd></div></dl>
    </section>
    {current.status === "canceled" && current.cancellation_reason_code && <p className="ui-notice ui-notice--warning">{locale === "tr" ? "İptal nedeni" : "Cancellation reason"}: {current.cancellation_reason_code.replaceAll("_", " ")}</p>}
    {unknownIntent && <Button variant="secondary" disabled={mutationDisabled} onClick={() => void execute(unknownIntent)}>{copy.retrySame}</Button>}
    {!unknownIntent && next && <div className="order-actions"><Button disabled={mutationDisabled} onClick={transition}>{copy.continue}: {statusLabel(next, locale)}</Button><Button variant="danger" disabled={mutationDisabled} onClick={() => setCancelOpen(true)}>{copy.cancel}</Button></div>}
    <Dialog open={cancelOpen} title={copy.cancel} onClose={() => { if (!submitting) setCancelOpen(false); }} actions={<><Button variant="secondary" disabled={submitting} onClick={() => setCancelOpen(false)}>{copy.close}</Button><Button variant="danger" disabled={mutationDisabled} onClick={cancel}>{copy.cancel}</Button></>}>
      <p>{copy.cancelHelp}</p><label className="ui-field">{locale === "tr" ? "İptal nedeni" : "Cancellation reason"}<select value={reason} onChange={event => setReason(event.target.value as CancellationReason)}>{CANCELLATION_REASONS.map(value => <option value={value} key={value}>{reasonLabel(value, locale)}</option>)}</select></label><label className="ui-field">{copy.customerMessage}<textarea maxLength={500} value={message} onChange={event => setMessage(event.target.value)} aria-describedby="cancel-message-help" /><small id="cancel-message-help">{message.length}/500</small></label>
    </Dialog>
  </section>;
}

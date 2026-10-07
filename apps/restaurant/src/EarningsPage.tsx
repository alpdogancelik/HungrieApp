import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EarningsPaymentMethodV2, RestaurantEarningsOrdersPageV2, RestaurantEarningsSeriesV2, RestaurantEarningsSummaryV2 } from "@hungrie/domain";
import { Shell } from "./Shell";
import { useLocale } from "./providers";
import { isActiveRestaurantOwner, useRestaurantAccessContext } from "./RestaurantAccessContext";
import { earningsBucketForRange, EarningsPageStack, earningsRangeForPreset, RequestGeneration, validateEarningsRange, type EarningsPreset, type EarningsRange } from "./earningsModel";
import { earningsRepository, EarningsRepositoryError, validateEarningsBundle, validateEarningsPageIdentity } from "./earningsRepository";

const fallbackTimezone = "Asia/Famagusta";
const copy = {
  en: {
    title: "Earnings", subtitle: "Calculated estimated earnings after Hungrie commission from delivered orders.", disclaimerTitle: "Calculated estimate", disclaimer: "These values are not payouts, transfers, settlements, withdrawable balances, invoices, tax calculations, or final accounting profit. Taxes, VAT, refunds, chargebacks, and later adjustments are not included.",
    day: "Daily", week: "Weekly", month: "Monthly", custom: "Custom", from: "From date", to: "To date", apply: "Apply range", timezone: "Reporting timezone", refresh: "Refresh", refreshed: "Last refreshed",
    gross: "Eligible gross sales", commission: "Hungrie commission", virtualCommission: "Estimated Virtual POS commission", deductions: "Total deductions", net: "Estimated Restaurant net", providerPending: "Provider fee not yet reconciled", delivered: "Delivered orders", fixedRate: "Rates fixed when each order was created", collection: "Collection methods", collectionHelp: "Cash and physical POS are collected at the door; online payment remains disabled", cash: "Cash", pos: "POS at door", virtual_pos: "Virtual POS (online)", trend: "Earnings trend", trendHelp: "Authoritative server totals for the selected period", bucket: "Period", orders: "Delivered financial rows", ordersHelp: "No Customer details · immutable financial snapshots only", reference: "Reference", deliveredAt: "Delivered", payment: "Collection", rate: "Rate", previous: "Previous", next: "Next", page: "Page",
    loading: "Loading authoritative earnings…", empty: "No delivered earnings exist in this period.", permission: "Financial access denied", permissionHelp: "Only active Restaurant owners can view earnings in the first release. Managers do not have access.", malformed: "The server returned an unexpected financial response. No values were estimated locally.", validation: "Select an inclusive date range from 1 through 366 days.", service: "Earnings are temporarily unavailable. Try again.", network: "The request did not complete. Check your connection and try again.", offline: "Earnings are unavailable while offline.", offlineHelp: "Reconnect to load authoritative financial data.", stale: "Showing previously loaded authoritative data. It may be stale.", reconnecting: "Connection restored. Refreshing authoritative earnings…",
  },
  tr: {
    title: "Kazançlar", subtitle: "Teslim edilen siparişlerden Hungrie komisyonu sonrası hesaplanan tahmini kazançlar.", disclaimerTitle: "Hesaplanan tahmini değer", disclaimer: "Bu değerler ödeme, aktarım, mutabakat, çekilebilir bakiye, fatura, vergi hesabı veya nihai muhasebe kârı değildir. Vergi, KDV, iade, ters ibraz ve sonraki düzeltmeler dahil değildir.",
    day: "Günlük", week: "Haftalık", month: "Aylık", custom: "Özel aralık", from: "Başlangıç tarihi", to: "Bitiş tarihi", apply: "Aralığı uygula", timezone: "Raporlama saat dilimi", refresh: "Yenile", refreshed: "Son yenileme",
    gross: "Uygun brüt satış", commission: "Hungrie komisyonu", virtualCommission: "Tahmini Sanal POS komisyonu", deductions: "Toplam kesinti", net: "Tahmini Restoran neti", providerPending: "Sağlayıcı ücreti henüz mutabık değil", delivered: "Teslim edilen sipariş", fixedRate: "Her sipariş oluşturulduğunda sabitlenen oranlar", collection: "Tahsilat yöntemleri", collectionHelp: "Nakit ve fiziksel POS kapıda tahsil edilir; çevrimiçi ödeme devre dışıdır", cash: "Nakit", pos: "Kapıda POS", virtual_pos: "Sanal POS (çevrimiçi)", trend: "Kazanç eğilimi", trendHelp: "Seçilen dönem için yetkili sunucu toplamları", bucket: "Dönem", orders: "Teslim edilen finansal satırlar", ordersHelp: "Müşteri bilgisi yok · yalnızca değişmez finansal anlık görüntüler", reference: "Referans", deliveredAt: "Teslim", payment: "Tahsilat", rate: "Oran", previous: "Önceki", next: "Sonraki", page: "Sayfa",
    loading: "Yetkili kazanç verileri yükleniyor…", empty: "Bu dönemde teslim edilmiş kazanç yok.", permission: "Finansal erişim reddedildi", permissionHelp: "İlk sürümde yalnızca aktif Restoran sahipleri kazançları görebilir. Yöneticilerin erişimi yoktur.", malformed: "Sunucu beklenmeyen bir finansal yanıt döndürdü. Yerelde hiçbir değer tahmin edilmedi.", validation: "1 ile 366 gün arasında kapsayıcı bir tarih aralığı seçin.", service: "Kazançlar geçici olarak kullanılamıyor. Tekrar deneyin.", network: "İstek tamamlanmadı. Bağlantınızı kontrol edip tekrar deneyin.", offline: "Çevrimdışıyken kazançlar yüklenemez.", offlineHelp: "Yetkili finansal verileri yüklemek için yeniden bağlanın.", stale: "Daha önce yüklenen yetkili veriler gösteriliyor. Güncel olmayabilir.", reconnecting: "Bağlantı yeniden kuruldu. Yetkili kazançlar yenileniyor…",
  },
} as const;

type Bundle = { summary: RestaurantEarningsSummaryV2; series: RestaurantEarningsSeriesV2 };
const sameRange = (left: EarningsRange, right: EarningsRange) => left.from === right.from && left.to === right.to;
const money = (value: number, locale: "en" | "tr") => new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency: "TRY" }).format(value / 100);
const rate = (value: number, locale: "en" | "tr") => `${Math.floor(value / 100)}${locale === "tr" ? "," : "."}${String(value % 100).padStart(2, "0")}%`;
const localDateTime = (value: string, locale: "en" | "tr", timeZone: string) => new Intl.DateTimeFormat(locale === "tr" ? "tr-CY" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
const localDate = (value: string, locale: "en" | "tr") => new Intl.DateTimeFormat(locale === "tr" ? "tr-CY" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <article className="earnings-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }
function FinancialState({ title, detail, retry }: { title: string; detail?: string; retry?: () => void }) { const { locale } = useLocale(); return <section className="earnings-state" role="status"><h2>{title}</h2>{detail && <p>{detail}</p>}{retry && <button className="button" onClick={retry}>{copy[locale].refresh}</button>}</section>; }

export function EarningsPage() {
  const { locale } = useLocale(), c = copy[locale], access = useRestaurantAccessContext(), owner = isActiveRestaurantOwner(access);
  const initial = useMemo(() => earningsRangeForPreset("month", fallbackTimezone), []);
  const [preset, setPreset] = useState<EarningsPreset>("month"), [range, setRange] = useState(initial), [draft, setDraft] = useState(initial);
  const [bundle, setBundle] = useState<Bundle | null>(null), [page, setPage] = useState<RestaurantEarningsOrdersPageV2 | null>(null);
  const [reportingTimezone, setReportingTimezone] = useState(fallbackTimezone), [loading, setLoading] = useState(true), [paging, setPaging] = useState(false);
  const [error, setError] = useState<"permission" | "malformed" | "validation" | "network" | "service" | null>(null), [stale, setStale] = useState(false), [reconnecting, setReconnecting] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine), [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const generation = useRef(new RequestGeneration()), controller = useRef<AbortController | null>(null), pages = useRef(new EarningsPageStack<RestaurantEarningsOrdersPageV2>()), wasOffline = useRef(!online);

  const messageFor = (value: unknown): "permission" | "malformed" | "validation" | "network" | "service" => value instanceof EarningsRepositoryError ? value.code === "permission_denied" ? "permission" : value.code === "malformed_response" ? "malformed" : value.code === "validation" ? "validation" : value.code === "network" ? "network" : "service" : "service";
  const load = useCallback(async (selectedRange: EarningsRange, selectedPreset: EarningsPreset, zone = reportingTimezone) => {
    if (!owner) { setLoading(false); setError("permission"); return; }
    if (!navigator.onLine) { setLoading(false); setStale(Boolean(bundle)); return; }
    try { validateEarningsRange(selectedRange); } catch { setError("validation"); setLoading(false); return; }
    const token = generation.current.begin(); controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(null);
    try {
      const fetchRange = async (target: EarningsRange) => {
        const selectedBucket = earningsBucketForRange(target);
        const [summary, series, firstPage] = await Promise.all([earningsRepository.summary(target.from, target.to, abort.signal), earningsRepository.series(target.from, target.to, selectedBucket, abort.signal), earningsRepository.page(target.from, target.to, null, abort.signal)]);
        validateEarningsBundle(summary, series, firstPage, { restaurantId: access!.restaurantId, from: target.from, to: target.to, bucket: selectedBucket });
        return { summary, series, firstPage, target };
      };
      let result = await fetchRange(selectedRange);
      if (selectedPreset !== "custom" && result.summary.reportingTimezone !== zone) {
        const adjusted = earningsRangeForPreset(selectedPreset, result.summary.reportingTimezone);
        if (!sameRange(adjusted, selectedRange)) result = await fetchRange(adjusted);
      }
      if (!generation.current.current(token)) return;
      setPreset(selectedPreset); setRange(result.target); setDraft(result.target); setReportingTimezone(result.summary.reportingTimezone); setBundle({ summary: result.summary, series: result.series }); setPage(pages.current.reset(result.firstPage)); setLastRefresh(new Date()); setStale(false); setReconnecting(false);
    } catch (value) {
      if (abort.signal.aborted || !generation.current.current(token)) return;
      setError(messageFor(value)); setStale(Boolean(bundle)); setReconnecting(false);
    } finally { if (generation.current.current(token)) setLoading(false); }
  }, [access, bundle, owner, reportingTimezone]);

  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); controller.current?.abort(); }; }, []);
  useEffect(() => { if (!owner) { controller.current?.abort(); generation.current.begin(); setLoading(false); setError("permission"); return; } if (!online) { controller.current?.abort(); generation.current.begin(); wasOffline.current = true; setLoading(false); setStale(Boolean(bundle)); return; } if (wasOffline.current) { wasOffline.current = false; setReconnecting(true); void load(range, preset); return; } if (!bundle) void load(range, preset); }, [owner, online]);

  const choosePreset = (value: Exclude<EarningsPreset, "custom">) => { if (!online || loading) return; const selected = earningsRangeForPreset(value, reportingTimezone); setDraft(selected); void load(selected, value); };
  const applyCustom = (event: React.FormEvent) => { event.preventDefault(); if (!online || loading) return; try { validateEarningsRange(draft); void load(draft, "custom"); } catch { setError("validation"); } };
  const nextPage = async () => {
    if (!page?.nextCursor || paging || !online || !bundle || !access) return;
    const loaded = pages.current.nextLoaded(); if (loaded) { setPage(loaded); return; }
    const token = generation.current.capture();
    setPaging(true);
    try { const next = await earningsRepository.page(range.from, range.to, page.nextCursor); if (!generation.current.current(token)) return; validateEarningsPageIdentity(next, { restaurantId: access.restaurantId, from: range.from, to: range.to, reportingTimezone }); setPage(pages.current.push(next)); }
    catch (value) { setError(messageFor(value)); setStale(true); }
    finally { setPaging(false); }
  };
  const previousPage = () => { const previous = pages.current.previous(); if (previous) setPage(previous); };

  if (!owner) return <Shell><div className="earnings-page"><FinancialState title={c.permission} detail={c.permissionHelp} /></div></Shell>;
  const hasData = Boolean(bundle && page), empty = bundle?.summary.deliveredOrderCount === 0;
  return <Shell><div className="earnings-page">
    <header className="earnings-header"><div><p className="eyebrow">Hungrie</p><h1>{c.title}</h1><p>{c.subtitle}</p></div><button onClick={() => void load(range, preset)} disabled={!online || loading}>{c.refresh}</button></header>
    <aside className="earnings-disclaimer" aria-label={c.disclaimerTitle}><strong>{c.disclaimerTitle}</strong><p>{c.disclaimer}</p></aside>
    <section className="earnings-controls" aria-label={c.title}><div className="period-tabs" role="group" aria-label={c.title}>{(["day", "week", "month"] as const).map((value) => <button key={value} aria-pressed={preset === value} disabled={!online || loading} onClick={() => choosePreset(value)}>{c[value]}</button>)}<button aria-pressed={preset === "custom"} disabled={!online || loading} onClick={() => setPreset("custom")}>{c.custom}</button></div>{preset === "custom" && <form className="custom-range" onSubmit={applyCustom}><label>{c.from}<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} disabled={!online || loading} /></label><label>{c.to}<input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} disabled={!online || loading} /></label><button className="button" disabled={!online || loading}>{c.apply}</button></form>}<p className="range-meta"><span>{range.from} – {range.to}</span><span>{c.timezone}: <code>{reportingTimezone}</code></span>{lastRefresh && <span>{c.refreshed}: {localDateTime(lastRefresh.toISOString(), locale, reportingTimezone)}</span>}</p></section>
    {!online && !hasData && <FinancialState title={c.offline} detail={c.offlineHelp} />}{reconnecting && <p className="earnings-notice" role="status">{c.reconnecting}</p>}{stale && hasData && <p className="earnings-warning" role="alert">{c.stale}</p>}
    {error && !hasData && <FinancialState title={c[error]} detail={error === "permission" ? c.permissionHelp : undefined} retry={online && error !== "permission" ? () => void load(range, preset) : undefined} />}
    {error && hasData && <p className="earnings-warning" role="alert">{c[error]}</p>}{online && loading && !hasData && <FinancialState title={c.loading} />}{!loading && hasData && empty && <FinancialState title={c.empty} />}
    {hasData && !empty && bundle && page && <>
      <section className="earnings-metrics" aria-label={c.title}><Metric label={c.gross} value={money(bundle.summary.eligibleGrossKurus, locale)} /><Metric label={c.commission} value={`−${money(bundle.summary.hungrieCommissionKurus, locale)}`} detail={c.fixedRate} /><Metric label={c.virtualCommission} value={`−${money(bundle.summary.virtualPosCommissionKurus, locale)}`} detail={c.providerPending} /><Metric label={c.deductions} value={`−${money(bundle.summary.totalDeductionsKurus, locale)}`} /><Metric label={c.net} value={money(bundle.summary.estimatedNetKurus, locale)} /><Metric label={c.delivered} value={String(bundle.summary.deliveredOrderCount)} /></section>
      <div className="earnings-columns"><section className="earnings-card"><h2>{c.trend}</h2><p>{c.trendHelp}</p><div className="trend-list" role="list">{bundle.series.points.map((point) => <div role="listitem" className="trend-row" key={point.bucketStart}><span>{localDate(point.bucketStart, locale)}</span><progress max={bundle.summary.estimatedNetKurus || 1} value={point.estimatedNetKurus} aria-label={`${localDate(point.bucketStart, locale)} ${money(point.estimatedNetKurus, locale)}`} /><strong>{money(point.estimatedNetKurus, locale)}</strong><small>{point.deliveredOrderCount} {c.delivered.toLocaleLowerCase()}</small></div>)}</div></section>
        <section className="earnings-card"><h2>{c.collection}</h2><p>{c.collectionHelp}</p>{(["cash", "pos", "virtual_pos"] as EarningsPaymentMethodV2[]).map((payment) => { const item = bundle.summary.paymentBreakdown[payment]; return <dl className="collection-row" key={payment}><div><dt>{c[payment]}</dt><dd>{money(item.eligibleGrossKurus, locale)}</dd></div><div><dt>{c.commission}</dt><dd>−{money(item.hungrieCommissionKurus, locale)}</dd></div><div><dt>{c.virtualCommission}</dt><dd>−{money(item.virtualPosCommissionKurus, locale)}</dd></div><div><dt>{c.net}</dt><dd>{money(item.estimatedNetKurus, locale)}</dd></div><div><dt>{c.delivered}</dt><dd>{item.deliveredOrderCount}</dd></div>{payment === "virtual_pos" && <div><dt>{c.providerPending}</dt><dd>—</dd></div>}</dl>; })}</section></div>
      <section className="earnings-card order-financials"><header><div><h2>{c.orders}</h2><p>{c.ordersHelp}</p></div><span>{c.page} {pages.current.pageNumber()}</span></header><div className="financial-table"><table><thead><tr><th>{c.reference}</th><th>{c.deliveredAt}</th><th>{c.payment}</th><th>{c.gross}</th><th>{c.deductions}</th><th>{c.net}</th></tr></thead><tbody>{page.items.map((item) => <tr key={`${item.deliveredAt}-${item.orderReference}`}><td data-label={c.reference}><code>#{item.orderReference}</code></td><td data-label={c.deliveredAt}>{localDateTime(item.deliveredAt, locale, reportingTimezone)}</td><td data-label={c.payment}>{c[item.paymentMethod]}</td><td data-label={c.gross}>{money(item.eligibleGrossKurus, locale)}</td><td data-label={c.deductions}>−{money(item.totalDeductionsKurus, locale)} <small>{c.commission} {rate(item.hungrieRateBps, locale)}{item.paymentMethod === "virtual_pos" ? ` · ${c.virtualCommission} ${rate(item.virtualPosRateBps, locale)}` : ""}</small></td><td data-label={c.net}><strong>{money(item.estimatedNetKurus, locale)}</strong>{item.paymentMethod === "virtual_pos" && <small>{c.providerPending}</small>}</td></tr>)}</tbody></table></div><footer className="earnings-pagination"><button disabled={pages.current.pageNumber() <= 1 || paging} onClick={previousPage}>{c.previous}</button><span>{c.page} {pages.current.pageNumber()}</span><button disabled={!page.nextCursor || paging || !online} onClick={() => void nextPage()}>{c.next}</button></footer></section>
    </>}
  </div></Shell>;
}

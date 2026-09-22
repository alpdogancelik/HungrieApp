"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccessContext, AdminRestaurantCommissionV1, RestaurantCommissionRuleV1, RestaurantFinancialWarningV1 } from "@hungrie/domain";
import { auth } from "@/lib/firebase";
import { commissionRepository, CommissionRepositoryError, type AdminRestaurantDetail } from "@/lib/commissionRepository";
import { CommissionValidationError, formatBasisPoints, isRecentAuthentication, parsePercentageToBasisPoints, restaurantLocalToUtc, schedulingAccess, StableCommissionOperation, validateCommissionReason, type CommissionDraft } from "@/lib/commissionManagementModel";
import { useLocale } from "./AdminProviders";

const copy = {
  en: {
    back: "Back to Restaurants", loading: "Loading Restaurant commission data…", retry: "Retry", malformed: "The server returned an unexpected response. Scheduling is disabled for safety.", service: "Commission services are temporarily unavailable.", network: "The network request did not complete. Your operation ID has been preserved for a safe retry.",
    details: "Restaurant details", lifecycle: "Lifecycle", accepting: "Order acceptance", acceptingYes: "Accepting orders", acceptingNo: "Not accepting orders", cuisine: "Cuisine", address: "Address", language: "Preferred language", delivery: "Delivery", fees: "Delivery fee / minimum", accounts: "Restaurant accounts", owner: "Owner", manager: "Manager",
    commission: "Commission management", configurationOnly: "This configures commission rules. It is not a payout, settlement, accounting-profit, or withdrawable-balance system.", nonRetro: "New rules affect only qualifying new orders. Existing orders keep their snapshotted commission terms, and later changes never recalculate historical orders.",
    capability: "Earnings capability", enabled: "Enabled", disabled: "Disabled locally", disabledHelp: "While disabled, legacy uncovered orders remain possible. Activation is blocked until every accepting Restaurant has current coverage.", timezone: "Reporting timezone", current: "Current applicable rule", nextRule: "Next scheduled rule", noCurrent: "No rule is currently applicable", noRule: "No current or future rule exists.", futureOnly: "A future rule exists, but it provides no coverage before its effective time.", enabledGap: "With the capability enabled, uncovered order creation fails closed and order acceptance cannot be enabled.",
    rate: "Commission rate", effective: "Effective", created: "Created", reason: "Reason", version: "Contract version", history: "Append-only history", noHistory: "No commission rules have been recorded.", moreHistory: "Older history exists. This contract exposes the latest 100 records.", currentBadge: "Current", scheduledBadge: "Scheduled", supersededBadge: "Superseded",
    pending: "Pending Restaurant", pendingHelp: "This Restaurant is not operational yet. Commission rules may be prepared before activation.", suspended: "Suspended Restaurant", suspendedHelp: "This Restaurant is not operational while suspended. Commission rules may still be prepared.", closed: "Closed Restaurant", closedHelp: "Closed Restaurants are read-only and cannot receive new commission rules.",
    warnings: "Financial integrity warnings", warningHelp: "These references contain no Customer or order PII.", missing_applicable_rule: "Missing applicable commission rule", missing_order_terms: "Missing immutable order terms", missing_delivered_snapshot: "Missing delivered financial snapshot", snapshot_mismatch: "Financial snapshot mismatch", detected: "Last detected", occurrences: "Occurrences", orderRef: "Order reference",
    schedule: "Schedule a commission rule", readOnly: "Your Admin role has read-only commission access.", unauthorized: "Scheduling is unavailable because the current access context is not an active, MFA-verified Admin context.", percentHelp: "Enter 0–100 with at most two decimal places.", localTime: "Effective Restaurant-local date and time", localHelp: "Interpreted in", utcPreview: "Exact UTC", reasonHelp: "Required; 1–500 characters after trimming.", review: "Review rule", validationRate: "Enter a valid percentage from 0 to 100 with at most two decimals.", validationReason: "Enter a reason between 1 and 500 characters.", validationTime: "Enter a valid local date and time.", nonexistentTime: "That local time does not exist because of a daylight-saving transition.", ambiguousTime: "That local time occurs twice. Choose an unambiguous time.",
    confirmTitle: "Confirm commission rule", prior: "Prior/current rate", none: "None", newRate: "New rate", localEffective: "Restaurant-local effective time", utcEffective: "UTC effective time", cancel: "Cancel", confirm: "Confirm and schedule", scheduling: "Scheduling…", confirmWarning: "This append-only rule cannot be edited and will not recalculate existing orders.",
    createdSuccess: "The commission rule was created and authoritative data was refreshed.", replaySuccess: "The server confirmed this exact operation was already completed. Authoritative data was refreshed.", recent: "Recent authentication is required. Sign out and sign in again with your authenticator.", reauthenticate: "Sign out and re-authenticate", permission: "The server denied this scheduling operation.", conflict: "This operation ID was used for different inputs. Review the form and try again.", duplicate: "A rule already exists at that exact effective time.", retroactive: "That effective time would change the rule selected for an existing order and cannot be used.", genericValidation: "The server rejected the scheduling input.",
  },
  tr: {
    back: "Restoranlara dön", loading: "Restoran komisyon verileri yükleniyor…", retry: "Tekrar dene", malformed: "Sunucu beklenmeyen bir yanıt döndürdü. Güvenlik için planlama devre dışı bırakıldı.", service: "Komisyon hizmetlerine geçici olarak ulaşılamıyor.", network: "Ağ isteği tamamlanmadı. Güvenli tekrar deneme için işlem kimliğiniz korundu.",
    details: "Restoran bilgileri", lifecycle: "Yaşam döngüsü", accepting: "Sipariş kabulü", acceptingYes: "Sipariş kabul ediyor", acceptingNo: "Sipariş kabul etmiyor", cuisine: "Mutfak", address: "Adres", language: "Tercih edilen dil", delivery: "Teslimat", fees: "Teslimat ücreti / minimum", accounts: "Restoran hesapları", owner: "Sahip", manager: "Yönetici",
    commission: "Komisyon yönetimi", configurationOnly: "Bu ekran komisyon kurallarını yapılandırır. Ödeme, mutabakat, muhasebe kârı veya çekilebilir bakiye sistemi değildir.", nonRetro: "Yeni kurallar yalnızca uygun yeni siparişleri etkiler. Mevcut siparişler anlık görüntülenmiş komisyon koşullarını korur; sonraki değişiklikler geçmiş siparişleri yeniden hesaplamaz.",
    capability: "Kazanç özelliği", enabled: "Etkin", disabled: "Yerelde devre dışı", disabledHelp: "Devre dışıyken kuralsız eski sipariş davranışı devam edebilir. Sipariş kabul eden her Restoran güncel kapsama sahip olmadan özellik etkinleştirilemez.", timezone: "Raporlama saat dilimi", current: "Geçerli mevcut kural", nextRule: "Sonraki planlı kural", noCurrent: "Şu anda geçerli bir kural yok", noRule: "Mevcut veya gelecekte planlı bir kural yok.", futureOnly: "Gelecekte bir kural var ancak yürürlük zamanından önce kapsama sağlamaz.", enabledGap: "Özellik etkinken kuralsız sipariş oluşturma kapalı şekilde başarısız olur ve sipariş kabulü etkinleştirilemez.",
    rate: "Komisyon oranı", effective: "Yürürlük", created: "Oluşturulma", reason: "Neden", version: "Sözleşme sürümü", history: "Yalnızca eklenen geçmiş", noHistory: "Henüz komisyon kuralı kaydedilmedi.", moreHistory: "Daha eski geçmiş var. Bu sözleşme son 100 kaydı sunar.", currentBadge: "Mevcut", scheduledBadge: "Planlı", supersededBadge: "Geçmiş",
    pending: "Bekleyen Restoran", pendingHelp: "Bu Restoran henüz operasyonel değil. Etkinleştirmeden önce komisyon kuralları hazırlanabilir.", suspended: "Askıya alınmış Restoran", suspendedHelp: "Bu Restoran askıdayken operasyonel değildir. Komisyon kuralları yine de hazırlanabilir.", closed: "Kapalı Restoran", closedHelp: "Kapalı Restoranlar salt okunurdur ve yeni komisyon kuralı alamaz.",
    warnings: "Finansal bütünlük uyarıları", warningHelp: "Bu referanslar Müşteri veya sipariş kişisel verisi içermez.", missing_applicable_rule: "Geçerli komisyon kuralı eksik", missing_order_terms: "Değişmez sipariş koşulları eksik", missing_delivered_snapshot: "Teslim edilen finansal anlık görüntü eksik", snapshot_mismatch: "Finansal anlık görüntü uyuşmazlığı", detected: "Son tespit", occurrences: "Tekrar", orderRef: "Sipariş referansı",
    schedule: "Komisyon kuralı planla", readOnly: "Yönetici rolünüz komisyonları salt okunur olarak inceleyebilir.", unauthorized: "Mevcut erişim bağlamı etkin ve MFA doğrulanmış bir Yönetici olmadığı için planlama kullanılamıyor.", percentHelp: "En fazla iki ondalıkla 0–100 arası girin.", localTime: "Restoran yerel yürürlük tarihi ve saati", localHelp: "Şu saat diliminde yorumlanır:", utcPreview: "Kesin UTC", reasonHelp: "Zorunlu; kırpıldıktan sonra 1–500 karakter.", review: "Kuralı incele", validationRate: "En fazla iki ondalıkla 0–100 arası geçerli bir yüzde girin.", validationReason: "1–500 karakter arasında bir neden girin.", validationTime: "Geçerli bir yerel tarih ve saat girin.", nonexistentTime: "Bu yerel saat yaz saati geçişi nedeniyle mevcut değil.", ambiguousTime: "Bu yerel saat iki kez oluşuyor. Belirsiz olmayan bir saat seçin.",
    confirmTitle: "Komisyon kuralını onayla", prior: "Önceki/mevcut oran", none: "Yok", newRate: "Yeni oran", localEffective: "Restoran yerel yürürlük zamanı", utcEffective: "UTC yürürlük zamanı", cancel: "İptal", confirm: "Onayla ve planla", scheduling: "Planlanıyor…", confirmWarning: "Bu yalnızca eklenen kural düzenlenemez ve mevcut siparişleri yeniden hesaplamaz.",
    createdSuccess: "Komisyon kuralı oluşturuldu ve yetkili veriler yenilendi.", replaySuccess: "Sunucu bu işlemin daha önce tamamlandığını doğruladı. Yetkili veriler yenilendi.", recent: "Yakın tarihli kimlik doğrulaması gerekli. Çıkış yapıp kimlik doğrulayıcınızla tekrar giriş yapın.", reauthenticate: "Çıkış yap ve yeniden doğrula", permission: "Sunucu bu planlama işlemini reddetti.", conflict: "Bu işlem kimliği farklı girdilerle kullanılmış. Formu inceleyip tekrar deneyin.", duplicate: "Tam olarak bu yürürlük zamanında zaten bir kural var.", retroactive: "Bu yürürlük zamanı mevcut bir sipariş için seçilen kuralı değiştirir ve kullanılamaz.", genericValidation: "Sunucu planlama girdisini reddetti.",
  },
} as const;

type DraftForConfirmation = CommissionDraft & { operationId: string; localValue: string };

const formatDate = (value: string, locale: "en" | "tr", timeZone: string) => new Intl.DateTimeFormat(locale === "tr" ? "tr-CY" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
const formatTry = (kurus: number, locale: "en" | "tr") => new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency: "TRY" }).format(kurus / 100);

function RuleCard({ rule, locale, timeZone, label }: { rule: RestaurantCommissionRuleV1; locale: "en" | "tr"; timeZone: string; label: string }) {
  const c = copy[locale];
  return <article className="commission-rule-card"><span className="status-pill">{label}</span><strong>{formatBasisPoints(rule.rateBps, locale)}</strong><dl><div><dt>{c.effective}</dt><dd>{formatDate(rule.effectiveFrom, locale, timeZone)}</dd></div><div><dt>{c.created}</dt><dd>{formatDate(rule.createdAt, locale, timeZone)}</dd></div><div><dt>{c.version}</dt><dd>v{rule.contractVersion}</dd></div><div><dt>{c.reason}</dt><dd className="long-copy">{rule.reason}</dd></div></dl></article>;
}

function WarningCard({ warning, locale, timeZone }: { warning: RestaurantFinancialWarningV1; locale: "en" | "tr"; timeZone: string }) {
  const c = copy[locale];
  return <li><strong>{c[warning.type]}</strong><span>{c.detected}: {formatDate(warning.lastDetectedAt, locale, timeZone)}</span><span>{c.occurrences}: {warning.occurrenceCount}</span>{warning.details.orderReference && <code>{c.orderRef}: {warning.details.orderReference}</code>}</li>;
}

function ConfirmationDialog({ draft, current, locale, timeZone, busy, onCancel, onConfirm }: { draft: DraftForConfirmation; current: RestaurantCommissionRuleV1 | null; locale: "en" | "tr"; timeZone: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const c = copy[locale];
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); opener?.focus(); };
  }, [busy, onCancel]);
  return <div className="dialog-backdrop"><div ref={panel} className="commission-dialog" role="dialog" aria-modal="true" aria-labelledby="commission-dialog-title" aria-describedby="commission-dialog-description"><h3 id="commission-dialog-title">{c.confirmTitle}</h3><p id="commission-dialog-description" className="notice warning">{c.confirmWarning}</p><dl><div><dt>{c.prior}</dt><dd>{current ? formatBasisPoints(current.rateBps, locale) : c.none}</dd></div><div><dt>{c.newRate}</dt><dd>{formatBasisPoints(draft.rateBps, locale)}</dd></div><div><dt>{c.localEffective}</dt><dd>{formatDate(draft.effectiveFromUtc, locale, timeZone)} ({timeZone})</dd></div><div><dt>{c.utcEffective}</dt><dd><code>{draft.effectiveFromUtc}</code></dd></div><div><dt>{c.reason}</dt><dd className="long-copy">{draft.reason}</dd></div></dl><div className="dialog-actions"><button ref={cancel} type="button" disabled={busy} onClick={onCancel}>{c.cancel}</button><button className="primary" type="button" disabled={busy} onClick={onConfirm}>{busy ? c.scheduling : c.confirm}</button></div></div></div>;
}

export function AdminRestaurantCommissionPage({ restaurantId }: { restaurantId: string }) {
  const { locale } = useLocale(); const c = copy[locale];
  const [restaurant, setRestaurant] = useState<AdminRestaurantDetail | null>(null);
  const [context, setContext] = useState<AccessContext | null>(null);
  const [commission, setCommission] = useState<AdminRestaurantCommissionV1 | null>(null);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<"malformed" | "service" | "network" | "permission" | null>(null);
  const [rate, setRate] = useState(""); const [localTime, setLocalTime] = useState(""); const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState(""); const [message, setMessage] = useState(""); const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const [confirmation, setConfirmation] = useState<DraftForConfirmation | null>(null); const [busy, setBusy] = useState(false);
  const operations = useRef(new StableCommissionOperation());

  const classifyLoad = (value: unknown) => value instanceof CommissionRepositoryError && value.code === "malformed_response" ? "malformed" : value instanceof CommissionRepositoryError && value.code === "network" ? "network" : value instanceof CommissionRepositoryError && (value.code === "permission_denied" || value.code === "session_expired") ? "permission" : "service";
  const load = useCallback(async () => { setLoading(true); setLoadError(null); try { const [nextRestaurant, nextContext, nextCommission] = await Promise.all([commissionRepository.getRestaurant(restaurantId), commissionRepository.getAccessContext(), commissionRepository.getCommission(restaurantId)]); setRestaurant(nextRestaurant); setContext(nextContext); setCommission(nextCommission); } catch (value) { setLoadError(classifyLoad(value)); } finally { setLoading(false); } }, [restaurantId]);
  useEffect(() => { void load(); }, [load]);
  const access = useMemo(() => restaurant ? schedulingAccess(context, restaurant.lifecycleStatus) : "unauthorized", [context, restaurant]);
  const timezone = commission?.reportingTimezone || "UTC";

  const validateDraft = (): CommissionDraft & { localValue: string } => {
    try { const rateBps = parsePercentageToBasisPoints(rate); const normalizedReason = validateCommissionReason(reason); const effectiveFromUtc = restaurantLocalToUtc(localTime, timezone); setFieldError(""); return { restaurantId, rateBps, effectiveFromUtc, reason: normalizedReason, localValue: localTime }; }
    catch (value) { if (value instanceof CommissionValidationError) setFieldError(value.field === "rate" ? c.validationRate : value.field === "reason" ? c.validationReason : value.kind === "nonexistent" ? c.nonexistentTime : value.kind === "ambiguous" ? c.ambiguousTime : c.validationTime); else setFieldError(c.validationTime); throw value; }
  };
  const reviewDraft = (event: React.FormEvent) => { event.preventDefault(); if (access !== "allowed") return; try { const draft = validateDraft(); setConfirmation({ ...draft, operationId: operations.current.prepare(draft) }); setMessage(""); } catch { /* field error is visible */ } };
  const schedule = async () => {
    if (!confirmation || busy || access !== "allowed") return;
    let token;
    try { token = await auth.currentUser?.getIdTokenResult(); }
    catch { setMessageKind("error"); setMessage(c.network); setConfirmation(null); return; }
    if (!isRecentAuthentication(token?.authTime ? Date.parse(token.authTime) / 1000 : undefined)) { setConfirmation(null); setMessageKind("error"); setMessage(c.recent); return; }
    setBusy(true); setMessage("");
    try {
      const result = await commissionRepository.schedule({ restaurantId, rateBps: confirmation.rateBps, effectiveFrom: confirmation.effectiveFromUtc, reason: confirmation.reason, operationId: confirmation.operationId });
      const refreshed = await commissionRepository.getCommission(restaurantId);
      setCommission(refreshed); setMessageKind("success"); setMessage(result.replayed ? c.replaySuccess : c.createdSuccess); operations.current.clear(); setConfirmation(null); setRate(""); setLocalTime(""); setReason("");
    } catch (value) {
      const code = value instanceof CommissionRepositoryError ? value.code : "unknown";
      setMessageKind("error"); setMessage(code === "recent_auth_required" ? c.recent : code === "permission_denied" || code === "session_expired" ? c.permission : code === "operation_conflict" ? c.conflict : code === "duplicate_effective_time" ? c.duplicate : code === "retroactive_rule" ? c.retroactive : code === "validation" ? c.genericValidation : code === "network" ? c.network : code === "malformed_response" ? c.malformed : c.service);
      setConfirmation(null);
    } finally { setBusy(false); }
  };

  if (loading) return <section className="commission-page" aria-busy="true"><p role="status">{c.loading}</p></section>;
  if (loadError || !restaurant || !commission) return <section className="commission-page"><p className="error" role="alert">{loadError === "malformed" ? c.malformed : loadError === "network" ? c.network : loadError === "permission" ? c.permission : c.service}</p><button onClick={() => void load()}>{c.retry}</button></section>;
  const futureWithoutCurrent = !commission.currentRule && !!commission.nextScheduledRule;
  return <section className="commission-page">
    <Link className="back-link" href="/restaurants">← {c.back}</Link>
    <header className="page-header"><div><p className="eyebrow">Hungrie</p><h2>{restaurant.name}</h2><code>{restaurant.id}</code></div><span className={`status-pill lifecycle-${restaurant.lifecycleStatus}`}>{restaurant.lifecycleStatus}</span></header>
    {restaurant.lifecycleStatus !== "active" && <div className="notice business-state" role="status"><strong>{c[restaurant.lifecycleStatus]}</strong><p>{c[`${restaurant.lifecycleStatus}Help` as "pendingHelp" | "suspendedHelp" | "closedHelp"]}</p></div>}
    <div className="detail-grid"><article className="panel"><h3>{c.details}</h3><dl className="metadata"><div><dt>{c.lifecycle}</dt><dd>{restaurant.lifecycleStatus}</dd></div><div><dt>{c.accepting}</dt><dd>{restaurant.acceptingOrders ? c.acceptingYes : c.acceptingNo}</dd></div><div><dt>{c.cuisine}</dt><dd>{restaurant.cuisine || "—"}</dd></div><div><dt>{c.address}</dt><dd className="long-copy">{restaurant.address || "—"}</dd></div><div><dt>{c.language}</dt><dd>{restaurant.preferredLanguage.toUpperCase()}</dd></div><div><dt>{c.delivery}</dt><dd>{restaurant.deliveryEtaMinMinutes ?? "—"}–{restaurant.deliveryEtaMaxMinutes ?? "—"} min</dd></div><div><dt>{c.fees}</dt><dd>{formatTry(restaurant.deliveryFeeKurus, locale)} / {formatTry(restaurant.minimumOrderKurus, locale)}</dd></div></dl><h4>{c.accounts}</h4><ul className="account-list">{restaurant.accounts.map((account) => <li key={account.profileId}><strong>{account.name}</strong><span>{account.role === "owner" ? c.owner : c.manager} · {account.status}</span>{account.maskedEmail && <span>{account.maskedEmail}</span>}</li>)}</ul></article>
      <article className="panel commission-overview"><h3>{c.commission}</h3><p>{c.configurationOnly}</p><p className="immutable">{c.nonRetro}</p><dl className="metadata"><div><dt>{c.capability}</dt><dd><span className={`status-pill ${commission.capabilityEnabled ? "status-ok" : "status-muted"}`}>{commission.capabilityEnabled ? c.enabled : c.disabled}</span></dd></div><div><dt>{c.timezone}</dt><dd><code>{commission.reportingTimezone}</code></dd></div></dl>{!commission.capabilityEnabled && <p className="notice">{c.disabledHelp}</p>}</article></div>
    <div className="commission-rule-grid"><section><h3>{c.current}</h3>{commission.currentRule ? <RuleCard rule={commission.currentRule} locale={locale} timeZone={timezone} label={c.currentBadge} /> : <div className="empty-state"><strong>{c.noCurrent}</strong><p>{futureWithoutCurrent ? c.futureOnly : c.noRule}</p>{commission.capabilityEnabled && <p>{c.enabledGap}</p>}</div>}</section><section><h3>{c.nextRule}</h3>{commission.nextScheduledRule ? <RuleCard rule={commission.nextScheduledRule} locale={locale} timeZone={timezone} label={c.scheduledBadge} /> : <div className="empty-state">{c.none}</div>}</section></div>
    {commission.warnings.length > 0 && <section className="financial-warnings" aria-labelledby="warnings-title"><h3 id="warnings-title">{c.warnings}</h3><p>{c.warningHelp}</p><ul>{commission.warnings.map((warning) => <WarningCard key={warning.id} warning={warning} locale={locale} timeZone={timezone} />)}</ul></section>}
    <section className="panel schedule-panel"><h3>{c.schedule}</h3>{access === "allowed" ? <form onSubmit={reviewDraft} noValidate><label>{c.rate}<input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" autoComplete="off" aria-describedby="rate-help" /></label><small id="rate-help">{c.percentHelp}</small><label>{c.localTime}<input type="datetime-local" value={localTime} onChange={(event) => setLocalTime(event.target.value)} aria-describedby="time-help" /></label><small id="time-help">{c.localHelp} <code>{timezone}</code></small><label>{c.reason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={520} aria-describedby="reason-help" /></label><small id="reason-help">{c.reasonHelp}</small>{fieldError && <p className="error" role="alert">{fieldError}</p>}<button className="primary" type="submit">{c.review}</button></form> : <p className="notice" role="status">{access === "read_only" ? c.readOnly : access === "lifecycle_restricted" ? c.closedHelp : c.unauthorized}</p>}
      {message && <div className={messageKind === "success" ? "success-message" : "error"} role={messageKind === "success" ? "status" : "alert"}><p>{message}</p>{message === c.recent && <button type="button" onClick={() => void signOut(auth)}>{c.reauthenticate}</button>}</div>}
    </section>
    <section className="history-section"><h3>{c.history}</h3>{commission.history.length ? <ol className="commission-history">{commission.history.map((rule) => { const label = rule.id === commission.currentRule?.id ? c.currentBadge : (!commission.currentRule || rule.effectiveFrom > commission.currentRule.effectiveFrom) ? c.scheduledBadge : c.supersededBadge; return <li key={rule.id}><RuleCard rule={rule} locale={locale} timeZone={timezone} label={label} /></li>; })}</ol> : <p className="empty-state">{c.noHistory}</p>}{commission.historyHasMore && <p className="notice">{c.moreHistory}</p>}</section>
    {confirmation && <ConfirmationDialog draft={confirmation} current={commission.currentRule} locale={locale} timeZone={timezone} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void schedule()} />}
  </section>;
}

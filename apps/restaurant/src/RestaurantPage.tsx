import { Image as ImageIcon, RefreshCw, Save, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "./Shell";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { FormField, TextAreaField } from "./components/FormField";
import { PageHeader } from "./components/PageHeader";
import { Toggle } from "./components/Toggle";
import { formatKurusInput, parseKurus, type RestaurantSettings } from "./managementContract";
import { buildRestaurantSettingsChanges, completeManagementIntent, normalizeRestaurantSettingsForm, stableManagementOperationId, type RestaurantSettingsForm } from "./managementModel";
import { restaurantManagementRepository } from "./managementRepository";
import { useDirtyGuard } from "./useDirtyGuard";
import { useLocale } from "./providers";
import { useRestaurantAcceptance } from "./useRestaurantAcceptance";

type Form = RestaurantSettingsForm;
function toForm(value: RestaurantSettings): Form { return { name: value.name, description: value.description, cuisine: value.cuisine, address: value.address, phone: value.phone || "", imageUrl: value.imageUrl || "", preferredLanguage: value.preferredLanguage, deliveryEtaMinMinutes: value.deliveryEtaMinMinutes === null ? "" : String(value.deliveryEtaMinMinutes), deliveryEtaMaxMinutes: value.deliveryEtaMaxMinutes === null ? "" : String(value.deliveryEtaMaxMinutes), minimumOrder: formatKurusInput(value.minimumOrderKurus) }; }
function normalize(value: Form) { return JSON.stringify(normalizeRestaurantSettingsForm(value)); }

export function RestaurantPage() {
  const { locale, t } = useLocale(), acceptance = useRestaurantAcceptance();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null), [form, setForm] = useState<Form | null>(null), [baseline, setBaseline] = useState(""), [loading, setLoading] = useState(true), [stale, setStale] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const generation = useRef(0), abort = useRef<AbortController | null>(null), hasSettings = useRef(false); hasSettings.current = Boolean(settings);
  const dirty = Boolean(form && baseline && normalize(form) !== baseline), guard = useDirtyGuard(dirty);
  const c = locale === "tr" ? { subtitle: "Müşterilerin gördüğü Restoran bilgilerini yönetin.", info: "Restoran bilgileri", operations: "Operasyon ayarları", lifecycle: "Yaşam döngüsü", etaMin: "Minimum teslimat süresi (dakika)", etaMax: "Maksimum teslimat süresi (dakika)", minimum: "Minimum sipariş", image: "Görsel URL", imageHint: "Bu aşamada yalnızca mevcut URL sözleşmesi desteklenir.", stale: "Önceki Restoran ayarları gösteriliyor.", failed: "Restoran ayarları yenilenemedi.", invalid: "Alanları kontrol edin. Teslimat aralığı ve minimum sipariş geçerli olmalıdır.", noChanges: "Kaydedilecek bir değişiklik yok.", saved: "Ayarlar kaydedildi.", discard: "Değişiklikler silinsin mi?", discardBody: "Kaydedilmemiş Restoran ayarları kaybolacak.", keep: "Düzenlemeye devam et", remove: "Sil", open: "Restoran sipariş alıyor", closed: "Restoran sipariş almıyor" } : { subtitle: "Manage the Restaurant information Customers can see.", info: "Restaurant information", operations: "Operational settings", lifecycle: "Lifecycle", etaMin: "Minimum delivery time (minutes)", etaMax: "Maximum delivery time (minutes)", minimum: "Minimum order", image: "Image URL", imageHint: "Only the existing URL contract is supported in this phase.", stale: "The previous Restaurant settings are shown.", failed: "Restaurant settings could not be refreshed.", invalid: "Check the fields. The delivery range and minimum order must be valid.", noChanges: "There are no changes to save.", saved: "Settings saved.", discard: "Discard changes?", discardBody: "Unsaved Restaurant settings will be lost.", keep: "Keep editing", remove: "Discard", open: "Restaurant is accepting orders", closed: "Restaurant is not accepting orders" };
  const load = useCallback(async () => {
    const request = ++generation.current; abort.current?.abort(); const controller = new AbortController(); abort.current = controller; setLoading(true); setError("");
    try { const value = await restaurantManagementRepository.getSettings(controller.signal); if (request !== generation.current) return null; const next = toForm(value); setSettings(value); setForm(next); setBaseline(normalize(next)); setStale(false); return value; }
    catch { if (request === generation.current && !controller.signal.aborted) { setError(c.failed); setStale(hasSettings.current); } return null; }
    finally { if (request === generation.current) setLoading(false); }
  }, [c.failed]);
  useEffect(() => { void load(); return () => { generation.current += 1; abort.current?.abort(); }; }, [load]);
  const changes = useMemo(() => form && settings ? buildRestaurantSettingsChanges(toForm(settings), form) : {}, [form, settings]);
  function set<K extends keyof Form>(key: K, value: Form[K]) { setSaved(false); setForm(current => current ? { ...current, [key]: value } : current); }
  function payload() {
    if (!form || !settings) return null;
    return changes;
  }
  async function save() {
    if (saving || !form) return; const next = payload(); if (!next) { setError(c.invalid); return; } if (!Object.keys(next).length) { setError(""); setSaved(true); return; }
    const attemptedForm = form;
    const key = `settings:${JSON.stringify(next)}`, operationId = stableManagementOperationId(key); setSaving(true); setError(""); setSaved(false);
    try { const value = await restaurantManagementRepository.updateSettings(next, operationId); const nextForm = toForm(value); setSettings(value); setForm(nextForm); setBaseline(normalize(nextForm)); completeManagementIntent(key); setSaved(true); }
    catch { const authoritative = await load(); if (authoritative) { const remaining = buildRestaurantSettingsChanges(toForm(authoritative), attemptedForm); const reflected = remaining !== null && Object.keys(remaining).length === 0; if (reflected) { completeManagementIntent(key); setSaved(true); } else { setForm(attemptedForm); setError(t.unavailable); } } else { setForm(attemptedForm); setError(t.unavailable); } }
    finally { setSaving(false); }
  }
  return <Shell><PageHeader title={t.restaurant} subtitle={c.subtitle} action={<div className="page-header-actions"><Button variant="secondary" disabled={loading} onClick={() => guard.request(() => void load())}><RefreshCw size={17} aria-hidden />{t.refresh}</Button><Button disabled={!dirty || saving} onClick={() => void save()}><Save size={17} aria-hidden />{saving ? t.saving : t.save}</Button></div>} />
    {error && <p className="ui-notice ui-notice--danger" role="alert">{error}</p>}{stale && <p className="ui-notice ui-notice--warning" role="status">{c.stale}</p>}{saved && <p className="ui-notice ui-notice--success" role="status">{c.saved}</p>}{acceptance.notice && <p className="ui-notice ui-notice--warning" role="status">{acceptance.notice}</p>}
    {loading && !form && <div className="ui-card restaurant-loading" aria-busy="true">{t.loading}</div>}
    {form && settings && <><section className="restaurant-cover ui-card">{form.imageUrl ? <img src={form.imageUrl} alt="" /> : <Store aria-hidden />}<div><h2>{form.name}</h2><span>{settings.lifecycleStatus}</span></div></section><div className="restaurant-grid"><section className="ui-card restaurant-form"><h2>{c.info}</h2><div className="form-grid"><FormField label={locale === "tr" ? "Restoran adı" : "Restaurant name"} required maxLength={160} value={form.name} onChange={e => set("name", e.target.value)} /><TextAreaField label={locale === "tr" ? "Açıklama" : "Description"} maxLength={1500} value={form.description} onChange={e => set("description", e.target.value)} /><FormField label={locale === "tr" ? "Mutfak" : "Cuisine"} value={form.cuisine} onChange={e => set("cuisine", e.target.value)} /><FormField label={locale === "tr" ? "Adres" : "Address"} value={form.address} onChange={e => set("address", e.target.value)} /><FormField label={locale === "tr" ? "Telefon" : "Phone"} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} /><FormField label={c.image} helper={c.imageHint} type="url" value={form.imageUrl} onChange={e => set("imageUrl", e.target.value)} /><label className="ui-field"><span>{t.language}</span><select value={form.preferredLanguage} onChange={e => set("preferredLanguage", e.target.value as "en" | "tr")}><option value="en">English</option><option value="tr">Türkçe</option></select></label><FormField label={c.etaMin} type="number" min="0" value={form.deliveryEtaMinMinutes} onChange={e => set("deliveryEtaMinMinutes", e.target.value)} /><FormField label={c.etaMax} type="number" min="0" value={form.deliveryEtaMaxMinutes} onChange={e => set("deliveryEtaMaxMinutes", e.target.value)} /><FormField label={c.minimum} inputMode="decimal" value={form.minimumOrder} onChange={e => set("minimumOrder", e.target.value)} /></div></section><aside className="restaurant-side"><section className="ui-card"><h2>{c.operations}</h2><div className="restaurant-acceptance"><div><strong>{acceptance.accepting ? c.open : c.closed}</strong><small>{t.runtimeStatus[acceptance.disabled ? "stale" : "connected"]}</small></div><Toggle checked={acceptance.accepting} disabled={acceptance.disabled} onChange={() => void acceptance.toggle()} label={t.accepting} /></div></section><section className="ui-card restaurant-lifecycle"><ImageIcon aria-hidden /><div><span>{c.lifecycle}</span><strong>{settings.lifecycleStatus}</strong></div></section></aside></div></>}
    <Dialog open={guard.confirmOpen} title={c.discard} onClose={guard.cancel} actions={<><Button variant="secondary" onClick={guard.cancel}>{c.keep}</Button><Button variant="danger" onClick={guard.discard}>{c.remove}</Button></>}><p>{c.discardBody}</p></Dialog>
  </Shell>;
}

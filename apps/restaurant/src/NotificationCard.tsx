import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Download, Volume2 } from "lucide-react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseApp } from "./firebase";
import { supabase } from "./supabase";
import { useLocale } from "./providers";
import { Button } from "./components/Button";
import { PageHeader } from "./components/PageHeader";
import { parsePushRegistration, StablePushOperation } from "./pushContract";
import { playOrderAlert, restaurantDeviceId, showRestaurantNotification, unlockOrderAlert, unregisterRestaurantPush } from "./push";

type PushState = "idle" | "registering" | "registered" | "disabling" | "denied" | "unsupported" | "ios_install_required" | "unknown" | "error";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const copy = {
  en: { title:"Alerts", intro:"Connect this browser to receive operational order alerts.", status:"Notification status", idle:"Notifications are not connected.", registering:"Connecting notifications…", registered:"Notifications are connected to this Restaurant.", disabling:"Disabling notifications…", denied:"Browser notification permission is denied.", unsupported:"This browser does not support Firebase web notifications.", ios:"On iPhone or iPad, add Hungrie Restaurant to the Home Screen, open it there, then enable notifications.", unknown:"The server result could not be verified. Retry the same operation to reconcile it.", error:"Notifications could not be updated. Check the connection and try again.", permissionDismissed:"Permission was not granted. Notifications remain disconnected.", enable:"Enable notifications", retry:"Retry operation", disable:"Disable", test:"Test alert", install:"Install app", installHelp:"Install from the browser menu to improve background notification reliability.", realState:"Browser permission alone does not mean server registration succeeded.", testHelp:"The test uses this browser's current permission and audio capability.", ref:"Reference" },
  tr: { title:"Uyarılar", intro:"Operasyonel sipariş uyarıları için bu tarayıcıyı bağlayın.", status:"Bildirim durumu", idle:"Bildirimler bağlı değil.", registering:"Bildirimler bağlanıyor…", registered:"Bildirimler bu Restorana bağlı.", disabling:"Bildirimler devre dışı bırakılıyor…", denied:"Tarayıcı bildirim izni reddedildi.", unsupported:"Bu tarayıcı Firebase web bildirimlerini desteklemiyor.", ios:"iPhone veya iPad'de Hungrie Restaurant'ı Ana Ekrana ekleyin, oradan açın ve bildirimleri etkinleştirin.", unknown:"Sunucu sonucu doğrulanamadı. Uzlaştırmak için aynı işlemi tekrar deneyin.", error:"Bildirimler güncellenemedi. Bağlantıyı kontrol edip tekrar deneyin.", permissionDismissed:"İzin verilmedi. Bildirimler bağlı değil.", enable:"Bildirimleri etkinleştir", retry:"İşlemi tekrar dene", disable:"Devre dışı bırak", test:"Uyarıyı test et", install:"Uygulamayı yükle", installHelp:"Arka plan bildirim güvenilirliğini artırmak için tarayıcı menüsünden yükleyin.", realState:"Tarayıcı izni tek başına sunucu kaydının başarılı olduğunu göstermez.", testHelp:"Test, bu tarayıcının mevcut izin ve ses özelliğini kullanır.", ref:"Referans" },
} as const;

const isIosDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandaloneApp = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const reference = () => crypto.randomUUID().slice(0, 8);

export function NotificationCard() {
  const { locale } = useLocale(), c = copy[locale];
  const [state, setState] = useState<PushState>("idle"), [detail, setDetail] = useState(""), [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const registerOperation = useRef(new StablePushOperation()), unregisterOperation = useRef(new StablePushOperation());
  const lastIntent = useRef<"register" | "unregister" | null>(null), mounted = useRef(true);

  useEffect(() => { mounted.current = true; const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); }; window.addEventListener("beforeinstallprompt", capture); return () => { mounted.current = false; window.removeEventListener("beforeinstallprompt", capture); }; }, []);
  const register = useCallback(async () => {
    setDetail(""); setState("registering"); lastIntent.current = "register";
    let token: string;
    try { const registration = await navigator.serviceWorker.ready; token = await getToken(getMessaging(firebaseApp), { serviceWorkerRegistration: registration, vapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY }); if (!token) throw new Error("missing-token"); }
    catch { if (mounted.current) { setState("error"); setDetail(`${c.error} ${c.ref}: ${reference()}`); } return; }
    const deviceId = restaurantDeviceId(), operationId = registerOperation.current.prepare([token, deviceId, locale]);
    try {
      const result = await supabase.rpc("restaurant_register_web_push_v1" as never, { p_token: token, p_device_id: deviceId, p_language: locale, p_operation_id: operationId } as never);
      if (result.error) throw result.error;
      parsePushRegistration(result.data);
      if (mounted.current) { registerOperation.current.clear(); lastIntent.current = null; setState("registered"); }
    } catch { if (mounted.current) { setState("unknown"); setDetail(`${c.unknown} ${c.ref}: ${reference()}`); } }
  }, [c, locale]);

  useEffect(() => { let live = true; if (isIosDevice() && !isStandaloneApp()) { setState("ios_install_required"); return () => { live = false; }; } void isSupported().then(supported => { if (!live) return; if (!supported) setState("unsupported"); else if (Notification.permission === "denied") setState("denied"); else if (Notification.permission === "granted") void register(); else setState("idle"); }); return () => { live = false; }; }, [register]);

  async function enable() {
    if (state === "registering" || state === "disabling") return;
    setDetail(""); await unlockOrderAlert();
    if (isIosDevice() && !isStandaloneApp()) { setState("ios_install_required"); return; }
    if (!await isSupported()) { setState("unsupported"); return; }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") { setState(permission === "denied" ? "denied" : "idle"); setDetail(permission === "default" ? c.permissionDismissed : ""); return; }
    await register();
  }
  async function disable() {
    if (state === "registering" || state === "disabling") return;
    setDetail(""); setState("disabling"); lastIntent.current = "unregister";
    const operationId = unregisterOperation.current.prepare([restaurantDeviceId()]);
    try { await unregisterRestaurantPush(operationId); if (mounted.current) { unregisterOperation.current.clear(); lastIntent.current = null; setState("idle"); } }
    catch { if (mounted.current) { setState("unknown"); setDetail(`${c.unknown} ${c.ref}: ${reference()}`); } }
  }
  const retry = () => lastIntent.current === "unregister" ? void disable() : void register();
  const testAlert = async () => { await unlockOrderAlert(); await Promise.all([playOrderAlert(), showRestaurantNotification()]); };
  const label = state === "registering" ? c.registering : state === "registered" ? c.registered : state === "disabling" ? c.disabling : state === "denied" ? c.denied : state === "unsupported" ? c.unsupported : state === "ios_install_required" ? c.ios : state === "unknown" ? c.unknown : state === "error" ? c.error : c.idle;

  return <div className="alerts-page"><PageHeader title={c.title} subtitle={c.intro}/>
    <section className="ui-card alerts-status" aria-live="polite"><span className={`alerts-icon alerts-icon--${state}`} aria-hidden="true">{state === "registered" ? <Bell/> : <BellOff/>}</span><div><h2>{c.status}</h2><p>{label}</p><small>{c.realState}</small></div></section>
    {detail && <p className={`ui-notice ${state === "unknown" ? "ui-notice--warning" : "ui-notice--danger"}`} role="alert">{detail}</p>}
    <section className="ui-card alerts-actions"><h2>{c.status}</h2><div className="alerts-buttons">
      {state !== "registered" && state !== "ios_install_required" && state !== "unsupported" && <Button disabled={state === "registering" || state === "disabling"} onClick={() => void enable()}>{c.enable}</Button>}
      {state === "unknown" && <Button variant="secondary" onClick={retry}>{c.retry}</Button>}
      {state === "registered" && <><Button icon={<Volume2 size={18} aria-hidden="true"/>} onClick={() => void testAlert()}>{c.test}</Button><Button variant="danger" onClick={() => void disable()}>{c.disable}</Button></>}
    </div><p>{c.testHelp}</p></section>
    <section className="ui-card alerts-install"><Download aria-hidden="true"/><div><h2>{c.install}</h2><p>{state === "ios_install_required" ? c.ios : c.installHelp}</p></div>{installPrompt && <Button variant="secondary" onClick={() => { void installPrompt.prompt(); void installPrompt.userChoice.finally(() => setInstallPrompt(null)); }}>{c.install}</Button>}</section>
  </div>;
}

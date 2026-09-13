import { useCallback, useEffect, useRef, useState } from "react";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { firebaseApp } from "./firebase";
import { supabase } from "./supabase";
import { useLocale } from "./providers";
import { playOrderAlert, restaurantDeviceId, unregisterRestaurantPush } from "./push";

type PushState = "idle" | "registering" | "registered" | "denied" | "unsupported" | "error";

export function NotificationCard() {
  const { locale, t } = useLocale();
  const [state, setState] = useState<PushState>("idle");
  const [error, setError] = useState("");
  const unsubscribeForeground = useRef<ReturnType<typeof onMessage> | null>(null);

  const report = useCallback((message: string) => {
    setState("error");
    setError(`${message} Ref: ${crypto.randomUUID().slice(0, 8)}`);
  }, []);

  const register = useCallback(async () => {
    setError("");
    setState("registering");
    let token: string;
    let messaging: ReturnType<typeof getMessaging>;

    try {
      const registration = await navigator.serviceWorker.ready;
      messaging = getMessaging(firebaseApp);
      token = await getToken(messaging, {
        serviceWorkerRegistration: registration,
        vapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
      });
      if (!token) throw new Error("Missing FCM token");
    } catch {
      report(t.pushTokenFailed);
      return;
    }

    try {
      const result = await supabase.rpc("restaurant_register_web_push_v1" as any, {
        p_token: token,
        p_device_id: restaurantDeviceId(),
        p_language: locale,
        p_operation_id: crypto.randomUUID(),
      });
      if (result.error) throw result.error;
    } catch {
      report(t.pushRegistrationFailed);
      return;
    }

    unsubscribeForeground.current?.();
    unsubscribeForeground.current = onMessage(messaging, playOrderAlert);
    setState("registered");
  }, [locale, report, t.pushRegistrationFailed, t.pushTokenFailed]);

  useEffect(() => {
    let live = true;
    void isSupported().then((supported) => {
      if (!live) return;
      if (!supported) setState("unsupported");
      else if (Notification.permission === "denied") setState("denied");
      else if (Notification.permission === "granted") void register();
    });
    return () => {
      live = false;
      unsubscribeForeground.current?.();
      unsubscribeForeground.current = null;
    };
  }, [register]);

  async function enable() {
    setError("");
    if (!await isSupported()) {
      setState("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "denied" : "idle");
      return;
    }
    await register();
  }

  async function disable() {
    setError("");
    try {
      await unregisterRestaurantPush();
      unsubscribeForeground.current?.();
      unsubscribeForeground.current = null;
      setState("idle");
    } catch {
      report(t.pushDisableFailed);
    }
  }

  const status = state === "registered" ? "✓ FCM Web Push"
    : state === "registering" ? t.pushRegistering
      : state === "error" ? t.pushPermissionOnly
        : state === "denied" || state === "unsupported" ? t.pushDenied
          : t.pushDisabled;

  return <section className="card">
    <h2>{t.settings}</h2>
    <p>{status}</p>
    {error && <p className="danger">{error}</p>}
    <button className="button" disabled={state === "registering"} onClick={() => void enable()}>{t.enablePush}</button>
    {state === "registered" && <button onClick={() => void disable()}>Disable</button>}
  </section>;
}

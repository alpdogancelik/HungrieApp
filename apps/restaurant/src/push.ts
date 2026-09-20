import type { MessagePayload } from "firebase/messaging";
import { deleteToken, getMessaging, isSupported } from "firebase/messaging";
import { firebaseApp } from "./firebase";
import { supabase } from "./supabase";

type RestaurantAlertPayload = Pick<MessagePayload, "data" | "notification">;

export const restaurantDeviceId = () => {
  let id = localStorage.getItem("hungrie-restaurant-device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("hungrie-restaurant-device", id);
  }
  return id;
};

export const unregisterRestaurantPush = async () => {
  const deviceId = restaurantDeviceId();
  const result = await supabase.rpc("restaurant_unregister_web_push_v1" as never, {
    p_device_id: deviceId,
    p_operation_id: crypto.randomUUID(),
  } as never);
  if (result.error) throw result.error;
  if (await isSupported()) await deleteToken(getMessaging(firebaseApp)).catch(() => false);
};

let alertContext: AudioContext | null = null;

const getAlertContext = () => {
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  alertContext ||= new Context();
  return alertContext;
};

export const unlockOrderAlert = async () => {
  const context = getAlertContext();
  if (context?.state === "suspended") await context.resume();
};

export const playOrderAlert = async () => {
  const context = getAlertContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  if (context.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.15, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
};

export const showRestaurantNotification = async (payload?: RestaurantAlertPayload) => {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  const orderId = String(payload?.data?.orderId || "");
  const title = String(payload?.data?.title || payload?.notification?.title || "Hungrie Restaurant");
  const body = String(payload?.data?.body || payload?.notification?.body || "A new order update is ready.");
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    tag: String(payload?.data?.eventId || orderId || `restaurant-alert-${Date.now()}`),
    data: { url: orderId ? `/orders/detail?orderId=${encodeURIComponent(orderId)}` : "/orders" },
  });
};

const recentAlerts = new Map<string, number>();
const RECENT_ALERTS_KEY = "hungrie-restaurant-recent-alerts-v1";

const loadRecentAlerts = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RECENT_ALERTS_KEY) || "[]") as [string, number][];
    for (const [key, alertedAt] of stored) {
      if (key && Number.isFinite(alertedAt)) recentAlerts.set(key, alertedAt);
    }
  } catch {
    // Malformed or unavailable browser storage must not block order alerts.
  }
};

const persistRecentAlerts = () => {
  try {
    sessionStorage.setItem(RECENT_ALERTS_KEY, JSON.stringify([...recentAlerts.entries()]));
  } catch {
    // Audio and notification delivery remain best effort when storage is unavailable.
  }
};

export const alertRestaurantOrder = async (payload: RestaurantAlertPayload) => {
  if (!recentAlerts.size) loadRecentAlerts();
  const orderId = String(payload.data?.orderId || "");
  const eventId = String(payload.data?.eventId || "");
  const eventType = String(payload.data?.eventType || "restaurant_new_order");
  const key = orderId && eventType === "restaurant_new_order" ? `new:${orderId}` : eventId ? `event:${eventId}` : "";
  const now = Date.now();
  for (const [storedKey, alertedAt] of recentAlerts) if (now - alertedAt > 10 * 60_000) recentAlerts.delete(storedKey);
  if (key && recentAlerts.has(key)) return;
  if (key) {
    recentAlerts.set(key, now);
    persistRecentAlerts();
  }
  await Promise.all([playOrderAlert(), showRestaurantNotification(payload)]);
};

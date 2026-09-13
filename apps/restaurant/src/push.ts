import { deleteToken, getMessaging, isSupported } from "firebase/messaging";
import { firebaseApp } from "./firebase";
import { supabase } from "./supabase";

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
  await supabase.rpc("restaurant_unregister_web_push_v1" as never, {
    p_device_id: deviceId,
    p_operation_id: crypto.randomUUID(),
  } as never);
  if (await isSupported()) await deleteToken(getMessaging(firebaseApp)).catch(() => false);
};

export const playOrderAlert = () => {
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  const context = new Context();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.15, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
};

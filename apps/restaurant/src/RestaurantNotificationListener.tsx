import { useEffect } from "react";
import { getMessaging, isSupported, onMessage } from "firebase/messaging";
import { firebaseApp } from "./firebase";
import { supabase } from "./supabase";
import { alertRestaurantOrder, unlockOrderAlert } from "./push";

export function RestaurantNotificationListener({ restaurantId }: { restaurantId: string }) {
  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const unlock = () => void unlockOrderAlert();

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    void isSupported().then((supported) => {
      if (!live || !supported) return;
      unsubscribe = onMessage(getMessaging(firebaseApp), (payload) => {
        void alertRestaurantOrder(payload);
      });
    });

    void supabase.realtime.setAuth().then(() => {
      if (!live) return;
      channel = supabase.channel(`restaurant-orders:v1:${restaurantId}`, { config: { private: true } })
        .on("broadcast", { event: "order_changed" }, ({ payload }) => {
          if (payload?.operation !== "insert" || !payload?.order_id) return;
          void alertRestaurantOrder({ data: {
            eventType: "restaurant_new_order",
            orderId: String(payload.order_id),
          } });
        })
        .subscribe();
    });

    return () => {
      live = false;
      unsubscribe?.();
      if (channel) void supabase.removeChannel(channel);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [restaurantId]);

  return null;
}

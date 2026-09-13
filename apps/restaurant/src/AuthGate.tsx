import { onIdTokenChanged, signOut } from "firebase/auth";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { auth, ensureSessionPersistence } from "./firebase";
import { supabase } from "./supabase";
import type { AccessContext } from "./contracts";
import { useLocale } from "./providers";
import { RestaurantNotificationListener } from "./RestaurantNotificationListener";

// Invite acceptance must be reachable before an account_access row exists.
const publicPath = (path: string) =>
  path === "/login" || path === "/invite" || path.startsWith("/invite/");

export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [restaurantId, setRestaurantId] = useState("");
  const [retry, setRetry] = useState(0);
  const verified = useRef(false);
  const verifiedUid = useRef("");

  useEffect(() => {
    void ensureSessionPersistence();
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  useEffect(() => {
    let live = true;

    // A route change must not unmount the Stack. Otherwise Expo Router can
    // restart at / and redirect to Dashboard instead of opening the route.
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!live) return;
      if (user?.uid !== verifiedUid.current) {
        verified.current = false;
        verifiedUid.current = "";
        setRestaurantId("");
        setState("loading");
      }
      if (path === "/invite" || path.startsWith("/invite/")) {
        setState("ready");
        return;
      }
      if (!user) {
        if (publicPath(path)) setState("ready");
        else router.replace("/login");
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_my_access_context_v1");
        if (error) throw error;
        if (!live) return;
        const context = data as unknown as AccessContext;
        if (context.state !== "resolved" || context.accountType !== "restaurant" || context.accountStatus === "revoked") {
          await signOut(auth);
          if (live) router.replace("/login?reason=failed");
          return;
        }
        if (context.accountStatus === "pending") {
          if (path === "/pending") setState("ready");
          else router.replace("/pending");
          return;
        }
        if (context.accountStatus === "suspended" || context.restaurantStatus === "suspended") {
          if (path === "/suspended") setState("ready");
          else router.replace("/suspended");
          return;
        }
        if (context.accountStatus !== "active" || context.restaurantStatus !== "active") {
          await signOut(auth);
          if (live) router.replace("/login?reason=failed");
          return;
        }
        if (!context.restaurantId) throw new Error("Restaurant scope is unavailable");
        setRestaurantId(context.restaurantId);
        verified.current = true;
        verifiedUid.current = user.uid;
        if (publicPath(path) || path === "/pending" || path === "/suspended") {
          router.replace("/dashboard");
        } else {
          setState("ready");
        }
      } catch {
        // Protected database operations still recheck live authorization. Once
        // this browser has resolved active Restaurant access, a transient
        // context/network failure must not unmount the whole operational UI.
        if (live && !verified.current) setState("error");
      }
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, [path, retry, router]);

  if (state === "ready") return <>{restaurantId && <RestaurantNotificationListener restaurantId={restaurantId} />}{children}</>;
  return <div className="center"><p>{state === "error" ? t.unavailable : t.loading}</p>
    {state === "error" && <button className="button" onClick={() => { setState("loading"); setRetry(value => value + 1); }}>{t.retry}</button>}
  </div>;
}

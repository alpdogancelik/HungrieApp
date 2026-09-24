import { onIdTokenChanged } from "firebase/auth";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { auth, ensureSessionPersistence } from "./firebase";
import { supabase } from "./supabase";
import { useLocale } from "./providers";
import { RestaurantAccessReady } from "./RestaurantAccessReady";
import { parseRestaurantAccessContext, RestaurantAccessContext, RestaurantAccessContextError, type RestaurantAccessContextValue } from "./RestaurantAccessContext";
import { RestaurantRuntimeProvider } from "./RestaurantRuntimeContext";
import { DataState } from "./components/DataState";
import { restaurantSignOut } from "./restaurantSignOut";

// Invite acceptance must be reachable before an account_access row exists.
const publicPath = (path: string) =>
  path === "/login" || path === "/forgot-password" || path === "/invite" || path.startsWith("/invite/");

const accessContextTimeoutMs = 12000;

async function fetchAccessContext() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), accessContextTimeoutMs);
  try {
    return await supabase.rpc("get_my_access_context_v1").abortSignal(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function restoreAccessContext(user: NonNullable<typeof auth.currentUser>) {
  await ensureSessionPersistence();
  await user.getIdToken();
  const first = await fetchAccessContext();
  if (!first.error) return first;
  await new Promise(resolve => setTimeout(resolve, 250));
  await user.getIdToken(true);
  return fetchAccessContext();
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const [state, setState] = useState<"loading" | "ready" | "error">(publicPath(path) ? "ready" : "loading");
  const [restaurantId, setRestaurantId] = useState("");
  const [accessContext, setAccessContext] = useState<RestaurantAccessContextValue | null>(null);
  const [retry, setRetry] = useState(0);
  const verified = useRef(false);
  const verifiedUid = useRef("");
  const runtimeReady = state === "ready"
    && Boolean(restaurantId)
    && accessContext?.accountStatus === "active"
    && accessContext.restaurantStatus === "active"
    && accessContext.onboardingStep === "none";
  const accessStatePageReady = state === "ready"
    && ((path === "/pending" && accessContext?.accountStatus === "pending")
      || (path === "/suspended" && (accessContext?.accountStatus === "suspended" || accessContext?.restaurantStatus === "suspended")));
  const contentReady = publicPath(path) || runtimeReady || accessStatePageReady;

  useEffect(() => {
    void ensureSessionPersistence().catch(() => { if (!publicPath(path)) setState("error"); });
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = setTimeout(() => setState(current => current === "loading" ? "error" : current), 15000);
    return () => clearTimeout(timeout);
  }, [state, retry, path]);

  useEffect(() => {
    let live = true;

    // A route change must not unmount the Stack. Otherwise Expo Router can
    // restart at / and redirect to Dashboard instead of opening the route.
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!live) return;
      const wasVerified = verified.current;
      if (user?.uid !== verifiedUid.current) {
        verified.current = false;
        verifiedUid.current = "";
        setRestaurantId("");
        setAccessContext(null);
        setState("loading");
      }
      if (path === "/invite" || path.startsWith("/invite/")) {
        setState("ready");
        return;
      }
      if (!user) {
        if (publicPath(path)) setState("ready");
        else router.replace(wasVerified ? "/login?reason=session-expired" : "/login");
        return;
      }

      try {
        const { data, error } = await restoreAccessContext(user);
        if (error) throw error;
        if (!live) return;
        const context = parseRestaurantAccessContext(data);
        if (context.state !== "resolved" || context.accountType !== "restaurant") {
          verified.current = false;
          verifiedUid.current = "";
          setRestaurantId("");
          setAccessContext(null);
          setState("loading");
          await restaurantSignOut();
          if (live) router.replace(`/login?reason=${context.state === "configuration_error" && context.referenceId === "wrong-portal" ? "wrong-role" : "access"}`);
          return;
        }
        if (context.accountStatus === "revoked") {
          verified.current = false;
          verifiedUid.current = "";
          setRestaurantId("");
          setAccessContext(null);
          setState("loading");
          await restaurantSignOut();
          if (live) router.replace("/login?reason=revoked");
          return;
        }
        if (context.accountStatus === "pending") {
          verified.current = false;
          setRestaurantId("");
          setAccessContext(context);
          if (path === "/pending") setState("ready");
          else router.replace("/pending");
          return;
        }
        if (context.accountStatus === "suspended" || context.restaurantStatus === "suspended") {
          verified.current = false;
          setRestaurantId("");
          setAccessContext(context);
          if (path === "/suspended") setState("ready");
          else router.replace("/suspended");
          return;
        }
        if (context.accountStatus !== "active" || context.restaurantStatus !== "active") {
          await restaurantSignOut();
          if (live) router.replace("/login?reason=failed");
          return;
        }
        if (!context.restaurantId) throw new Error("Restaurant scope is unavailable");
        setRestaurantId(context.restaurantId);
        setAccessContext(context);
        verified.current = true;
        verifiedUid.current = user.uid;
        setState("ready");
      } catch (error) {
        if (error instanceof RestaurantAccessContextError) {
          verified.current = false;
          verifiedUid.current = "";
          setRestaurantId("");
          setAccessContext(null);
          if (live) setState("error");
          return;
        }
        // Protected database operations still recheck live authorization. Once
        // this browser has resolved active Restaurant access, a transient
        // context/network failure must not unmount the whole operational UI.
        if (live) setState(verified.current ? "ready" : "error");
      }
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, [path, retry, router]);

  // Navigation runs only after React has committed the ready render. At that
  // point protected content is already wrapped by RestaurantRuntimeProvider.
  useEffect(() => {
    if (runtimeReady && (publicPath(path) || path === "/pending" || path === "/suspended")) {
      router.replace("/dashboard");
    }
  }, [path, router, runtimeReady]);

  return <>
    <RestaurantAccessContext.Provider value={accessContext}>
      <RestaurantAccessReady.Provider value={runtimeReady}>
        {runtimeReady && accessContext
          ? <RestaurantRuntimeProvider restaurantId={restaurantId} role={accessContext.restaurantRole}>{children}</RestaurantRuntimeProvider>
          : contentReady ? children : null}
      </RestaurantAccessReady.Provider>
    </RestaurantAccessContext.Provider>
    {(state !== "ready" || !contentReady) && <div className="access-overlay">
      <DataState
        live
        kind={state === "error" ? "error" : "loading"}
        title={state === "error" ? t.unavailable : t.loading}
        action={state === "error" ? { label: t.retry, onClick: () => { setState("loading"); setRetry(value => value + 1); } } : undefined}
      />
    </div>}
  </>;
}

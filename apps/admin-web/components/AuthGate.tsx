"use client";

import { onIdTokenChanged, signOut } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, ensureSessionPersistence } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import type { AccessContext } from "@/lib/contracts";
import { useLocale } from "./AdminProviders";

const publicPath = (path: string) => path === "/login" || path.startsWith("/invite/");
type GateState = { path: string; status: "loading" | "ready" | "error"; approvedUid: string | null };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const [state, setState] = useState<GateState>({ path: "", status: "loading", approvedUid: null });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ path, status: "loading", approvedUid: previous.path === path ? previous.approvedUid : null }));
    void ensureSessionPersistence();
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!active) return;
      setState((previous) => ({ path, status: "loading", approvedUid: previous.path === path && previous.approvedUid === user?.uid ? previous.approvedUid : null }));
      if (!user) {
        if (publicPath(path)) setState({ path, status: "ready", approvedUid: null });
        else router.replace("/login");
        return;
      }
      try {
        let response: Awaited<ReturnType<typeof supabase.rpc<"get_my_access_context_v1">>> | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          response = await supabase.rpc("get_my_access_context_v1");
          if (!active || !response.error) break;
          if (attempt === 2 || (response.status !== 0 && response.status < 500)) break;
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
        if (!active || auth.currentUser?.uid !== user.uid) return;
        if (!response || response.error) throw response?.error || new Error("Access check unavailable");
        const context = response.data as unknown as AccessContext;
        if (context.state !== "resolved" || context.accountType !== "admin" || context.accountStatus === "revoked") {
          if (path.startsWith("/invite/") && context.state === "resolved" && context.accountType === "restaurant") {
            setState({ path, status: "ready", approvedUid: user.uid });
            return;
          }
          setState({ path, status: "loading", approvedUid: null });
          await signOut(auth);
          if (!active) return;
          if (path === "/login") setState({ path, status: "ready", approvedUid: null });
          else router.replace("/login?reason=sign-in-failed");
          return;
        }
        if (context.accountStatus === "suspended") {
          if (path === "/suspended") setState({ path, status: "ready", approvedUid: user.uid });
          else router.replace("/suspended");
          return;
        }
        if (context.onboardingStep === "admin_mfa_enrollment_required") {
          if (path === "/onboarding/mfa") setState({ path, status: "ready", approvedUid: user.uid });
          else router.replace("/onboarding/mfa");
          return;
        }
        if (context.onboardingStep === "admin_mfa_sign_in_required" && context.currentSessionMfaVerified && path === "/login") {
          setState({ path, status: "ready", approvedUid: user.uid });
          return;
        }
        if (context.onboardingStep === "admin_mfa_sign_in_required" || !context.currentSessionMfaVerified) {
          setState({ path, status: "loading", approvedUid: null });
          await signOut(auth);
          if (active) router.replace("/login?reason=mfa");
          return;
        }
        if (context.accountStatus !== "active" || context.onboardingStep !== "none") {
          setState({ path, status: "loading", approvedUid: null });
          await signOut(auth);
          if (active) router.replace("/login?reason=sign-in-failed");
          return;
        }
        if (publicPath(path) || path === "/onboarding/mfa" || path === "/suspended") router.replace("/dashboard");
        else setState({ path, status: "ready", approvedUid: user.uid });
      } catch {
        if (active) setState((previous) => ({ path, status: "error", approvedUid: previous.path === path ? previous.approvedUid : null }));
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [path, router, retryVersion]);

  const error = state.path === path && state.status === "error";
  const statusView = error
    ? <main className="center-card"><p>{t.unavailable}</p><button onClick={() => setRetryVersion((value) => value + 1)}>{t.retry}</button></main>
    : <main className="center-card"><p>{t.loading}</p></main>;
  if (state.path !== path || !state.approvedUid) return state.status === "ready" ? children : statusView;
  return <>
    <div hidden={state.status === "ready"}>{statusView}</div>
    <div hidden={state.status !== "ready"}>{children}</div>
  </>;
}

"use client";

import { onIdTokenChanged, signOut } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, ensureSessionPersistence } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import type { AccessContext } from "@/lib/contracts";
import { useLocale } from "./AdminProviders";

const publicPath = (path: string) => path === "/login" || path.startsWith("/invite/");
type GateState = { path: string; status: "loading" | "ready" | "error" };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const [state, setState] = useState<GateState>({ path: "", status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ path, status: "loading" });
    void ensureSessionPersistence();
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!active) return;
      setState({ path, status: "loading" });
      if (!user) {
        if (publicPath(path)) setState({ path, status: "ready" });
        else router.replace("/login");
        return;
      }
      try {
        const { data, error } = await supabase.rpc("get_my_access_context_v1");
        if (!active) return;
        if (error) throw error;
        const context = data as unknown as AccessContext;
        if (context.state !== "resolved" || context.accountType !== "admin" || context.accountStatus === "revoked") {
          if (path.startsWith("/invite/") && context.state === "resolved" && context.accountType === "restaurant") {
            setState({ path, status: "ready" });
            return;
          }
          await signOut(auth);
          if (!active) return;
          if (path === "/login") setState({ path, status: "ready" });
          else router.replace("/login?reason=sign-in-failed");
          return;
        }
        if (context.accountStatus === "suspended") {
          if (path === "/suspended") setState({ path, status: "ready" });
          else router.replace("/suspended");
          return;
        }
        if (context.onboardingStep === "admin_mfa_enrollment_required") {
          if (path === "/onboarding/mfa") setState({ path, status: "ready" });
          else router.replace("/onboarding/mfa");
          return;
        }
        if (context.onboardingStep === "admin_mfa_sign_in_required" && context.currentSessionMfaVerified && path === "/login") {
          setState({ path, status: "ready" });
          return;
        }
        if (context.onboardingStep === "admin_mfa_sign_in_required" || !context.currentSessionMfaVerified) {
          await signOut(auth);
          if (active) router.replace("/login?reason=mfa");
          return;
        }
        if (context.accountStatus !== "active" || context.onboardingStep !== "none") {
          await signOut(auth);
          if (active) router.replace("/login?reason=sign-in-failed");
          return;
        }
        if (publicPath(path) || path === "/onboarding/mfa" || path === "/suspended") router.replace("/dashboard");
        else setState({ path, status: "ready" });
      } catch {
        if (active) setState({ path, status: "error" });
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [path, router]);

  if (state.path !== path || state.status === "loading") return <main className="center-card"><p>{t.loading}</p></main>;
  if (state.status === "error") return <main className="center-card"><p>{t.unavailable}</p><button onClick={() => location.reload()}>{t.retry}</button></main>;
  return children;
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  getMultiFactorResolver,
  MultiFactorError,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, ensureSessionPersistence } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/components/AdminProviders";
import type { AccessContext } from "@/lib/contracts";

const credentialErrors = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/wrong-password",
  "auth/user-not-found",
]);
const codeErrors = new Set(["auth/invalid-verification-code", "auth/code-expired"]);

export default function Login() {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [resolver, setResolver] = useState<ReturnType<typeof getMultiFactorResolver> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "denied") setError(t.denied);
    if (reason === "mfa") setError(t.mfaAgain);
  }, [t]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await ensureSessionPersistence();
      let user;
      if (resolver) {
        const hint = resolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) throw new Error("TOTP factor unavailable");
        user = (await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code))).user;
      } else {
        try {
          user = (await signInWithEmailAndPassword(auth, email, password)).user;
        } catch (value) {
          const candidate = value as MultiFactorError;
          if (candidate.code === "auth/multi-factor-auth-required") {
            setResolver(getMultiFactorResolver(auth, candidate));
            setCode("");
            return;
          }
          throw value;
        }
      }

      await user.getIdToken(true);
      const { data, error: contextError } = await supabase.rpc("get_my_access_context_v1");
      if (contextError) throw contextError;
      const context = data as unknown as AccessContext;
      if (context.state !== "resolved" || context.accountType !== "admin" || context.accountStatus === "revoked") {
        await signOut(auth);
        setResolver(null);
        setPassword("");
        setCode("");
        setError(t.denied);
        return;
      }
      if (context.accountStatus === "suspended") {
        router.replace("/suspended");
        return;
      }
      if (context.onboardingStep === "admin_mfa_enrollment_required") {
        router.replace("/onboarding/mfa");
        return;
      }
      if (!context.currentSessionMfaVerified) {
        await signOut(auth);
        setResolver(null);
        setPassword("");
        setCode("");
        setError(t.mfaAgain);
        return;
      }
      if (context.onboardingStep === "admin_mfa_sign_in_required") {
        const done = await supabase.rpc("complete_my_admin_onboarding_v1" as never, { p_operation_id: crypto.randomUUID() } as never);
        if (done.error) throw done.error;
      } else if (context.accountStatus !== "active" || context.onboardingStep !== "none") {
        throw new Error("Unexpected Admin onboarding state");
      }
      router.replace("/dashboard");
    } catch (value) {
      const code = typeof value === "object" && value && "code" in value ? String(value.code) : "";
      setError(credentialErrors.has(code) ? t.invalidCredentials : codeErrors.has(code) ? t.invalidCode : `${t.unavailable} Ref: ${crypto.randomUUID()}`);
    } finally {
      setBusy(false);
    }
  }

  return <main className="center-card">
    <div className="auth-head"><h1>{t.login}</h1><button onClick={() => setLocale(locale === "en" ? "tr" : "en")}>{t.language}</button></div>
    <form onSubmit={submit}>
      {!resolver ? <>
        <label>{t.email}<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>{t.password}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      </> : <label>{t.code}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value)} /></label>}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{t.signIn}</button>
    </form>
  </main>;
}

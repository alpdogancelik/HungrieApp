import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from "firebase/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { auth, ensureSessionPersistence } from "../src/firebase";
import { supabase } from "../src/supabase";
import { useLocale } from "../src/providers";
import { AuthLayout } from "../src/components/AuthLayout";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { FormField } from "../src/components/FormField";

// EAS static hosting serves /invite.html; invitation tokens travel in the
// query string and are never included in a server-rendered page.
export default function Invite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verify, setVerify] = useState(false);
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!token || Array.isArray(token)) { setError(t.inviteUnavailable); return; }
    setSubmitting(true);
    try {
      await ensureSessionPersistence();
      const user = mode === "create"
        ? (await createUserWithEmailAndPassword(auth, email, password)).user
        : (await signInWithEmailAndPassword(auth, email, password)).user;
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        setVerify(true);
        return;
      }
      await user.getIdToken(true);
      const result = await supabase.rpc("accept_my_account_invitation_v1", {
        p_token: token, p_operation_id: crypto.randomUUID(),
      });
      if (result.error) { setError(t.inviteUnavailable); return; }
      router.replace("/pending");
    } catch {
      setError(t.invalid);
    } finally {
      setSubmitting(false);
    }
  }

  return <AuthLayout><Card><form className="auth-form" onSubmit={submit} aria-busy={submitting}>
    <div><p className="auth-eyebrow">Hungrie Restaurant</p><h1>{t.invite}</h1><p>{t.inviteIntro}</p></div>
    {verify ? <p className="ui-notice ui-notice--success" role="status">{t.verify}</p> : <>
      <div className="auth-tabs" role="tablist" aria-label={t.invite}>
        <button type="button" role="tab" aria-selected={mode === "create"} onClick={() => setMode("create")}>{t.newAccount}</button>
        <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>{t.existingAccount}</button>
      </div>
      <FormField label={t.email} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <FormField label={t.password} type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p className="ui-field__error" role="alert">{error}</p>}
      <Button disabled={submitting}>{submitting ? t.saving : mode === "create" ? t.create : t.signIn}</Button>
    </>}
  </form></Card></AuthLayout>;
}

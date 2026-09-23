import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import { Link } from "expo-router";
import { FormEvent, useState } from "react";
import { AuthLayout } from "../src/components/AuthLayout";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { FormField } from "../src/components/FormField";
import { auth, ensureSessionPersistence } from "../src/firebase";
import { useLocale } from "../src/providers";

export default function ForgotPassword() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("submitting");
    try {
      await ensureSessionPersistence();
      await sendPasswordResetEmail(auth, email);
      setState("sent");
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : "";
      setState(code === "auth/network-request-failed" || code === "auth/too-many-requests" ? "error" : "sent");
    }
  }
  return <AuthLayout><Card><form className="auth-form" onSubmit={submit} aria-busy={state === "submitting"}>
    <div><p className="auth-eyebrow">Hungrie Restaurant</p><h1>{t.resetPassword}</h1><p>{t.resetIntro}</p></div>
    {state === "sent" ? <p className="ui-notice ui-notice--success" role="status">{t.resetSent}</p> : <>
      <FormField label={t.email} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
      {state === "error" && <p className="ui-field__error" role="alert">{t.resetFailed}</p>}
      <Button disabled={state === "submitting"}>{state === "submitting" ? t.saving : t.resetPassword}</Button>
    </>}
    <Link className="auth-link" href="/login">{t.backToLogin}</Link>
  </form></Card></AuthLayout>;
}

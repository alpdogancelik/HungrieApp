import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Link, useLocalSearchParams } from "expo-router";
import { auth, ensureSessionPersistence } from "../src/firebase";
import { useLocale } from "../src/providers";
import { AuthLayout } from "../src/components/AuthLayout";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { FormField } from "../src/components/FormField";

export default function Login() {
  const { t } = useLocale();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try { await ensureSessionPersistence(); await signInWithEmailAndPassword(auth, email, password); }
    catch { setError(t.invalid); }
    finally { setSubmitting(false); }
  }
  const reasonCopy = reason === "revoked" ? t.revoked : reason === "wrong-role" ? t.wrongRole : reason === "session-expired" ? t.sessionExpired : reason ? t.accessFailed : "";
  return <AuthLayout><Card><form className="auth-form" onSubmit={submit} aria-busy={submitting}>
    <div><p className="auth-eyebrow">Hungrie Restaurant</p><h1>{t.signIn}</h1></div>
    {reasonCopy && <p className="ui-notice ui-notice--warning" role="alert">{reasonCopy}</p>}
    <FormField label={t.email} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
    <FormField label={t.password} type="password" autoComplete="current-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
    {error && <p className="ui-field__error" role="alert">{error}</p>}
    <Link className="auth-link" href={"/forgot-password" as never}>{t.forgotPassword}</Link>
    <Button disabled={submitting}>{submitting ? t.signingIn : t.signIn}</Button>
  </form></Card></AuthLayout>;
}

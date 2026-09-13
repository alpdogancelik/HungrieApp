import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useLocalSearchParams } from "expo-router";
import { auth, ensureSessionPersistence } from "../src/firebase";
import { useLocale } from "../src/providers";

export default function Login() {
  const { t } = useLocale();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try { await ensureSessionPersistence(); await signInWithEmailAndPassword(auth, email, password); }
    catch { setError(t.invalid); }
  }
  return <main className="center"><form className="card" onSubmit={submit}>
    <h1>Hungrie Restaurant</h1>
    <label className="field">{t.email}<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="field">{t.password}<input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
    {(error || reason === "failed") && <p className="danger" role="alert">{t.invalid}</p>}
    <button className="button">{t.signIn}</button>
  </form></main>;
}

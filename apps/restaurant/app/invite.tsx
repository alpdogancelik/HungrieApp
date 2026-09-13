import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from "firebase/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { auth, ensureSessionPersistence } from "../src/firebase";
import { supabase } from "../src/supabase";
import { useLocale } from "../src/providers";

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!token || Array.isArray(token)) { setError(t.inviteUnavailable); return; }
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
    }
  }

  return <main className="center"><form className="card" onSubmit={submit}>
    <h1>{t.invite}</h1>
    {verify ? <p>{t.verify}</p> : <>
      <div className="row">
        <button type="button" className={mode === "create" ? "button" : ""} onClick={() => setMode("create")}>New account / Yeni hesap</button>
        <button type="button" className={mode === "signin" ? "button" : ""} onClick={() => setMode("signin")}>Existing account / Mevcut hesap</button>
      </div>
      <label className="field">{t.email}<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="field">{t.password}<input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="danger">{error}</p>}
      <button className="button">{mode === "create" ? t.create : t.signIn}</button>
    </>}
  </form></main>;
}

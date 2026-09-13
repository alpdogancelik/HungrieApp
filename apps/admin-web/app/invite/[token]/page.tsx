"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "@/components/AdminProviders";
import { auth, ensureSessionPersistence } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { locale, t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verify, setVerify] = useState(false);
  const [restaurantAccepted, setRestaurantAccepted] = useState(false);
  const tr = locale === "tr";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await ensureSessionPersistence();
      let user;
      try {
        user = (await signInWithEmailAndPassword(auth, email, password)).user;
      } catch {
        user = (await createUserWithEmailAndPassword(auth, email, password)).user;
      }
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        setVerify(true);
        return;
      }
      await user.getIdToken(true);
      const { data, error: invitationError } = await supabase.rpc(
        "accept_my_account_invitation_v1" as never,
        { p_token: token, p_operation_id: crypto.randomUUID() } as never,
      );
      if (invitationError) throw invitationError;
      const accountType = (data as { accountType?: string } | null)?.accountType;
      if (accountType === "restaurant") {
        await signOut(auth);
        setRestaurantAccepted(true);
        return;
      }
      if (accountType !== "admin") throw new Error("unexpected invitation result");
      router.replace("/onboarding/mfa");
    } catch {
      setError(`${t.unavailable} Ref: ${crypto.randomUUID()}`);
    }
  }

  if (restaurantAccepted) {
    return <main className="center-card"><h1>{tr ? "Davet kabul edildi" : "Invitation accepted"}</h1><p>{tr ? "Devam etmek için Restoran portalını açın." : "Open the Restaurant portal to continue."}</p><a className="primary" href={process.env.NEXT_PUBLIC_RESTAURANT_PORTAL_URL || "/"}>{tr ? "Restoran portalını aç" : "Open Restaurant portal"}</a></main>;
  }
  return <main className="center-card"><h1>{t.pending}</h1>{verify ? <p>{tr ? "E-postanızı doğrulayın, ardından bu davet bağlantısına geri dönün." : "Verify your email, then return to this invitation link."}</p> : <form onSubmit={submit}><label>{t.email}<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>{t.password}<input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="error">{error}</p>}<button className="primary">{t.signIn}</button></form>}</main>;
}

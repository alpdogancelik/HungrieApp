import { Link } from "expo-router";
import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { useLocale } from "./providers";
import { unregisterRestaurantPush } from "./push";

export function Shell({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, t } = useLocale();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const links: [[string, string], ...Array<[string, string]>] = [
    ["/dashboard", t.dashboard], ["/orders", t.orders], ["/history", t.history], ["/menu", t.menu],
    ["/restaurant", t.restaurant], ["/reviews", t.reviews], ["/settings", t.settings], ["/security", t.security],
  ];

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function logout() {
    await unregisterRestaurantPush().catch(() => undefined);
    await signOut(auth);
  }

  return <div className="shell">
    <nav className="nav">
      <h2>Hungrie</h2>
      {links.map(([href, label]) => <Link key={href} href={href as never}>{label}</Link>)}
      <button onClick={() => setLocale(locale === "en" ? "tr" : "en")}>{locale.toUpperCase()}</button>
      <button onClick={() => void logout()}>{t.logout}</button>
    </nav>
    <main className="content">
      {!online && <div className="offline-banner" role="alert" aria-live="assertive">
        <strong>{t.offlineTitle}</strong> {t.offlineMessage}
      </div>}
      {children}
    </main>
  </div>;
}

import { Languages } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useLocale } from "../providers";

export function AuthLayout({ children }: PropsWithChildren) {
  const { locale, setLocale, t } = useLocale();
  return <main className="auth-page">
    <header className="auth-topbar"><span className="app-brand"><span className="app-brand__mark">H</span><span><strong>Hungrie</strong><small>Restaurant</small></span></span><button type="button" className="app-language" aria-label={t.language} onClick={() => setLocale(locale === "en" ? "tr" : "en")}><Languages size={17} aria-hidden="true" />{locale.toUpperCase()}</button></header>
    <div className="auth-panel">{children}</div>
  </main>;
}

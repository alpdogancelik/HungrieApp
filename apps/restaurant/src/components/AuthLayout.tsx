import { Languages } from "lucide-react";
import { useRef, type PropsWithChildren } from "react";
import { usePathname } from "expo-router";
import { useLocale } from "../providers";
import { useRouteAccessibility } from "./useRouteAccessibility";

export function AuthLayout({ children }: PropsWithChildren) {
  const { locale, setLocale, t } = useLocale();
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  useRouteAccessibility(pathname, locale, mainRef);
  return <main ref={mainRef} className="auth-page" tabIndex={-1}>
    <header className="auth-topbar"><span className="app-brand"><span className="app-brand__mark">H</span><span><strong>Hungrie</strong><small>Restaurant</small></span></span><button type="button" className="app-language" aria-label={t.language} onClick={() => setLocale(locale === "en" ? "tr" : "en")}><Languages size={17} aria-hidden="true" />{locale.toUpperCase()}</button></header>
    <div className="auth-panel">{children}</div>
  </main>;
}

import { Bell, Languages, LogOut } from "lucide-react";
import { Link, usePathname } from "expo-router";
import { useRef, type PropsWithChildren } from "react";
import { auth } from "../firebase";
import { useLocale } from "../providers";
import { isActiveRestaurantOwner, useRestaurantAccessContext } from "../RestaurantAccessContext";
import { useRestaurantRuntime } from "../RestaurantRuntimeContext";
import { restaurantSignOut } from "../restaurantSignOut";
import { ConnectivityStatus } from "./ConnectivityStatus";
import { earningsNavigation, mobileNavigation, routeIsActive, workspaceNavigation, type NavigationItem } from "./navigation";
import { useRouteAccessibility } from "./useRouteAccessibility";

export function AppShell({ children }: PropsWithChildren) {
  const path = usePathname();
  const { locale, setLocale, t } = useLocale();
  const access = useRestaurantAccessContext();
  const runtime = useRestaurantRuntime();
  const desktopItems = isActiveRestaurantOwner(access) ? [...workspaceNavigation, earningsNavigation] : workspaceNavigation;
  const labels = t.runtimeStatus;
  const role = access?.restaurantRole === "owner" ? t.owner : t.manager;
  const mainRef = useRef<HTMLElement>(null);
  useRouteAccessibility(path, locale, mainRef);

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{t.skipToContent}</a>
    <aside className="app-sidebar">
      <div className="app-brand"><span className="app-brand__mark">H</span><span><strong>Hungrie</strong><small>Restaurant</small></span></div>
      <nav aria-label={t.primaryNavigation}>
        <p className="app-nav__label">{t.workspace}</p>
        {desktopItems.map(item => <NavigationLink key={item.href} item={item} label={t[item.key]} path={path} />)}
      </nav>
      <div className="app-sidebar__footer">
        <span className="app-avatar" aria-hidden="true">{auth.currentUser?.email?.slice(0, 2).toUpperCase() || "HR"}</span>
        <span className="app-account"><strong>{auth.currentUser?.email || t.account}</strong><small>{role}</small></span>
        <button type="button" className="app-icon-button app-icon-button--dark" aria-label={t.logout} onClick={() => void restaurantSignOut()}><LogOut size={18} aria-hidden="true" /></button>
      </div>
    </aside>
    <div className="app-main">
      <header className="app-topbar">
        <div className="app-topbar__identity"><strong>{runtime.dashboard?.restaurant.name || "Hungrie Restaurant"}</strong><ConnectivityStatus status={runtime.status} labels={labels} /></div>
        <Link className="app-icon-button" aria-label={t.settings} href="/settings"><Bell size={20} aria-hidden="true" /></Link>
        <button type="button" className="app-language" aria-label={t.language} onClick={() => setLocale(locale === "en" ? "tr" : "en")}><Languages size={17} aria-hidden="true" />{locale.toUpperCase()}</button>
      </header>
      {runtime.status === "offline" && <div className="app-offline-banner" role="alert"><strong>{t.offlineTitle}</strong> {t.offlineMessage}</div>}
      <main ref={mainRef} id="main-content" className="app-content" tabIndex={-1}>{children}</main>
      <nav className="app-bottom-nav" aria-label={t.mobileNavigation}>
        {mobileNavigation.map(item => <NavigationLink key={item.href} item={item} label={t[item.key]} path={path} bottom />)}
      </nav>
    </div>
  </div>;
}

function NavigationLink({ item, label, path, bottom = false }: { item: NavigationItem; label: string; path: string; bottom?: boolean }) {
  const active = routeIsActive(path, item.href);
  const Icon = item.icon;
  return <Link href={item.href as never} aria-current={active ? "page" : undefined} className={bottom ? "app-bottom-link" : "app-nav-link"} data-active={active || undefined}><span className={bottom ? "app-bottom-link__icon" : undefined}><Icon size={bottom ? 21 : 19} aria-hidden="true" /></span><span>{label}</span></Link>;
}

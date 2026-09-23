import { Bell, BookOpen, CircleDollarSign, Clock3, Languages, LogOut, ShieldCheck, Store } from "lucide-react";
import { Link } from "expo-router";
import { auth } from "../src/firebase";
import { Shell } from "../src/Shell";
import { Card } from "../src/components/Card";
import { PageHeader } from "../src/components/PageHeader";
import { isActiveRestaurantOwner, useRestaurantAccessContext } from "../src/RestaurantAccessContext";
import { useLocale } from "../src/providers";
import { restaurantSignOut } from "../src/restaurantSignOut";

export default function MorePage() {
  const { locale, setLocale, t } = useLocale();
  const access = useRestaurantAccessContext();
  const links = [
    ["/history", t.history, Clock3], ["/restaurant", t.restaurant, Store], ["/reviews", t.reviews, BookOpen],
    ["/settings", t.settings, Bell], ["/security", t.security, ShieldCheck],
    ...(isActiveRestaurantOwner(access) ? [["/earnings", t.earnings, CircleDollarSign] as const] : []),
  ] as const;
  return <Shell><div className="more-page"><PageHeader title={t.more} subtitle={t.secondaryNavigation} />
    <Card className="more-list">{links.map(([href, label, Icon]) => <Link key={href} className="more-row" href={href as never}><span><Icon size={19} aria-hidden="true" /></span><strong>{label}</strong><span aria-hidden="true">›</span></Link>)}</Card>
    <h2 className="more-section-title">{t.accountAndLanguage}</h2>
    <Card className="more-list"><div className="more-row more-row--static"><span className="app-avatar" aria-hidden="true">{auth.currentUser?.email?.slice(0, 2).toUpperCase() || "HR"}</span><span><strong>{auth.currentUser?.email || t.account}</strong><small>{access?.restaurantRole === "owner" ? t.owner : t.manager}</small></span></div>
      <button type="button" className="more-row" onClick={() => setLocale(locale === "en" ? "tr" : "en")}><span><Languages size={19} aria-hidden="true" /></span><strong>{t.language}</strong><span>{locale === "en" ? "Türkçe" : "English"}</span></button>
      <button type="button" className="more-row more-row--danger" onClick={() => void restaurantSignOut()}><span><LogOut size={19} aria-hidden="true" /></span><strong>{t.logout}</strong></button>
    </Card>
  </div></Shell>;
}

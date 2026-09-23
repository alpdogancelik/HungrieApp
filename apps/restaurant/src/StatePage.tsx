import { Clock3, ShieldAlert } from "lucide-react";
import { AuthLayout } from "./components/AuthLayout";
import { Button } from "./components/Button";
import { Card } from "./components/Card";
import { useLocale } from "./providers";
import { restaurantSignOut } from "./restaurantSignOut";

export function StatePage({ kind }: { kind: "pending" | "suspended" }) {
  const { t } = useLocale();
  const Icon = kind === "pending" ? Clock3 : ShieldAlert;
  return <AuthLayout><Card><section className="access-state"><span className="access-state__icon"><Icon aria-hidden="true" /></span><p className="auth-eyebrow">Hungrie Restaurant</p><h1>{kind === "pending" ? t.pendingTitle : t.suspendedTitle}</h1><p>{kind === "pending" ? t.pendingDetail : t.suspended}</p><Button onClick={() => void restaurantSignOut()}>{t.logout}</Button></section></Card></AuthLayout>;
}

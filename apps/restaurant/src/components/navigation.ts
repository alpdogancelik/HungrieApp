import { Bell, BookOpen, CircleDollarSign, Clock3, LayoutDashboard, MoreHorizontal, ShieldCheck, ShoppingBag, Store, UtensilsCrossed, type LucideIcon } from "lucide-react";

export type NavigationItem = { href: string; key: "dashboard" | "orders" | "history" | "menu" | "restaurant" | "reviews" | "settings" | "security" | "earnings" | "more"; icon: LucideIcon };

export const workspaceNavigation: NavigationItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/orders", key: "orders", icon: ShoppingBag },
  { href: "/history", key: "history", icon: Clock3 },
  { href: "/menu", key: "menu", icon: UtensilsCrossed },
  { href: "/restaurant", key: "restaurant", icon: Store },
  { href: "/reviews", key: "reviews", icon: BookOpen },
  { href: "/settings", key: "settings", icon: Bell },
  { href: "/security", key: "security", icon: ShieldCheck },
];

export const earningsNavigation: NavigationItem = { href: "/earnings", key: "earnings", icon: CircleDollarSign };
export const mobileNavigation: NavigationItem[] = [workspaceNavigation[0], workspaceNavigation[1], workspaceNavigation[3], { href: "/more", key: "more", icon: MoreHorizontal }];
export const secondaryPaths = ["/history", "/restaurant", "/reviews", "/settings", "/security", "/earnings"];

export function routeIsActive(path: string, href: string) {
  if (href === "/more") return path === href || secondaryPaths.some(value => path === value || path.startsWith(`${value}/`));
  return path === href || (href !== "/dashboard" && path.startsWith(`${href}/`));
}

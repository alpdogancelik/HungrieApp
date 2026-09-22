import { Link, usePathname, useRouter } from "expo-router";
import { AlertTriangle, Bell, BookOpen, ChevronDown, CircleDollarSign, Clock3, LayoutDashboard, Menu as MenuIcon, MoreHorizontal, ShieldCheck, ShoppingBag, Store, Users, UtensilsCrossed, Wifi } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCopy } from "./copy";
import { useMock } from "./mock-context";
import { breakpoints, colors, radius } from "./theme";
import type { Scenario } from "./types";
import { AppText, ConnectivityBanner, HorizontalChips } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon; concept?: boolean };

function routeItems(locale: "en" | "tr"): { primary: NavItem[]; secondary: NavItem[]; concepts: NavItem[] } {
  const c = getCopy(locale);
  return {
    primary: [
      { href: "/dashboard", label: c.dashboard, icon: LayoutDashboard },
      { href: "/orders", label: c.orders, icon: ShoppingBag },
      { href: "/history", label: c.history, icon: Clock3 },
      { href: "/menu", label: c.menu, icon: UtensilsCrossed },
    ],
    secondary: [
      { href: "/restaurant", label: c.restaurant, icon: Store },
      { href: "/reviews", label: c.reviews, icon: BookOpen },
      { href: "/settings", label: c.alerts, icon: Bell },
      { href: "/security", label: c.security, icon: ShieldCheck },
      { href: "/more", label: c.more, icon: MoreHorizontal },
    ],
    concepts: [
      { href: "/concepts/earnings", label: c.earnings, icon: CircleDollarSign, concept: true },
      { href: "/concepts/staff", label: c.staff, icon: Users, concept: true },
      { href: "/concepts/incidents", label: c.incidents, icon: AlertTriangle, concept: true },
    ],
  };
}

export function AppShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const desktop = width >= breakpoints.desktop;
  const { locale, setLocale, scenario, setScenario } = useMock();
  const path = usePathname();
  const nav = routeItems(locale);
  const c = getCopy(locale);
  const mobile = [nav.primary[0], nav.primary[1], nav.primary[3], nav.secondary[4]];

  return <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
    <View style={styles.shell}>
      {desktop && <View style={styles.sidebar}>
        <View style={styles.brand}><View style={styles.brandMark}><Text style={styles.brandH}>H</Text></View><View><AppText style={{ color: colors.white, fontSize: 19 }} weight="bold">Hungrie</AppText><AppText style={styles.brandSub}>Restaurant</AppText></View></View>
        <ScrollView contentContainerStyle={styles.sideScroll} showsVerticalScrollIndicator={false}>
          <AppText style={styles.navGroup} weight="bold">WORKSPACE</AppText>
          {[...nav.primary, ...nav.secondary.slice(0, 4)].map(item => <SideLink key={item.href} item={item} active={isActive(path, item.href)} />)}
          <AppText style={styles.navGroup} weight="bold">{c.concepts.toUpperCase()}</AppText>
          {nav.concepts.map(item => <SideLink key={item.href} item={item} active={isActive(path, item.href)} />)}
        </ScrollView>
        <View style={styles.sideFooter}><View style={styles.avatar}><AppText weight="bold">AY</AppText></View><View style={{ flex: 1 }}><AppText style={{ color: colors.white }} weight="medium">Aylin Yılmaz</AppText><AppText style={styles.brandSub}>Owner</AppText></View><Pressable accessibilityRole="button" accessibilityLabel={c.language} onPress={() => setLocale(locale === "tr" ? "en" : "tr")} style={styles.lang}><AppText weight="bold" style={{ color: colors.white }}>{locale.toUpperCase()}</AppText></Pressable></View>
      </View>}
      <View style={styles.main}>
        <View style={[styles.topbar, !desktop && styles.topbarMobile]}>
          <View style={{ flex: 1 }}><AppText weight="bold" style={styles.topTitle}>{c.restaurantName}</AppText><View style={styles.connection}><Wifi size={13} color={scenario === "offline" ? colors.red : colors.green} /><AppText style={{ fontSize: 12, color: colors.muted }}>{scenario === "offline" ? c.offline.split(".")[0] : c.connected}</AppText></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel={c.alerts} style={styles.topIcon}><Bell size={19} color={colors.ink} /><View style={styles.dot} /></Pressable>
          {!desktop && <Pressable accessibilityRole="button" accessibilityLabel={c.language} onPress={() => setLocale(locale === "tr" ? "en" : "tr")} style={styles.mobileLang}><AppText weight="bold">{locale.toUpperCase()}</AppText></Pressable>}
        </View>
        <View style={styles.scenarioBar}>
          <AppText style={styles.scenarioLabel} weight="bold">UI STATE</AppText>
          <HorizontalChips>{(["success", "loading", "empty", "error", "offline", "reconnecting", "stale", "permission"] as Scenario[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: scenario === value }} onPress={() => setScenario(value)} style={[styles.scenarioChip, scenario === value && styles.scenarioSelected]}><AppText style={[styles.scenarioText, scenario === value && { color: colors.white }]} weight="medium">{value}</AppText></Pressable>)}</HorizontalChips>
        </View>
        <ScrollView style={styles.pageScroll} contentContainerStyle={[styles.page, !desktop && styles.mobilePage]} keyboardShouldPersistTaps="handled">
          <ConnectivityBanner />
          {children}
        </ScrollView>
        {!desktop && <View style={styles.bottomNav}>{mobile.map(item => <BottomLink key={item.href} item={item} active={isActive(path, item.href)} />)}</View>}
      </View>
    </View>
  </SafeAreaView>;
}

function isActive(path: string, href: string) { return path === href || (href !== "/dashboard" && path.startsWith(`${href}/`)); }

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return <Link href={item.href as never} asChild><Pressable accessibilityRole="link" style={StyleSheet.flatten([styles.sideLink, active && styles.sideActive])}><Icon size={19} color={active ? colors.white : "#AEB7C8"} /><AppText style={[styles.sideLabel, active && { color: colors.white }]} weight={active ? "bold" : "medium"}>{item.label}</AppText>{item.concept && <View style={styles.beta}><AppText style={styles.betaText} weight="bold">UI</AppText></View>}</Pressable></Link>;
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const router = useRouter(); const Icon = item.icon;
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={item.label} onPress={() => router.push(item.href as never)} style={styles.bottomItem}><View style={[styles.bottomIcon, active && { backgroundColor: colors.orangeSoft }]}><Icon size={21} color={active ? colors.orange : colors.mutedSoft} /></View><AppText numberOfLines={1} style={[styles.bottomLabel, active && { color: colors.orange }]} weight="medium">{item.label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, width: "100%", maxWidth: "100%", overflow: "hidden", backgroundColor: colors.ink }, shell: { flex: 1, width: "100%", maxWidth: "100%", overflow: "hidden", flexDirection: "row", backgroundColor: colors.canvas }, sidebar: { width: 258, backgroundColor: colors.ink, paddingHorizontal: 16, paddingTop: 22 }, brand: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, marginBottom: 24 }, brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center" }, brandH: { color: colors.white, fontFamily: "Outfit_700Bold", fontSize: 23 }, brandSub: { color: "#8E99AD", fontSize: 12 }, sideScroll: { paddingBottom: 24 }, navGroup: { color: "#68748A", fontSize: 10, letterSpacing: 1.5, marginTop: 15, marginBottom: 8, marginLeft: 12 }, sideLink: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 3 }, sideActive: { backgroundColor: colors.orange }, sideLabel: { flex: 1, color: "#AEB7C8", fontSize: 14 }, beta: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "#354157" }, betaText: { color: colors.white, fontSize: 9 }, sideFooter: { minHeight: 76, borderTopWidth: 1, borderTopColor: "#27334A", flexDirection: "row", alignItems: "center", gap: 10 }, avatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.orangeSoft, alignItems: "center", justifyContent: "center" }, lang: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  main: { flex: 1, width: 0, minWidth: 0, maxWidth: "100%", overflow: "hidden", backgroundColor: colors.canvas }, topbar: { height: 76, paddingHorizontal: 28, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, topbarMobile: { height: 68, paddingHorizontal: 16 }, topTitle: { fontSize: 16 }, connection: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }, topIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }, dot: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange, top: 9, right: 9, borderWidth: 1.5, borderColor: colors.white }, mobileLang: { minWidth: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  scenarioBar: { minHeight: 52, paddingHorizontal: 28, overflow: "hidden", backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, scenarioLabel: { fontSize: 10, letterSpacing: 1, color: colors.muted }, scenarioChip: { minHeight: 30, borderRadius: radius.pill, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, justifyContent: "center", paddingHorizontal: 10 }, scenarioSelected: { backgroundColor: colors.ink, borderColor: colors.ink }, scenarioText: { fontSize: 11, textTransform: "capitalize" },
  pageScroll: { flex: 1, width: "100%" }, page: { width: "100%", maxWidth: 1560, alignSelf: "center", padding: 28, paddingBottom: 60 }, mobilePage: { padding: 16, paddingBottom: 112 }, bottomNav: { width: "100%", minHeight: 72, paddingBottom: 6, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white, flexDirection: "row" }, bottomItem: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 4 }, bottomIcon: { width: 36, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 11 }, bottomLabel: { fontSize: 10, color: colors.muted, maxWidth: "100%" },
});

// app/(restaurants)/hotnfresh.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCartStore } from "@/store/cart.store";
import Icon from "@/components/Icon";
import { getCategoryLabel as translateCategoryLabel } from "@/src/lib/categoryLabels";

// eslint-disable-next-line @typescript-eslint/no-var-requires
import hotnFreshData from "../../data/hotnfresh-firestore.json";

const RESTAURANT_ID = String(hotnFreshData?.restaurants?.[0]?.id || "hot-n-fresh");

type MenuEntry = {
  id: string;
  name: string;
  description?: string;
  price: number;
  categories?: string[];
};

const formatPrice = (value?: number) => `TRY ${Number(value ?? 0).toFixed(2)}`;

const groupByCategory = (items: MenuEntry[]) => {
  const bucket: Record<string, MenuEntry[]> = {};
  items.forEach((item) => {
    const categories =
      Array.isArray(item.categories) && item.categories.length ? item.categories : ["diger"];
    categories.forEach((cat) => {
      const key = String(cat);
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(item);
    });
  });
  return bucket;
};

const BASE_CATEGORY_ORDER = [
  "menus",
  "wraps",
  "burgers",
  "crispy",
  "snacks",
  "sides",
  "chips",
  "cigkofte",
  "drinks",
];

const sortCategories = (keys: string[]) =>
  [...keys].sort((a, b) => {
    const ia = BASE_CATEGORY_ORDER.indexOf(a);
    const ib = BASE_CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

/** Hot N Fresh theme (fire + charcoal) */
const THEME = {
  bgTop: "#FFF4EA",
  bgMid: "#FFE2CC",
  bgBottom: "#FFFDFB",

  surface: "rgba(255,255,255,0.90)",
  surface2: "rgba(255,250,246,0.92)",
  sheet: "rgba(255,255,255,0.80)",

  ink: "#140805",
  muted: "rgba(20,8,5,0.60)",
  line: "rgba(20,8,5,0.10)",
  lineSoft: "rgba(20,8,5,0.06)",

  hotRed: "#E53935",
  hotRedSoft: "rgba(229,57,53,0.14)",

  hotOrange: "#FF5A1F",
  hotOrangeSoft: "rgba(255,90,31,0.14)",

  amber: "#FFB703",
  amberSoft: "rgba(255,183,3,0.22)",

  coal: "#1B0D08",
  coalSoft: "rgba(27,13,8,0.10)",
};

const shadow = {
  shadowColor: "#000",
  shadowOpacity: Platform.OS === "ios" ? 0.10 : 0.16,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
};

const CardPress = ({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: any;
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [
      styles.cardBase,
      style,
      pressed && onPress ? { transform: [{ scale: 0.992 }], opacity: 0.985 } : null,
    ]}
  >
    {children}
  </Pressable>
);

const MenuList = ({ items, addLabel }: { items: MenuEntry[]; addLabel: string }) => {
  const { addItem } = useCartStore();
  if (!items.length) return null;

  return (
    <View style={styles.menuList}>
      {items.map((item) => (
        <View key={String(item.id)} style={styles.menuCard}>
          <View style={styles.menuAccentRail} />

          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={styles.menuTopRow}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.menuPrice}>{formatPrice(item.price)}</Text>
            </View>

            {item.description ? (
              <Text style={styles.menuDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : (
              <Text style={styles.menuDesc} numberOfLines={1}>
                {" "}
              </Text>
            )}

            <View style={styles.menuBottomRow}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() =>
                  addItem({
                    id: String(item.id),
                    name: item.name,
                    price: Number(item.price || 0),
                    image_url: "",
                    restaurantId: RESTAURANT_ID,
                    customizations: [],
                  })
                }
                style={({ pressed }) => [styles.addPill, pressed ? styles.addPillPressed : null]}
              >
                <Text style={styles.addPillText}>{addLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

export default function HotnFreshPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  const locale = i18n.language?.startsWith("tr") ? "tr" : "en";
  const restaurant = hotnFreshData?.restaurants?.[0] ?? {};
  const menuItems: MenuEntry[] = Array.isArray(hotnFreshData?.menus) ? hotnFreshData.menus : [];

  const grouped = useMemo(() => groupByCategory(menuItems), [menuItems]);
  const categoryKeys = useMemo(() => sortCategories(Object.keys(grouped)), [grouped]);

  const [activeCategory, setActiveCategory] = useState<string>(() => categoryKeys[0] || "");

  useEffect(() => {
    if (!categoryKeys.length) return;
    if (!activeCategory || !categoryKeys.includes(activeCategory)) setActiveCategory(categoryKeys[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKeys.join("|")]);

  const activeItems = activeCategory ? grouped[activeCategory] || [] : menuItems;

  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((acc, it) => acc + it.quantity, 0);

  const scrollRef = useRef<ScrollView>(null);

  const onSelectCategory = (key: string) => {
    setActiveCategory(key);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={[THEME.bgTop, THEME.bgMid, THEME.bgBottom]} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
        >
          {/* HERO */}
          <View style={styles.heroWrap}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => [
                styles.floatingBack,
                pressed ? { transform: [{ scale: 0.96 }], opacity: 0.98 } : null,
              ]}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0.96)", "rgba(255,255,255,0.82)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.floatingBackInner}
              >
                <Icon name="arrowBack" size={20} color={THEME.ink} />
              </LinearGradient>
            </Pressable>

            <View style={styles.heroDecorHotA} pointerEvents="none" />
            <View style={styles.heroDecorHotB} pointerEvents="none" />
            <View style={styles.heroDecorCoal} pointerEvents="none" />

            <CardPress style={styles.heroCard}>
              <View style={styles.heroRow}>
                <View style={styles.logoShell}>
                  <Image
                    source={require("@/assets/restaurantlogo/hotnfreshlogo.jpg")}
                    style={styles.logoImg}
                    contentFit="cover"
                  />
                </View>

                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.heroKicker}>Cero&apos;s Hot N Fresh Fried Chicken</Text>
                  <Text style={styles.heroTitle}>{restaurant.name || "Hot N Fresh"}</Text>
                  <Text style={styles.heroSubtitle}>Popcorn tavuk · Dürüm · Burger menüler</Text>

                  <View style={styles.heroChipRow}>
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>Kalkanlı</Text>
                    </View>
                  </View>
                </View>
              </View>
            </CardPress>
          </View>

          {/* SHEET */}
          <View style={styles.sheetWrap}>
            <View style={styles.sheetCard}>
              {/* Tabs rail (çerçeveli) */}
              <View style={styles.tabRail}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {categoryKeys.map((key) => {
                    const selected = activeCategory === key;
                    const label = translateCategoryLabel(key, locale as any) ?? key;

                    return (
                      <Pressable
                        key={key}
                        onPress={() => onSelectCategory(key)}
                        style={({ pressed }) => [
                          styles.tabPill,
                          selected ? styles.tabPillActive : null,
                          pressed ? { transform: [{ scale: 0.985 }] } : null,
                        ]}
                      >
                        <View style={[styles.tabDot, selected ? styles.tabDotActive : null]} />
                        <Text style={[styles.tabText, selected ? styles.tabTextActive : null]} numberOfLines={1}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Menu */}
              <View style={{ paddingTop: 14 }}>
                <MenuList items={activeItems} addLabel={t("restaurantUi.addToCart")} />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* CART FAB */}
        <Pressable
          onPress={() => router.push("/(tabs)/cart")}
          style={({ pressed }) => [
            styles.cartFab,
            { bottom: 18 + insets.bottom, right: 18 },
            pressed ? { transform: [{ scale: 0.985 }], opacity: 0.99 } : null,
          ]}
        >
          <LinearGradient
            colors={[THEME.hotOrange, THEME.amber]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cartFabInner}
          >
            <View style={styles.cartIconBubble}>
              <Icon name="cart" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.cartFabText}>{t("restaurantUi.cart", { count: cartCount })}</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.bgTop },

  heroWrap: { paddingHorizontal: 16, paddingTop: 14, position: "relative" },

  heroDecorHotA: {
    position: "absolute",
    top: -10,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: THEME.hotRedSoft,
    opacity: 0.95,
  },
  heroDecorHotB: {
    position: "absolute",
    top: 140,
    left: -90,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: THEME.hotOrangeSoft,
    opacity: 0.85,
  },
  heroDecorCoal: {
    position: "absolute",
    top: 70,
    right: 40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: THEME.coalSoft,
    opacity: 0.65,
  },

  cardBase: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.lineSoft,
    backgroundColor: THEME.surface,
    ...shadow,
  },

  heroCard: { padding: 16, overflow: "hidden", zIndex: 1 },

  floatingBack: { position: "absolute", top: 10, left: 10, zIndex: 999, elevation: 30 },
  floatingBackInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.line,
    ...shadow,
  },

  heroRow: { flexDirection: "row", gap: 14, paddingTop: 10 },

  logoShell: {
    width: 86,
    height: 86,
    borderRadius: 22,
    backgroundColor: THEME.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.lineSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: { width: 86, height: 86 },

  heroKicker: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.hotRed, letterSpacing: 0.5 },
  heroTitle: { fontFamily: "ChairoSans", fontSize: 28, color: THEME.ink, letterSpacing: -0.2 },
  heroSubtitle: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.muted, lineHeight: 18 },

  heroChipRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  heroChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(229,57,53,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(229,57,53,0.22)",
  },
  heroChipText: { fontFamily: "ChairoSans", fontSize: 12, color: THEME.hotRed },

  sheetWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22 },
  sheetCard: {
    padding: 12,
    backgroundColor: THEME.sheet,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.lineSoft,
    ...shadow,
  },

  tabRail: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1.2,
    borderColor: "rgba(20,8,5,0.18)",
    padding: 8,
  },
  tabRow: { gap: 10, paddingHorizontal: 6, paddingVertical: 2 },

  tabPill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1.35,
    borderColor: "rgba(20,8,5,0.22)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tabPillActive: {
    backgroundColor: "rgba(255,90,31,0.12)",
    borderColor: "rgba(255,90,31,0.62)",
    borderWidth: 1.8,
  },
  tabDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "rgba(20,8,5,0.22)" },
  tabDotActive: { backgroundColor: THEME.hotOrange },
  tabText: { fontFamily: "ChairoSans", fontSize: 14, color: "rgba(20,8,5,0.72)" },
  tabTextActive: { color: THEME.ink },

  menuList: { gap: 14 },

  menuCard: {
    flexDirection: "row",
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.90)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(20,8,5,0.08)",
    padding: 14,
    ...shadow,
  },

  menuAccentRail: {
    width: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,90,31,0.35)",
    marginRight: 12,
  },

  menuTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  menuTitle: { fontFamily: "ChairoSans", fontSize: 18, color: THEME.ink, flex: 1 },
  menuPrice: { fontFamily: "ChairoSans", fontSize: 16, color: THEME.hotRed, letterSpacing: 0.2 },

  menuDesc: { marginTop: 6, fontFamily: "ChairoSans", fontSize: 13, color: THEME.muted, lineHeight: 18 },

  menuBottomRow: { marginTop: 12, flexDirection: "row", alignItems: "center" },

  addPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,90,31,0.10)",
    borderWidth: 1.2,
    borderColor: "rgba(255,90,31,0.22)",
  },
  addPillPressed: { transform: [{ scale: 0.985 }], opacity: 0.98, borderColor: "rgba(255,90,31,0.40)" },
  addPillText: { fontFamily: "ChairoSans", fontSize: 13, color: THEME.ink, letterSpacing: 0.2 },

  cartFab: { position: "absolute" },
  cartFabInner: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(20,8,5,0.16)",
    ...shadow,
  },
  cartIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(20,8,5,0.88)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  cartFabText: { fontFamily: "ChairoSans", fontSize: 14, color: "#FFFFFF", letterSpacing: 0.2 },
});

// useSearchScreen.ts (UPDATED)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";

import useSearch, { SearchResult, SearchSort } from "@/src/hooks/useSearch";
import { storage } from "@/src/lib/storage";
import { useCartStore } from "@/store/cart.store";

const RECENT_SEARCHES_KEY = "hungrie_search_recents_v2";

export type MealSection = { title: string; data: SearchResult[]; count: number };

/** =======================
 *  Helpers
 *  ======================= */
const normalizeText = (s: any) =>
    String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9ğüşıöç\- ]+/gi, "");

const isBadUri = (u: string) => {
    const v = u.trim().toLowerCase();
    return !v || v === "null" || v === "undefined" || v === "nan";
};

const isValidUri = (u: string) => {
    const v = u.trim();
    if (isBadUri(v)) return false;
    return (
        v.startsWith("http://") ||
        v.startsWith("https://") ||
        v.startsWith("file://") ||
        v.startsWith("content://") ||
        v.startsWith("data:image/")
    );
};

const safeImageUrl = (raw: any) => {
    const s = typeof raw === "string" ? raw : "";
    return isValidUri(s) ? s.trim() : "";
};

const getRestaurantKeyFromItem = (item: any) => {
    const rid =
        item?.restaurantId ??
        item?.restaurant_id ??
        item?.restaurant?.id ??
        item?.restaurant?.$id ??
        item?.restaurantSlug ??
        item?.restaurantCode ??
        item?.restaurantName ??
        item?.restaurant?.name ??
        "";
    const key = normalizeText(rid).replace(/[^a-z0-9]+/g, "");
    return key || "unknown";
};

const getMealKeyFromItem = (item: any, fallback?: string) => {
    const base =
        item?.$id ??
        item?.id ??
        item?.objectID ??
        item?.slug ??
        item?.code ??
        item?.sku ??
        item?.name ??
        fallback ??
        "";
    const key = normalizeText(base).replace(/[^a-z0-9]+/g, "");
    if (key) return key;

    // en kötü senaryo: name + price ile stabil bir anahtar üret
    const name = normalizeText(item?.name).replace(/[^a-z0-9]+/g, "");
    const price = String(Number(item?.price || 0));
    const composed = `${name}-${price}`.replace(/[^a-z0-9]+/g, "");
    return composed || "item";
};

const makeCartId = (item: SearchResult, fallbackIndex = 0) => {
    const r = getRestaurantKeyFromItem(item as any);
    const m = getMealKeyFromItem(item as any, String(fallbackIndex));
    return `${r}::${m}`;
};

export const useSearchScreen = () => {
    const params = useLocalSearchParams<{ query?: string; category?: string }>();
    const {
        query,
        setQuery,
        category,
        setCategory,
        sort,
        setSort,
        results,
        categories,
        restaurants,
        loading,
        restaurantsLoading,
        error,
        refetch,
    } = useSearch({
        initialQuery: typeof params.query === "string" ? params.query : "",
        initialCategory: typeof params.category === "string" ? params.category : undefined,
    });

    const { items, addItem, decreaseQty, removeItem } = useCartStore();
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    // (şimdilik UI kullanmıyor ama dursun)
    const [activeTab, setActiveTab] = useState<"restaurants" | "meals">("restaurants");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
    const [selectedRestaurantName, setSelectedRestaurantName] = useState<string | null>(null);

    useEffect(() => {
        storage.getItem(RECENT_SEARCHES_KEY).then((raw) => {
            if (!raw) return;
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return;
                const cleaned = parsed
                    .map((x) => String(x ?? "").trim())
                    .filter(Boolean)
                    .slice(0, 8);
                setRecentSearches(cleaned);
            } catch {
                // ignore
            }
        });
    }, []);

    const persistRecent = useCallback((term: string) => {
        const normalized = term.trim();
        if (!normalized) return;
        setRecentSearches((prev) => {
            const next = [normalized, ...prev.filter((entry) => entry !== normalized)].slice(0, 8);
            void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const clearRecents = useCallback(() => {
        setRecentSearches([]);
        void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
    }, []);

    const getQuantity = useCallback(
        (id: string) => items.filter((entry) => entry.id === id).reduce((total, entry) => total + entry.quantity, 0),
        [items],
    );

    const handleQuantityChange = useCallback(
        (item: SearchResult, nextValue: number) => {
            // ✅ stabilize cart ID (restaurant + meal key)
            const id = makeCartId(item, 0);

            const current = items
                .filter((entry) => entry.id === id)
                .reduce((total, entry) => total + entry.quantity, 0);

            if (nextValue === current) return;

            if (nextValue > current) {
                const diff = nextValue - current;
                for (let i = 0; i < diff; i += 1) {
                    addItem({
                        id,
                        name: item.name,
                        price: Number(item.price || 0),
                        image_url: safeImageUrl((item as any).image_url || (item as any).imageUrl || (item as any).image || ""),
                        restaurantId: (item as any).restaurantId ? String((item as any).restaurantId) : undefined,
                        customizations: [],
                    });
                }
                return;
            }

            const diff = current - nextValue;
            let remaining = current;
            for (let i = 0; i < diff; i += 1) {
                if (remaining <= 1) {
                    removeItem(id, []);
                    remaining = 0;
                } else {
                    decreaseQty(id, []);
                    remaining -= 1;
                }
            }
        },
        [addItem, decreaseQty, items, removeItem],
    );

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await refetch();
        } finally {
            setRefreshing(false);
        }
    }, [refetch]);

    const filteredResults = useMemo(() => {
        if (!selectedRestaurantId && !selectedRestaurantName) return results;

        const targetId = normalizeText(selectedRestaurantId).replace(/[^a-z0-9]+/g, "");
        const targetName = normalizeText(selectedRestaurantName);

        return results.filter((item) => {
            const rawId = String(
                (item as any).restaurantId ?? (item as any).restaurant_id ?? (item as any).restaurant?.id ?? (item as any).restaurant?.$id ?? "",
            );
            const restaurantId = normalizeText(rawId).replace(/[^a-z0-9]+/g, "");
            const restaurantName = normalizeText(item.restaurantName || (item as any).restaurant?.name || "");

            const idMatch = !!targetId && !!restaurantId && restaurantId === targetId;
            const nameMatch = !!targetName && !!restaurantName && restaurantName === targetName;

            return idMatch || nameMatch;
        });
    }, [results, selectedRestaurantId, selectedRestaurantName]);

    const { restaurantSection, mealSections, totalMeals } = useMemo(() => {
        const grouped = new Map<string, SearchResult[]>();

        filteredResults.forEach((item) => {
            const rawKey = (item.categories?.[0] || "Other").trim() || "Other";
            const key = rawKey;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(item);
        });

        // ✅ daha stabil: count desc, sonra alfabetik
        const meals = Array.from(grouped.entries())
            .map(([title, data]) => ({ title, data, count: data.length }))
            .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.title.localeCompare(b.title)));

        const restaurantsSection =
            restaurants.length > 0
                ? [
                    {
                        title: "Restoranlar",
                        data: restaurants,
                        count: restaurants.length,
                    },
                ]
                : [];

        const totalMealsCount = meals.reduce((sum, s) => sum + s.count, 0);

        return { restaurantSection: restaurantsSection, mealSections: meals, totalMeals: totalMealsCount };
    }, [restaurants, filteredResults]);

    useEffect(() => {
        if (!activeCategory && mealSections.length) {
            setActiveCategory(mealSections[0].title);
        }
        if (activeCategory && !mealSections.some((s) => s.title === activeCategory)) {
            setActiveCategory(mealSections[0]?.title ?? null);
        }
    }, [mealSections, activeCategory]);

    const selectRestaurant = useCallback((restaurant: any) => {
        const rid = restaurant?.id ?? restaurant?.$id ?? restaurant?.slug ?? restaurant?.code ?? restaurant?.name ?? "";
        const id = normalizeText(rid).replace(/[^a-z0-9]+/g, "");
        setSelectedRestaurantId(id || null);
        setSelectedRestaurantName(restaurant?.name || null);
        setActiveCategory(null);
        setActiveTab("meals");
    }, []);

    const clearRestaurantFilter = useCallback(() => {
        setSelectedRestaurantId(null);
        setSelectedRestaurantName(null);
        setActiveCategory(null);
    }, []);

    return {
        query,
        setQuery,
        category,
        setCategory,
        sort,
        setSort,
        categories,
        loading,
        restaurantsLoading,
        error,

        activeTab,
        setActiveTab,

        recentSearches,
        persistRecent,
        clearRecents,

        refreshing,
        handleRefresh,

        restaurantSection,
        mealSections,
        totalMeals,

        activeCategory,
        setActiveCategory,

        selectedRestaurantId,
        selectedRestaurantName,
        selectRestaurant,
        clearRestaurantFilter,

        handleQuantityChange,
        getQuantity,
    };
};

export type UseSearchScreenReturn = ReturnType<typeof useSearchScreen>;

/**
 * 🔥 ÖNEMLİ NOT:
 * Bu dosyada cart için ID formatını `restaurant::meal` yaptık.
 * index.tsx tarafında `resolveMealId(...)` ile oluşturduğun key de aynı olmalı ki
 * getQuantity(id) doğru çalışsın.
 *
 * index.tsx’de resolveMealId’i şu mantığa çek:
 *   const id = `${restaurantKey}::${mealKey}`;
 */

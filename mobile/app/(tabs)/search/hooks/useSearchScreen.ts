import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";

import useSearch, { SearchResult, SearchSort } from "@/src/hooks/useSearch";
import { storage } from "@/src/lib/storage";
import { useCartStore } from "@/store/cart.store";

const RECENT_SEARCHES_KEY = "hungrie_search_recents_v2";

export type MealSection = { title: string; data: SearchResult[]; count: number };

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
    const [activeTab, setActiveTab] = useState<"restaurants" | "meals">("restaurants");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
    const [selectedRestaurantName, setSelectedRestaurantName] = useState<string | null>(null);

    useEffect(() => {
        storage.getItem(RECENT_SEARCHES_KEY).then((raw) => {
            if (!raw) return;
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setRecentSearches(parsed.filter(Boolean));
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

    const handleQuantityChange = useCallback(
        (item: SearchResult, nextValue: number) => {
            const id = String(item.$id ?? item.id);
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
                        image_url: (item as any).image_url || (item as any).imageUrl || "",
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

    const getQuantity = useCallback(
        (id: string) => items.filter((entry) => entry.id === id).reduce((total, entry) => total + entry.quantity, 0),
        [items],
    );

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const { restaurantSection, mealSections, totalMeals } = useMemo(() => {
        const grouped = new Map<string, SearchResult[]>();
        const pool = selectedRestaurantId ? results.filter((item) => String(item.restaurantId) === String(selectedRestaurantId)) : [];
        pool.forEach((item) => {
            const key = (item.categories?.[0] || "Other").trim() || "Other";
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)?.push(item);
        });

        const meals = Array.from(grouped.entries()).map(([title, data]) => ({
            title,
            data,
            count: data.length,
        }));

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
    }, [restaurants, results, selectedRestaurantId]);

    useEffect(() => {
        if (!activeCategory && mealSections.length) {
            setActiveCategory(mealSections[0].title);
        }
        if (activeCategory && !mealSections.some((s) => s.title === activeCategory)) {
            setActiveCategory(mealSections[0]?.title ?? null);
        }
    }, [mealSections, activeCategory]);

    const selectRestaurant = useCallback((restaurant: any) => {
        const id = String(restaurant.id ?? restaurant.$id ?? restaurant.name ?? "");
        setSelectedRestaurantId(id || null);
        setSelectedRestaurantName(restaurant.name || null);
        setActiveTab("meals");
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
        handleQuantityChange,
        getQuantity,
    };
};

export type UseSearchScreenReturn = ReturnType<typeof useSearchScreen>;

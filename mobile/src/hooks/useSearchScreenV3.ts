import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";

import useSearch, { SearchResult } from "@/src/hooks/useSearch";
import { storage } from "@/src/lib/storage";
import { useCartStore } from "@/store/cart.store";

const RECENT_SEARCHES_KEY = "hungrie_search_recents_v3";

export type SearchSegment = "meals" | "restaurants";

const normalizeText = (s: any) =>
    String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9ğüşıöç \-]+/gi, "");

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

const getMealKeyFromItem = (item: any) => {
    const base =
        item?.$id ??
        item?.id ??
        item?.objectID ??
        item?.slug ??
        item?.code ??
        item?.sku ??
        item?.name ??
        "";

    const key = normalizeText(base).replace(/[^a-z0-9]+/g, "");
    if (key) return key;

    const name = normalizeText(item?.name).replace(/[^a-z0-9]+/g, "");
    const price = String(Number(item?.price || 0));
    const composed = `${name}-${price}`.replace(/[^a-z0-9]+/g, "");
    return composed || "item";
};

const makeCartId = (item: SearchResult) => {
    const r = getRestaurantKeyFromItem(item as any);
    const m = getMealKeyFromItem(item as any);
    return `${r}::${m}`;
};

export const useSearchScreenV3 = () => {
    const params = useLocalSearchParams<{ query?: string; category?: string }>();

    const {
        query,
        setQuery,
        category,
        setCategory,
        results,
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

    const [segment, setSegment] = useState<SearchSegment>("meals");
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [refreshing, setRefreshing] = useState(false);

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

    const submitQuery = useCallback(() => {
        const t = query.trim();
        setQuery(t);
        if (t.length >= 2) persistRecent(t);
    }, [persistRecent, query, setQuery]);

    const clearAll = useCallback(() => {
        setQuery("");
        setCategory(undefined);
    }, [setCategory, setQuery]);

    const isFiltering = useMemo(() => query.trim().length > 0 || !!category, [category, query]);

    const mealsFlat = useMemo(() => results, [results]);

    const restaurantsGrid = useMemo(() => {
        const q = normalizeText(query).replace(/[^a-z0-9ğüşıöç \-]+/gi, "").trim();
        if (!q) return restaurants;

        return restaurants.filter((r: any) => {
            const name = normalizeText(r?.name);
            const cuisine = normalizeText(r?.cuisine);
            const cats = Array.isArray(r?.categories) ? normalizeText(r.categories.join(" ")) : "";
            const slug = normalizeText(r?.slug ?? r?.code ?? r?.id ?? r?.$id ?? "");
            return (
                (name && name.includes(q)) ||
                (cuisine && cuisine.includes(q)) ||
                (cats && cats.includes(q)) ||
                (slug && slug.includes(q))
            );
        });
    }, [query, restaurants]);

    const getCartId = useCallback((item: SearchResult) => makeCartId(item), []);

    const getQuantity = useCallback(
        (cartId: string) =>
            items.filter((entry) => entry.id === cartId).reduce((total, entry) => total + entry.quantity, 0),
        [items],
    );

    const handleQuantityChange = useCallback(
        (item: SearchResult, nextValue: number) => {
            const id = makeCartId(item);

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
                        image_url: safeImageUrl(
                            (item as any).image_url ||
                                (item as any).imageUrl ||
                                (item as any).image ||
                                (item as any).photo ||
                                "",
                        ),
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

    return {
        query,
        setQuery,
        category,
        setCategory,
        segment,
        setSegment,
        mealsFlat,
        restaurantsGrid,
        loading,
        restaurantsLoading,
        error,
        refreshing,
        handleRefresh,
        submitQuery,
        clearAll,
        recentSearches,
        persistRecent,
        clearRecents,
        getCartId,
        getQuantity,
        handleQuantityChange,
        isFiltering,
    };
};

export type UseSearchScreenV3Return = ReturnType<typeof useSearchScreenV3>;

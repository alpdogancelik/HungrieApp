import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";

import useSearch, { SearchResult } from "@/src/hooks/useSearch";
import { CATEGORY_CARDS } from "@/src/lib/categoryCards";
import { RECENT_SEARCHES_KEY, clearStoredRecentSearches } from "@/src/lib/recentSearchesStorage";
import { storage } from "@/src/lib/storage";
import { useCartStore } from "@/store/cart.store";

const MAX_RECENT_SEARCHES = 5;

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

const getSingleParam = (value?: string | string[]) => {
    if (Array.isArray(value)) return value[0] ?? "";
    return typeof value === "string" ? value : "";
};

export const useSearchScreenV3 = () => {
    const params = useLocalSearchParams<{ query?: string; category?: string; refresh?: string }>();
    const routeQuery = getSingleParam(params.query);
    const routeCategory = getSingleParam(params.category);
    const routeRefresh = getSingleParam(params.refresh);

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
        clearLoadedData,
    } = useSearch({
        initialQuery: routeQuery,
        initialCategory: routeCategory || undefined,
    });

    const items = useCartStore((state) => state.items);
    const setItemQuantity = useCartStore((state) => state.setItemQuantity);

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
                    .slice(0, MAX_RECENT_SEARCHES);
                setRecentSearches(cleaned);
            } catch {
                // ignore
            }
        });
    }, []);

    useEffect(() => {
        return () => {
            clearLoadedData();
        };
    }, [clearLoadedData]);

    useEffect(() => {
        setQuery(routeQuery);
        setCategory(routeCategory || undefined);
    }, [routeCategory, routeQuery, routeRefresh, setCategory, setQuery]);

    const persistRecent = useCallback((term: string) => {
        const normalized = term.trim();
        if (!normalized) return;

        setRecentSearches((prev) => {
            const normalizedKey = normalizeText(normalized);
            const next = [normalized, ...prev.filter((entry) => normalizeText(entry) !== normalizedKey)].slice(0, MAX_RECENT_SEARCHES);
            void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const removeRecent = useCallback((term: string) => {
        const normalizedKey = normalizeText(term);
        setRecentSearches((prev) => {
            const next = prev.filter((entry) => normalizeText(entry) !== normalizedKey);
            void storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const clearRecents = useCallback(() => {
        setRecentSearches([]);
        void clearStoredRecentSearches();
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

        const requestedCategory = normalizeText(category);
        const searchTerms = new Set([q, requestedCategory].filter(Boolean));
        CATEGORY_CARDS.forEach((card) => {
            const aliases = [card.searchKey, card.tr, card.en].map(normalizeText);
            const categoryMatch = requestedCategory === normalizeText(card.searchKey);
            const queryMatch = q.length >= 2 && aliases.some((alias) => alias.startsWith(q) || q === alias);
            if (categoryMatch || queryMatch) aliases.forEach((alias) => searchTerms.add(alias));
        });
        const matchingMenuRestaurantIds = new Set(
            mealsFlat.map((item) => getRestaurantKeyFromItem(item)).filter((id) => id !== "unknown"),
        );

        return restaurants.filter((r: any) => {
            const name = normalizeText(r?.name);
            const cuisine = normalizeText(r?.cuisine);
            const cats = Array.isArray(r?.categories) ? normalizeText(r.categories.join(" ")) : "";
            const slug = normalizeText(r?.slug ?? r?.code ?? r?.id ?? r?.$id ?? "");
            const restaurantKey = normalizeText(r?.id ?? r?.$id ?? r?.name).replace(/[^a-z0-9]+/g, "");
            return matchingMenuRestaurantIds.has(restaurantKey) || Array.from(searchTerms).some((term) =>
                (name && name.includes(term)) ||
                (cuisine && cuisine.includes(term)) ||
                (cats && cats.includes(term)) ||
                (slug && slug.includes(term)),
            );
        });
    }, [category, mealsFlat, query, restaurants]);

    const getCartId = useCallback((item: SearchResult) => makeCartId(item), []);

    const quantityById = useMemo(() => {
        const quantities = new Map<string, number>();
        items.forEach((entry) => quantities.set(entry.id, (quantities.get(entry.id) ?? 0) + entry.quantity));
        return quantities;
    }, [items]);

    const getQuantity = useCallback((cartId: string) => quantityById.get(cartId) ?? 0, [quantityById]);

    const handleQuantityChange = useCallback(
        (item: SearchResult, nextValue: number) => {
            const id = makeCartId(item);

            setItemQuantity({
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
            }, nextValue);
        },
        [setItemQuantity],
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
        removeRecent,
        clearRecents,
        getCartId,
        getQuantity,
        handleQuantityChange,
        isFiltering,
    };
};

export type UseSearchScreenV3Return = ReturnType<typeof useSearchScreenV3>;

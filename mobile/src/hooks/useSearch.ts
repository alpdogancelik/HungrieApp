import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMenu } from "@/lib/firebaseAuth";
import { getRestaurants } from "@/lib/api";
import { filterMenuForCustomer } from "@/lib/menuVisibility";
import { sampleMenu, sampleRestaurants } from "@/lib/sampleData";
import type { MenuItem } from "@/type";

export type SearchSort = "relevance" | "eta" | "price";

export type SearchResult = MenuItem & {
    restaurantId?: string;
    restaurantName?: string;
    restaurantImage?: string;
    restaurantRating?: number;
    restaurantReviewCount?: number;
    categories?: string[];
};

export type SearchCategory = { id: string; name: string; count: number };

type UseSearchOptions = {
    initialQuery?: string;
    initialCategory?: string;
};

const normalize = (value: unknown) =>
    String(value ?? "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const parsePrice = (item: Partial<MenuItem>) => {
    const raw: unknown = (item as any).price ?? (item as any).cost ?? 0;
    const numeric = typeof raw === "string" ? Number(raw.replace(/[^\d.,-]/g, "").replace(",", ".")) : Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
};

const parseEta = (item: Partial<MenuItem>) => {
    const raw = (item as any).deliveryTime ?? (item as any).eta ?? 30;
    if (typeof raw === "string") {
        const match = raw.match(/\d+/);
        if (match) return Number(match[0]);
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 30;
};

const mergeById = <T,>(items: T[], getId: (item: T) => string) => {
    const map = new Map<string, T>();
    items.forEach((item) => {
        const id = getId(item);
        if (id && !map.has(id)) map.set(id, item);
    });
    return Array.from(map.values());
};

const hydrateResults = (items: MenuItem[], restaurants: any[]): SearchResult[] => {
    const restaurantMap = new Map<string, any>();
    restaurants.forEach((restaurant) => {
        const id = String(restaurant.id ?? restaurant.$id ?? restaurant.name ?? "");
        if (id) restaurantMap.set(id, restaurant);
    });

    return items.map((item) => {
        const restaurantId = String(
            (item as any).restaurantId ?? (item as any).restaurant_id ?? (item as any).restaurant?.id ?? "",
        );
        const restaurant = restaurantId ? restaurantMap.get(restaurantId) : undefined;
        const categoriesRaw = (item as any).categories ?? (item as any).category;
        const categories = Array.isArray(categoriesRaw)
            ? categoriesRaw.map((entry: any) => normalize(entry || "")).filter(Boolean)
            : categoriesRaw
                ? [normalize(categoriesRaw)]
                : [];

        return {
            ...item,
            price: parsePrice(item),
            restaurantId: restaurantId || undefined,
            restaurantName: restaurant?.name ?? (item as any).restaurantName,
            restaurantImage:
                restaurant?.imageUrl ?? restaurant?.image_url ?? restaurant?.logo ?? (item as any).restaurantImage,
            restaurantRating: restaurant?.rating ? Number(restaurant.rating) : undefined,
            restaurantReviewCount: restaurant?.reviewCount ? Number(restaurant.reviewCount) : undefined,
            deliveryTime:
                (item as any).deliveryTime ?? (item as any).eta ?? restaurant?.deliveryTime ?? restaurant?.eta,
            categories,
            image_url: (item as any).image_url ?? (item as any).imageUrl ?? "",
        };
    });
};

const buildCategories = (list: SearchResult[]): SearchCategory[] => {
    const counter: Record<string, number> = {};
    list.forEach((item) => {
        (item.categories || []).forEach((cat) => {
            if (!cat) return;
            counter[cat] = (counter[cat] || 0) + 1;
        });
    });
    return Object.entries(counter)
        .map(([name, count]) => ({ id: name.replace(/\s+/g, "-"), name, count }))
        .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name)));
};

const scoreItem = (item: SearchResult, tokens: string[]) => {
    if (!tokens.length) return 0;
    const haystack = `${normalize(item.name)} ${normalize(item.description)} ${normalize(item.restaurantName)} ${(item.categories || []).join(" ")}`;
    let score = 0;
    tokens.forEach((token) => {
        if (!token) return;
        if (normalize(item.name).startsWith(token)) score += 6;
        if (normalize(item.name).includes(token)) score += 4;
        if (haystack.includes(token)) score += 2;
    });
    return score;
};

export const useSearch = ({ initialQuery = "", initialCategory }: UseSearchOptions = {}) => {
    const [query, setQuery] = useState(initialQuery);
    const [category, setCategory] = useState<string | undefined>(initialCategory);
    const [sort, setSort] = useState<SearchSort>("relevance");
    const [allResults, setAllResults] = useState<SearchResult[]>([]);
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [restaurantsLoading, setRestaurantsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef(0);

    const debouncedQuery = useMemo(() => query.trim(), [query]);

    const fetchResults = useCallback(
        async (term: string) => {
            const requestId = Date.now();
            requestRef.current = requestId;
            setLoading(true);
            setRestaurantsLoading(true);
            setError(null);

            const fallbackMenusRaw = Object.values(sampleMenu || {}).flat() as MenuItem[];
            const fallbackMenus = await filterMenuForCustomer(fallbackMenusRaw);
            const fallbackRestaurants = Array.isArray(sampleRestaurants) ? sampleRestaurants : [];

            try {
                const [menuResult, restaurantResult] = await Promise.allSettled([
                    getMenu({ query: term || undefined }),
                    getRestaurants(term ? { search: term } : undefined),
                ]);

                if (requestRef.current !== requestId) return;

                const apiMenus =
                    menuResult.status === "fulfilled" && Array.isArray(menuResult.value) ? menuResult.value : [];
                const apiRestaurants =
                    restaurantResult.status === "fulfilled" && Array.isArray(restaurantResult.value)
                        ? restaurantResult.value
                        : [];

                const mergedRestaurants = mergeById([...apiRestaurants, ...fallbackRestaurants], (item) =>
                    String((item as any).id ?? (item as any).$id ?? (item as any).name ?? ""),
                );

                const mergedMenus = mergeById(
                    [...apiMenus, ...fallbackMenus],
                    (item) => String((item as any).id ?? (item as any).$id ?? (item as any).name ?? ""),
                );

                setRestaurants(mergedRestaurants);
                setAllResults(hydrateResults(mergedMenus, mergedRestaurants));
            } catch (err: any) {
                if (requestRef.current !== requestId) return;
                setError(err?.message || "Unable to fetch meals. Please try again.");
                setRestaurants(fallbackRestaurants);
                setAllResults(hydrateResults(fallbackMenus, fallbackRestaurants));
            } finally {
                if (requestRef.current === requestId) {
                    setLoading(false);
                    setRestaurantsLoading(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        const timer = setTimeout(() => fetchResults(debouncedQuery), 200);
        return () => clearTimeout(timer);
    }, [debouncedQuery, fetchResults]);

    const results = useMemo(() => {
        const tokens = normalize(query).split(" ").filter(Boolean);
        const categoryToken = category ? normalize(category) : "";

        const filtered = allResults.filter((item) => {
            const haystack = `${normalize(item.name)} ${normalize(item.description)} ${normalize(item.restaurantName)} ${(item.categories || []).join(" ")}`;
            const matchesCategory = categoryToken
                ? (item.categories || []).some((cat) => normalize(cat).includes(categoryToken))
                : true;
            const matchesQuery = !tokens.length || tokens.every((token) => haystack.includes(token));
            return matchesCategory && matchesQuery;
        });

        if (sort === "price") {
            return [...filtered].sort((a, b) => parsePrice(a) - parsePrice(b));
        }
        if (sort === "eta") {
            return [...filtered].sort((a, b) => parseEta(a) - parseEta(b));
        }

        return [...filtered]
            .map((item) => ({ item, score: scoreItem(item, tokens) }))
            .sort((a, b) => {
                if (a.score !== b.score) return b.score - a.score;
                return parseEta(a.item) - parseEta(b.item);
            })
            .map((entry) => entry.item);
    }, [allResults, category, query, sort]);

    const categories = useMemo(() => buildCategories(allResults), [allResults]);

    const updateSort = useCallback((next: SearchSort) => setSort(next), []);

    return {
        query,
        setQuery,
        category,
        setCategory,
        sort,
        setSort: updateSort,
        results,
        allResults,
        categories,
        restaurants,
        loading,
        restaurantsLoading,
        error,
        refetch: () => fetchResults(debouncedQuery),
    };
};

export default useSearch;

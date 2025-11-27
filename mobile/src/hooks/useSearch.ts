import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMenu } from "@/lib/firebaseAuth";
import { getRestaurants } from "@/lib/api";
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

const parsePrice = (item: Partial<MenuItem>) => {
    const raw: unknown = (item as any).price ?? (item as any).cost ?? 0;
    const numeric = typeof raw === "string" ? Number(raw.replace(/[^\d.,-]/g, "").replace(",", ".")) : Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
};

const parseEta = (item: Partial<MenuItem>) => {
    const raw = item.deliveryTime ?? item.eta ?? 30;
    if (typeof raw === "string") {
        const match = raw.match(/\d+/);
        if (match) return Number(match[0]);
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 30;
};

const buildRelevanceScore = (item: SearchResult, term: string) => {
    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();
    const categories = (item.categories || []).join(" ").toLowerCase();
    const restaurant = (item.restaurantName || "").toLowerCase();

    let score = 0;
    if (name.startsWith(term)) score += 6;
    if (name.includes(term)) score += 4;
    if (restaurant.includes(term)) score += 3;
    if (categories.includes(term)) score += 2;
    if (description.includes(term)) score += 1;
    return score;
};

const sortResults = (list: SearchResult[], sort: SearchSort, query: string) => {
    const cloned = [...list];
    if (sort === "price") {
        return cloned.sort((a, b) => parsePrice(a) - parsePrice(b));
    }
    if (sort === "eta") {
        return cloned.sort((a, b) => parseEta(a) - parseEta(b));
    }
    const term = query.trim().toLowerCase();
    if (!term) return cloned;
    return cloned
        .map((item) => ({ item, score: buildRelevanceScore(item, term) }))
        .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return parseEta(a.item) - parseEta(b.item);
        })
        .map((entry) => entry.item);
};

const normalizeCategory = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeCategories = (value: any): string[] => {
    if (Array.isArray(value)) return value.map((entry) => normalizeCategory(String(entry))).filter(Boolean);
    if (typeof value === "string") return [normalizeCategory(value)];
    return [];
};

const deriveCategories = (list: SearchResult[]): SearchCategory[] => {
    const counter: Record<string, number> = {};
    list.forEach((item) => {
        (item.categories || []).forEach((category) => {
            const key = normalizeCategory(category);
            if (!key) return;
            counter[key] = (counter[key] || 0) + 1;
        });
    });
    return Object.entries(counter)
        .map(([name, count]) => ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, count }))
        .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name)));
};

const filterByCategory = (list: SearchResult[], category?: string) => {
    if (!category) return list;
    const term = category.toLowerCase();
    return list.filter((item) => (item.categories || []).some((entry) => entry.toLowerCase().includes(term)));
};

const attachRestaurantMeta = (items: MenuItem[], restaurants: any[]): SearchResult[] => {
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
        const categories = normalizeCategories((item as any).categories ?? (item as any).category);
        return {
            ...item,
            price: parsePrice(item),
            restaurantId: restaurantId || undefined,
            restaurantName: restaurant?.name ?? (item as any).restaurantName,
            restaurantImage: restaurant?.imageUrl ?? restaurant?.image_url ?? restaurant?.logo ?? (item as any).restaurantImage,
            restaurantRating: restaurant?.rating ? Number(restaurant.rating) : undefined,
            restaurantReviewCount: restaurant?.reviewCount ? Number(restaurant.reviewCount) : undefined,
            deliveryTime: (item as any).deliveryTime ?? (item as any).eta ?? restaurant?.deliveryTime ?? restaurant?.eta,
            categories,
            image_url: (item as any).image_url ?? (item as any).imageUrl ?? "",
        };
    });
};

type UseSearchOptions = {
    initialQuery?: string;
    initialCategory?: string;
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

    const params = useMemo(
        () => ({
            query: query.trim() || undefined,
        }),
        [query],
    );

    const results = useMemo(() => {
        const filtered = filterByCategory(allResults, category);
        return sortResults(filtered, sort, query);
    }, [allResults, category, sort, query]);

    const categories = useMemo(() => deriveCategories(allResults), [allResults]);

    const fetchResults = useCallback(async () => {
        const requestId = Date.now();
        requestRef.current = requestId;
        setLoading(true);
        setRestaurantsLoading(true);
        setError(null);
        try {
            const [menuResult, restaurantResult] = await Promise.allSettled([
                getMenu(params),
                getRestaurants(params.query ? { search: params.query } : undefined),
            ]);

            if (requestRef.current !== requestId) return;

            if (restaurantResult.status === "fulfilled") {
                setRestaurants(Array.isArray(restaurantResult.value) ? restaurantResult.value : []);
            } else {
                setRestaurants([]);
                if (__DEV__) console.warn("[Search] restaurant lookup failed.", restaurantResult.reason);
            }

            if (menuResult.status === "fulfilled") {
                const list = Array.isArray(menuResult.value) ? (menuResult.value as MenuItem[]) : [];
                const scopedRestaurants =
                    restaurantResult.status === "fulfilled" && Array.isArray(restaurantResult.value)
                        ? restaurantResult.value
                        : [];
                setAllResults(attachRestaurantMeta(list, scopedRestaurants));
            } else {
                throw menuResult.reason;
            }
        } catch (err: any) {
            if (requestRef.current !== requestId) return;
            setError(err?.message || "Unable to fetch meals. Please try again.");
            setAllResults([]);
        } finally {
            if (requestRef.current === requestId) {
                setLoading(false);
                setRestaurantsLoading(false);
            }
        }
    }, [params]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

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
        refetch: fetchResults,
    };
};

export default useSearch;

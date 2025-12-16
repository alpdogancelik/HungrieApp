import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMenu } from "@/lib/firebaseAuth";
import { getRestaurants } from "@/lib/api";
import { filterMenuForCustomer } from "@/lib/menuVisibility";
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

const TURKISH_FOLD: Record<string, string> = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u",
};

const normalize = (value: unknown) => {
    const lower = String(value ?? "").toLowerCase();
    const folded = lower.replace(/[çğıöşü]/gi, (ch) => TURKISH_FOLD[ch] || ch);

    return folded
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const tokenize = (value: unknown) => normalize(value).split(" ").filter(Boolean);

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
            ? categoriesRaw
                .map((entry: any) => String(entry || "").trim())
                .filter(Boolean)
            : categoriesRaw
                ? [String(categoriesRaw).trim()]
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

type IndexedResult = {
    item: SearchResult;
    nameTokens: string[];
    restaurantTokens: string[];
    categoryTokens: string[];
    tokens: string[];
};

const buildIndex = (items: SearchResult[]): IndexedResult[] =>
    items.map((item) => {
        const nameTokens = tokenize(item.name);
        const descriptionTokens = tokenize(item.description);
        const restaurantTokens = tokenize(item.restaurantName);
        const categoryTokens = (item.categories || []).flatMap((cat) => tokenize(cat));
        const tokens = Array.from(new Set([...nameTokens, ...descriptionTokens, ...restaurantTokens, ...categoryTokens]));
        return { item, nameTokens, restaurantTokens, categoryTokens, tokens };
    });

const isNearMatch = (token: string, candidate: string) => {
    if (!token || !candidate) return false;
    if (token === candidate) return true;
    if (Math.abs(token.length - candidate.length) > 1) return false;

    let i = 0;
    let j = 0;
    let mismatches = 0;

    while (i < token.length && j < candidate.length) {
        if (token[i] === candidate[j]) {
            i += 1;
            j += 1;
            continue;
        }
        mismatches += 1;
        if (mismatches > 1) return false;
        if (token.length > candidate.length) {
            i += 1;
        } else if (candidate.length > token.length) {
            j += 1;
        } else {
            i += 1;
            j += 1;
        }
    }

    return true;
};

const scoreToken = (token: string, candidates: string[]) => {
    let score = 0;
    candidates.forEach((candidate) => {
        if (!candidate) return;
        if (candidate === token) {
            score = Math.max(score, 5);
        } else if (candidate.startsWith(token) || token.startsWith(candidate)) {
            score = Math.max(score, 4);
        } else if (candidate.includes(token)) {
            score = Math.max(score, 3);
        } else if (token.length >= 3 && candidate.length >= 3 && isNearMatch(token, candidate)) {
            score = Math.max(score, 2);
        }
    });
    return score;
};

const scoreIndexedResult = (entry: IndexedResult, tokens: string[], categoryToken: string) => {
    const matchesCategory = categoryToken ? entry.categoryTokens.some((cat) => cat.includes(categoryToken)) : true;
    if (!matchesCategory) return { match: false, score: 0 };
    if (!tokens.length) return { match: true, score: 1 };

    let matchedAll = true;
    let score = 0;

    tokens.forEach((token) => {
        const nameHit = scoreToken(token, entry.nameTokens);
        const restaurantHit = scoreToken(token, entry.restaurantTokens);
        const categoryHit = scoreToken(token, entry.categoryTokens);
        const genericHit = scoreToken(token, entry.tokens);
        const best = Math.max(nameHit * 3, restaurantHit * 2, categoryHit * 1.5, genericHit);
        if (!best) matchedAll = false;
        score += best;
    });

    return { match: matchedAll, score: score + tokens.length * 0.4 };
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

                const mergedRestaurants = mergeById(apiRestaurants, (item) =>
                    String((item as any).id ?? (item as any).$id ?? (item as any).name ?? ""),
                );

                const mergedMenus = mergeById(
                    apiMenus,
                    (item) => String((item as any).id ?? (item as any).$id ?? (item as any).name ?? ""),
                );

                const visibleMenus = await filterMenuForCustomer(mergedMenus);

                setRestaurants(mergedRestaurants);
                setAllResults(hydrateResults(visibleMenus, mergedRestaurants));
            } catch (err: any) {
                if (requestRef.current !== requestId) return;
                setError(err?.message || "Unable to fetch meals. Please try again.");
                setRestaurants([]);
                setAllResults([]);
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

    const indexedResults = useMemo(() => buildIndex(allResults), [allResults]);

    const results = useMemo(() => {
        const tokens = tokenize(query);
        const categoryToken = category ? normalize(category) : "";

        const scored = indexedResults
            .map((entry) => ({ entry, ...scoreIndexedResult(entry, tokens, categoryToken) }))
            .filter((row) => row.match);

        if (sort === "price") {
            return scored
                .sort((a, b) => parsePrice(a.entry.item) - parsePrice(b.entry.item))
                .map((row) => row.entry.item);
        }
        if (sort === "eta") {
            return scored
                .sort((a, b) => parseEta(a.entry.item) - parseEta(b.entry.item))
                .map((row) => row.entry.item);
        }

        return scored
            .sort((a, b) => {
                if (a.score !== b.score) return b.score - a.score;
                return parseEta(a.entry.item) - parseEta(b.entry.item);
            })
            .map((row) => row.entry.item);
    }, [category, indexedResults, query, sort]);

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

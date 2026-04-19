import { useEffect, useMemo, useState } from "react";

import { searchBestFoodImageUrl } from "@/lib/pexels";
import { FoodImageCandidate, getMenuItemImage, MenuItemImageKey } from "@/src/features/restaurantMenu/foodImageResolver";

type UseMenuItemImageInput = {
    name: string;
    category?: string;
    cuisine?: string;
    explicitImageUrl?: string | null;
};

const dedupeCandidates = (candidates: FoodImageCandidate[]) => {
    const seen = new Set<string>();
    const result: FoodImageCandidate[] = [];

    for (const candidate of candidates) {
        if (!candidate?.url || seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        result.push(candidate);
    }

    return result;
};

const MUST_INCLUDE_TOKENS: Partial<Record<MenuItemImageKey, string[]>> = {
    burger_beef: ["burger", "beef"],
    burger_double_beef: ["burger", "beef", "double"],
    burger_chicken: ["burger", "chicken"],
    burger_grilled_chicken: ["burger", "chicken", "grilled"],
    pizza_pepperoni: ["pizza", "pepperoni"],
    pizza_mushroom: ["pizza", "mushroom"],
    pizza_meat: ["pizza", "meat"],
    pizza_bbq: ["pizza", "bbq"],
    pizza_sausage: ["pizza", "sausage"],
    pizza_supreme: ["pizza"],
    fries: ["fries"],
    onion_rings: ["onion", "rings"],
    crispy_chicken: ["chicken"],
    sandwich: ["sandwich"],
    wrap: ["wrap"],
    salad: ["salad"],
    soup: ["soup"],
    gozleme: ["flatbread"],
    chicken_plate: ["chicken"],
    meatball_plate: ["meatball"],
    falafel_plate: ["falafel"],
    sauce: ["sauce"],
    pasta: ["pasta"],
    dessert: ["dessert"],
    drink: ["drink"],
};

export const useMenuItemImage = (input: UseMenuItemImageInput) => {
    const baseResolution = useMemo(
        () =>
            getMenuItemImage({
                name: input.name,
                category: input.category,
                cuisine: input.cuisine,
                explicitImageUrl: input.explicitImageUrl,
            }),
        [input.category, input.cuisine, input.explicitImageUrl, input.name],
    );

    const [pexelsCandidates, setPexelsCandidates] = useState<FoodImageCandidate[]>([]);
    const [isResolvingRemote, setIsResolvingRemote] = useState(false);
    const hasDeterministicCandidate = baseResolution.candidates.some((candidate) => candidate.reason === "item_map" || candidate.reason === "category_map");

    const queryFingerprint = useMemo(() => baseResolution.pexelsQueries.join("|"), [baseResolution.pexelsQueries]);

    useEffect(() => {
        let active = true;

        const resolvePexelsCandidates = async () => {
            if (!baseResolution.pexelsQueries.length) {
                setPexelsCandidates([]);
                setIsResolvingRemote(false);
                return;
            }

            if (hasDeterministicCandidate) {
                setPexelsCandidates([]);
                setIsResolvingRemote(false);
                return;
            }

            setIsResolvingRemote(true);

            const remoteCandidates: FoodImageCandidate[] = [];
            for (const query of baseResolution.pexelsQueries) {
                const tokenKey = baseResolution.itemKey ?? baseResolution.categoryKey;
                const mustInclude = tokenKey ? MUST_INCLUDE_TOKENS[tokenKey] || [] : [];
                const url = await searchBestFoodImageUrl(query, {
                    mustInclude,
                    strict: Boolean(tokenKey),
                });
                if (!url) continue;

                remoteCandidates.push({
                    reason: "pexels",
                    url,
                    key: baseResolution.itemKey ?? baseResolution.categoryKey,
                    query,
                });

                if (remoteCandidates.length >= 2) break;
            }

            if (!active) return;

            setPexelsCandidates(remoteCandidates);
            setIsResolvingRemote(false);
        };

        void resolvePexelsCandidates();
        return () => {
            active = false;
        };
    }, [
        baseResolution.categoryKey,
        baseResolution.itemKey,
        baseResolution.pexelsQueries,
        hasDeterministicCandidate,
        queryFingerprint,
    ]);

    const mergedCandidates = useMemo(() => {
        const explicitCandidate = baseResolution.candidates.find((candidate) => candidate.reason === "explicit");
        const mappedCandidates = baseResolution.candidates.filter((candidate) => candidate.reason !== "explicit");

        if (explicitCandidate) {
            return dedupeCandidates([explicitCandidate, ...mappedCandidates, ...pexelsCandidates]);
        }

        return dedupeCandidates([...mappedCandidates, ...pexelsCandidates]);
    }, [baseResolution.candidates, pexelsCandidates]);

    return {
        ...baseResolution,
        candidates: mergedCandidates,
        bestImageUrl: mergedCandidates[0]?.url ?? null,
        fallbackImageUrl: mergedCandidates[1]?.url ?? null,
        isResolvingRemote,
    };
};

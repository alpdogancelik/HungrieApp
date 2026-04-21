import { useMemo } from "react";

import { FoodImageCandidate, getMenuItemImage } from "@/src/features/restaurantMenu/foodImageResolver";

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

    const mergedCandidates = useMemo(() => {
        const explicitCandidate = baseResolution.candidates.find((candidate) => candidate.reason === "explicit");
        const mappedCandidates = baseResolution.candidates.filter((candidate) => candidate.reason !== "explicit");

        if (explicitCandidate) {
            return dedupeCandidates([explicitCandidate, ...mappedCandidates]);
        }

        return dedupeCandidates(mappedCandidates);
    }, [baseResolution.candidates]);

    return {
        ...baseResolution,
        candidates: mergedCandidates,
        bestImageUrl: mergedCandidates[0]?.url ?? null,
        fallbackImageUrl: mergedCandidates[1]?.url ?? null,
        isResolvingRemote: false,
    };
};

import type { FavoritesRepository } from "@/src/data/contracts";
import { requireSupabase, throwIfError } from "./utils";

export const supabaseFavoritesRepository: FavoritesRepository = {
    isRemoteScope: (scope) => Boolean(scope && scope !== "guest"),
    loadFavorites: async () => {
        const rows = throwIfError(await requireSupabase().from("favorites").select("restaurant_id"));
        return rows.map((row: any) => row.restaurant_id);
    },
    persistFavorites: async (_scope, ids) => {
        const profile = throwIfError(await requireSupabase().from("profiles").select("id").limit(1).maybeSingle());
        const profileId = profile?.id;
        if (!profileId) throw new Error("Profile is required to persist favorites.");
        throwIfError(await requireSupabase().from("favorites").delete().eq("profile_id", profileId));
        if (!ids.length) return;
        throwIfError(
            await requireSupabase().from("favorites").insert(ids.map((restaurantId) => ({ profile_id: profileId, restaurant_id: restaurantId }))),
        );
    },
};

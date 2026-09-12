import type { FavoritesRepository } from "@/src/data/contracts";
import { requireSupabase, throwIfError, withSupabaseAuthRetry } from "./utils";

export const supabaseFavoritesRepository: FavoritesRepository = {
    isRemoteScope: (scope) => Boolean(scope && scope !== "guest"),
    loadFavorites: async () => {
        const rows = await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().from("favorites").select("restaurant_id")));
        return rows.map((row: any) => row.restaurant_id);
    },
    persistFavorites: async (_scope, ids) => {
        await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("replace_my_favorites", { p_restaurant_ids: ids })));
    },
};

import type { FavoritesRepository } from "@/src/data/contracts";
import { requireSupabase, throwIfError, withSupabaseAuthRetry } from "./utils";

export const supabaseFavoritesRepository: FavoritesRepository = {
    isRemoteScope: (scope) => Boolean(scope && scope !== "guest"),
    loadFavorites: async () => {
        return await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("list_my_customer_favorites_v1")));
    },
    persistFavorites: async (_scope, ids) => {
        await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("replace_my_customer_favorites_v1", { p_restaurant_ids: ids })));
    },
};

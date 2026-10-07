import type { FavoritesRepository } from "@/src/data/contracts";
import { withBoundCustomerClient } from "./identityBoundary";
import { throwIfError } from "./utils";

export const supabaseFavoritesRepository: FavoritesRepository = {
    isRemoteScope: (scope) => Boolean(scope && scope !== "guest"),
    loadFavorites: async (scope) => {
        return await withBoundCustomerClient(scope, async (client) => throwIfError(await client.rpc("list_my_customer_favorites_v1")));
    },
    persistFavorites: async (scope, ids) => {
        await withBoundCustomerClient(scope, async (client) => throwIfError(await client.rpc("replace_my_customer_favorites_v1", { p_restaurant_ids: ids })));
    },
};

import type { RestaurantSession } from "@/src/data/contracts";
import { requireSupabase, throwIfError, withSupabaseAuthRetry } from "./utils";

const MEMBERSHIP_COLUMNS = "restaurant_id,role";
const RESTAURANT_COLUMNS = "id,name";

export const getMembershipForFirebaseUser = async (user: { uid: string; email?: string | null } | null): Promise<RestaurantSession | null> => {
    if (!user) return null;
    return withSupabaseAuthRetry(async () => {
        const rows = throwIfError(await requireSupabase().from("my_restaurant_memberships").select(MEMBERSHIP_COLUMNS).limit(2));
        if (!rows.length) return null;
        if (rows.length > 1) throw new Error("This account has more than one restaurant membership.");
        const membership = rows[0];
        const restaurant = throwIfError(await requireSupabase().from("restaurants").select(RESTAURANT_COLUMNS).eq("id", membership.restaurant_id).maybeSingle());
        return {
            userId: user.uid,
            email: user.email || "",
            restaurantId: String(membership.restaurant_id),
            restaurantName: String(restaurant?.name || membership.restaurant_id),
        };
    });
};

import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import type { ProfileRepository } from "@/src/data/contracts";
import i18n from "@/src/lib/i18n";
import { requireSupabase, throwIfError, withSupabaseAuthRetry } from "./utils";

const PROFILE_COLUMNS = "id,name,email,avatar_url,whatsapp_number,preferred_language";

export const getCurrentUser: ProfileRepository["getCurrentUser"] = async () => {
    // Firebase restores native auth persistence asynchronously on a cold
    // launch. Reading currentUser before authStateReady resolves can briefly
    // misclassify a valid session as signed out and discard a notification
    // deep link that requires authenticated Supabase access.
    await auth?.authStateReady?.().catch(() => null);
    const user = auth?.currentUser;
    if (!user) return null;
    return withSupabaseAuthRetry(async () => {
        const id = throwIfError(await requireSupabase().rpc("ensure_my_profile", {
            p_name: user.displayName || user.email || "Hungrie User",
            p_avatar_url: user.photoURL || undefined,
            p_whatsapp_number: undefined,
            p_preferred_language: i18n.language.startsWith("tr") ? "tr" : "en",
        }));
        const row = throwIfError(await requireSupabase().from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle());
        return row
        ? {
              id: row.id,
              accountId: row.id,
              name: row.name,
              email: row.email,
              avatar: row.avatar_url || undefined,
              whatsappNumber: row.whatsapp_number || undefined,
          }
            : null;
    });
};

export const updateUserProfile: ProfileRepository["updateUserProfile"] = async ({ name, whatsappNumber }) => {
    const user = auth?.currentUser;
    const id = await withSupabaseAuthRetry(async () => throwIfError(
        await requireSupabase().rpc("update_my_profile", {
            p_name: name,
            p_avatar_url: user?.photoURL || undefined,
            p_whatsapp_number: whatsappNumber,
            p_preferred_language: i18n.language.startsWith("tr") ? "tr" : "en",
        }),
    ));
    return { id, accountId: id, name, email: user?.email || "", whatsappNumber };
};

export const deleteCurrentUserProfile: ProfileRepository["deleteCurrentUserProfile"] = async () => {
    if (!functions) throw new Error("Account deletion is not configured.");
    await httpsCallable(functions, "deleteHungrieAccount")({});
};

export const supabaseProfileRepository: ProfileRepository = {
    getCurrentUser,
    updateUserProfile,
    deleteCurrentUserProfile,
};

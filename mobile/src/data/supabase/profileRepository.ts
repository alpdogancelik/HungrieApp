import { auth } from "@/lib/firebase";
import type { ProfileRepository } from "@/src/data/contracts";
import { requireSupabase, throwIfError } from "./utils";

export const getCurrentUser: ProfileRepository["getCurrentUser"] = async () => {
    const user = auth?.currentUser;
    if (!user) return null;
    const id = throwIfError(
        await requireSupabase().rpc("ensure_my_profile", {
            p_name: user.displayName || user.email || "Hungrie User",
            p_avatar_url: user.photoURL || undefined,
            p_whatsapp_number: undefined,
            p_preferred_language: "en",
        }),
    );
    const row = throwIfError(await requireSupabase().from("profiles").select("*").eq("id", id).maybeSingle());
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
};

export const updateUserProfile: ProfileRepository["updateUserProfile"] = async ({ name, whatsappNumber }) => {
    const user = auth?.currentUser;
    const id = throwIfError(
        await requireSupabase().rpc("ensure_my_profile", {
            p_name: name,
            p_avatar_url: user?.photoURL || undefined,
            p_whatsapp_number: whatsappNumber,
            p_preferred_language: "en",
        }),
    );
    return { id, accountId: id, name, email: user?.email || "", whatsappNumber };
};

export const deleteCurrentUserProfile: ProfileRepository["deleteCurrentUserProfile"] = async () => {
    throw new Error("Supabase profile deletion is deferred until the account deletion migration milestone.");
};

export const supabaseProfileRepository: ProfileRepository = {
    getCurrentUser,
    updateUserProfile,
    deleteCurrentUserProfile,
};

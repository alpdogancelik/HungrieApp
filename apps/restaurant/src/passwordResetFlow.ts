export type RestaurantPasswordResetOutcome = "accepted" | "rate_limited" | "technical_failure";

const privacyNormalizedCodes = new Set(["auth/user-not-found", "auth/user-disabled"]);

export const requestRestaurantPasswordReset = async ({
  email,
  send,
}: {
  email: string;
  send: (normalizedEmail: string) => Promise<void>;
}): Promise<RestaurantPasswordResetOutcome> => {
  const normalizedEmail = email.trim();
  try {
    await send(normalizedEmail);
    return "accepted";
  } catch (error) {
    const code = String((error as { code?: unknown })?.code || "").toLowerCase();
    if (privacyNormalizedCodes.has(code)) return "accepted";
    if (code === "auth/too-many-requests") return "rate_limited";
    return "technical_failure";
  }
};

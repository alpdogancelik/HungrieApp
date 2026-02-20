export const registerTokenWithBackend = async (userId: string | undefined | null, token: string, platform: string) => {
    // Placeholder for wiring up to backend later
    console.log("[push] registering token", { userId, token, platform });
    await new Promise((resolve) => setTimeout(resolve, 250));
};


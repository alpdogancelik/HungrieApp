export const registerTokenWithBackend = async (userId: string | undefined | null, token: string, platform: string) => {
    // Legacy placeholder retained for compatibility. Never log identity or raw
    // device-token material; the active repository owns registration.
    void userId;
    void token;
    void platform;
    await new Promise((resolve) => setTimeout(resolve, 250));
};

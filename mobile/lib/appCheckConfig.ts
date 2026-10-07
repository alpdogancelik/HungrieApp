type AppCheckInput = {
    environment: string;
    platform: string;
    siteKey?: string;
    debugToken?: string;
};

export const resolveCustomerAppCheckConfig = ({ environment, platform, siteKey = "", debugToken = "" }: AppCheckInput) => {
    const production = environment === "production";
    if (production && debugToken) throw new Error("Production Customer App Check debug mode is forbidden.");
    if (production && platform === "web" && !siteKey) throw new Error("Production Customer web App Check site key is required.");
    return {
        enabled: platform === "web" && Boolean(siteKey),
        siteKey,
        debugToken: production ? "" : debugToken,
    };
};

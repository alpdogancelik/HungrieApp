export type CheckoutQuoteFailure =
    | "restaurant_closed"
    | "customer_access_denied"
    | "minimum_order_not_met"
    | "invalid_menu"
    | "unavailable";

export type MinimumOrderFailureDetails = {
    minimumOrderKurus: number;
    qualifyingSubtotalKurus: number;
};

const parseDetails = (error: unknown): Record<string, unknown> | null => {
    const details = (error as any)?.details;
    if (details && typeof details === "object" && !Array.isArray(details)) return details;
    if (typeof details !== "string") return null;
    try {
        const parsed = JSON.parse(details);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const safeKurus = (value: unknown) => {
    if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
};

export const getMinimumOrderFailureDetails = (error: unknown): MinimumOrderFailureDetails | null => {
    const details = parseDetails(error);
    if (details?.reason !== "MINIMUM_ORDER_NOT_MET") return null;
    const minimumOrderKurus = safeKurus(details.minimum_order_kurus);
    const qualifyingSubtotalKurus = safeKurus(details.qualifying_subtotal_kurus);
    return minimumOrderKurus === null || qualifyingSubtotalKurus === null
        ? null
        : { minimumOrderKurus, qualifyingSubtotalKurus };
};

export const classifyCheckoutQuoteFailure = (error: unknown): CheckoutQuoteFailure => {
    const code = String((error as any)?.code || "");
    const message = String((error as any)?.message || "").toLowerCase();
    if (message.includes("restaurant is not accepting orders")) return "restaurant_closed";
    if (code === "42501" || message.includes("active customer account required")) return "customer_access_denied";
    if (getMinimumOrderFailureDetails(error) || message.includes("minimum order amount not reached")) return "minimum_order_not_met";
    if (code === "22023") return "invalid_menu";
    return "unavailable";
};

export type CheckoutQuoteFailure =
    | "restaurant_closed"
    | "customer_access_denied"
    | "invalid_menu"
    | "unavailable";

export const classifyCheckoutQuoteFailure = (error: unknown): CheckoutQuoteFailure => {
    const code = String((error as any)?.code || "");
    const message = String((error as any)?.message || "").toLowerCase();
    if (message.includes("restaurant is not accepting orders")) return "restaurant_closed";
    if (code === "42501" || message.includes("active customer account required")) return "customer_access_denied";
    if (code === "22023") return "invalid_menu";
    return "unavailable";
};

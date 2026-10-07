const CLOSED_STATUSES = new Set(["closed", "kapalı", "kapali", "inactive", "disabled", "offline"]);

const clockMinutes = (value: unknown) => {
    const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};

/** Customer-facing availability, including the Restaurant panel's manual pause. */
export const isRestaurantOpenForOrdering = (restaurant: any, now = new Date()) => {
    const status = String(restaurant?.status || "").trim().toLowerCase();
    if (
        restaurant?.acceptingOrders === false ||
        restaurant?.accepting_orders === false ||
        restaurant?.isActive === false ||
        restaurant?.isOpen === false ||
        CLOSED_STATUSES.has(status)
    ) return false;

    const opens = clockMinutes(restaurant?.openingTime || restaurant?.opening_time);
    const closes = clockMinutes(restaurant?.closingTime || restaurant?.closing_time);
    if (opens === null || closes === null || opens === closes) return true;
    const current = now.getHours() * 60 + now.getMinutes();
    return opens < closes ? current >= opens && current < closes : current >= opens || current < closes;
};

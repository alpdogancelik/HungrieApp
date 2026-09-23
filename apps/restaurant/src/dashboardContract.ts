import type { RestaurantLifecycleStatus, RestaurantRole } from "@hungrie/domain";

export type RestaurantDashboard = {
  restaurantId: string;
  role: RestaurantRole;
  restaurant: {
    name: string;
    lifecycleStatus: RestaurantLifecycleStatus;
    acceptingOrders: boolean;
    preferredLanguage: "en" | "tr";
  };
  counts: {
    pending: number;
    active: number;
    unreadReviews: number;
  };
  serverTime: string;
};

export class RestaurantDashboardContractError extends Error {
  constructor() {
    super("Invalid Restaurant dashboard response");
    this.name = "RestaurantDashboardContractError";
  }
}

const invalid = (): never => { throw new RestaurantDashboardContractError(); };
const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : invalid();
const exact = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) invalid();
  return value;
};
const text = (value: unknown) => typeof value === "string" && value.trim().length > 0 ? value : invalid();
const boolean = (value: unknown) => typeof value === "boolean" ? value : invalid();
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const choice = <T extends string>(value: unknown, choices: readonly T[]) => choices.includes(value as T) ? value as T : invalid();

export function parseRestaurantDashboard(value: unknown): RestaurantDashboard {
  const root = exact(record(value), ["restaurantId", "role", "restaurant", "counts", "serverTime"]);
  const restaurant = exact(record(root.restaurant), ["name", "lifecycleStatus", "acceptingOrders", "preferredLanguage"]);
  const counts = exact(record(root.counts), ["pending", "active", "unreadReviews"]);
  const serverTime = text(root.serverTime);
  if (Number.isNaN(Date.parse(serverTime))) invalid();
  return {
    restaurantId: text(root.restaurantId),
    role: choice(root.role, ["owner", "manager"] as const),
    restaurant: {
      name: text(restaurant.name),
      lifecycleStatus: choice(restaurant.lifecycleStatus, ["pending", "active", "suspended", "closed"] as const),
      acceptingOrders: boolean(restaurant.acceptingOrders),
      preferredLanguage: choice(restaurant.preferredLanguage, ["en", "tr"] as const),
    },
    counts: {
      pending: count(counts.pending),
      active: count(counts.active),
      unreadReviews: count(counts.unreadReviews),
    },
    serverTime,
  };
}

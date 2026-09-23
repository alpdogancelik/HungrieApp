const intents = new Map<string, string>();
export function stableManagementOperationId(key: string) { let value = intents.get(key); if (!value) { value = crypto.randomUUID(); intents.set(key, value); } return value; }
export function completeManagementIntent(key: string) { intents.delete(key); }
export function resetManagementIntents() { intents.clear(); }

export function replaceByIdentityAndRevision<T extends { id: string }>(current: T[], incoming: T[], revision: (value: T) => number) {
  const previous = new Map(current.map(value => [value.id, value]));
  return incoming.map(value => { const existing = previous.get(value.id); return existing && revision(existing) > revision(value) ? existing : value; });
}

export function changedSettings<T extends Record<string, unknown>>(initial: T, current: T, mapping: Partial<Record<keyof T, string>>, nullable: ReadonlySet<keyof T>) {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(mapping) as (keyof T)[]) {
    if (Object.is(initial[key], current[key])) continue;
    const target = mapping[key]; if (!target) continue;
    const value = current[key];
    changes[target] = nullable.has(key) && value === "" ? null : value;
  }
  return changes;
}

export type RestaurantSettingsForm = { name: string; description: string; cuisine: string; address: string; phone: string; imageUrl: string; preferredLanguage: "en" | "tr"; deliveryEtaMinMinutes: string; deliveryEtaMaxMinutes: string; minimumOrder: string };
const settingsMapping: Partial<Record<keyof RestaurantSettingsForm, string>> = { name: "name", description: "description", cuisine: "cuisine", address: "address", phone: "phone", imageUrl: "image_url", preferredLanguage: "preferred_language", deliveryEtaMinMinutes: "delivery_eta_min_minutes", deliveryEtaMaxMinutes: "delivery_eta_max_minutes", minimumOrder: "minimum_order_kurus" };
const nullableSettings = new Set<keyof RestaurantSettingsForm>(["phone", "imageUrl", "deliveryEtaMinMinutes", "deliveryEtaMaxMinutes"]);
export function normalizeRestaurantSettingsForm(value: RestaurantSettingsForm) {
  const minimum = parseKurus(value.minimumOrder), min = value.deliveryEtaMinMinutes.trim(), max = value.deliveryEtaMaxMinutes.trim();
  return { ...value, name: value.name.trim(), description: value.description.trim(), cuisine: value.cuisine.trim(), address: value.address.trim(), phone: value.phone.trim(), imageUrl: value.imageUrl.trim(), deliveryEtaMinMinutes: min === "" ? "" : String(Number(min)), deliveryEtaMaxMinutes: max === "" ? "" : String(Number(max)), minimumOrder: minimum === null ? value.minimumOrder.trim() : formatKurusInput(minimum) };
}
export function buildRestaurantSettingsChanges(initial: RestaurantSettingsForm, current: RestaurantSettingsForm) {
  const before = normalizeRestaurantSettingsForm(initial), next = normalizeRestaurantSettingsForm(current);
  const min = next.deliveryEtaMinMinutes === "" ? null : Number(next.deliveryEtaMinMinutes), max = next.deliveryEtaMaxMinutes === "" ? null : Number(next.deliveryEtaMaxMinutes), minimum = parseKurus(next.minimumOrder);
  if (!next.name || (min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0)) || (min !== null && max !== null && min > max) || minimum === null) return null;
  const changes = changedSettings(before, next, settingsMapping, nullableSettings);
  if ("delivery_eta_min_minutes" in changes) changes.delivery_eta_min_minutes = min;
  if ("delivery_eta_max_minutes" in changes) changes.delivery_eta_max_minutes = max;
  if ("minimum_order_kurus" in changes) changes.minimum_order_kurus = minimum;
  return changes;
}
import { formatKurusInput, parseKurus } from "./managementContract";

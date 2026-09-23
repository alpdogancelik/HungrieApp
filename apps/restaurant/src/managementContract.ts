export type MenuCategory = { id: string; restaurantId: string; name: string; description: string; icon: string | null; active: boolean; sortOrder: number };
export type MenuItem = { id: string; restaurantId: string; categoryId: string; name: string; description: string; imageUrl: string | null; priceKurus: number; active: boolean; sortOrder: number; definitionRevision: number };
export type MenuIngredient = { id: string; restaurantId: string; menuItemId: string; name: string; removable: boolean; sortOrder: number; active: boolean };
export type MenuOptionGroup = { id: string; restaurantId: string; menuItemId: string; name: string; kind: "size" | "modifier" | "extra"; minimumSelections: number; maximumSelections: number; sortOrder: number; active: boolean };
export type MenuOption = { id: string; restaurantId: string; groupId: string; name: string; priceDeltaKurus: number; sortOrder: number; active: boolean };
export type MenuSnapshot = { restaurantId: string; categories: MenuCategory[]; items: MenuItem[]; ingredients: MenuIngredient[]; groups: MenuOptionGroup[]; options: MenuOption[] };

export type RestaurantSettings = {
  id: string; name: string; description: string; cuisine: string; address: string; phone: string | null; imageUrl: string | null;
  deliveryEtaMinMinutes: number | null; deliveryEtaMaxMinutes: number | null; minimumOrderKurus: number;
  openingHours: Record<string, unknown>; preferredLanguage: "en" | "tr"; lifecycleStatus: "pending" | "active" | "suspended" | "closed"; acceptingOrders: boolean;
};

export class RestaurantManagementContractError extends Error {
  constructor() { super("Invalid Restaurant management response"); this.name = "RestaurantManagementContractError"; }
}
const invalid = (): never => { throw new RestaurantManagementContractError(); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const exact = (value: Record<string, unknown>, keys: readonly string[]) => { if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) invalid(); return value; };
const text = (value: unknown, allowEmpty = false) => typeof value === "string" && value.trim() === value && (allowEmpty || value.length > 0) ? value : invalid();
const nullableText = (value: unknown) => value === null ? null : text(value);
const integer = (value: unknown, minimum = 0) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : invalid();
const nullableInteger = (value: unknown) => value === null ? null : integer(value);
const bool = (value: unknown) => typeof value === "boolean" ? value : invalid();
const choice = <T extends string>(value: unknown, choices: readonly T[]) => choices.includes(value as T) ? value as T : invalid();
const timestamp = (value: unknown) => { const result = text(value); if (Number.isNaN(Date.parse(result))) invalid(); return result; };
const unique = <T extends { id: string }>(rows: T[]) => { if (new Set(rows.map(row => row.id)).size !== rows.length) invalid(); return rows; };

const CATEGORY_KEYS = ["id", "restaurant_id", "name", "description", "icon", "is_active", "sort_order", "created_at", "updated_at"] as const;
const ITEM_KEYS = ["id", "restaurant_id", "category_id", "name", "description", "image_url", "price_kurus", "cost_kurus", "is_active", "sort_order", "eta_minutes", "calories", "protein_grams", "rating_average", "rating_count", "customizations", "created_at", "updated_at", "definition_revision"] as const;
const INGREDIENT_KEYS = ["id", "restaurant_id", "menu_item_id", "name", "removable", "sort_order", "is_active", "created_at", "updated_at"] as const;
const GROUP_KEYS = ["id", "restaurant_id", "menu_item_id", "name", "kind", "minimum_selections", "maximum_selections", "sort_order", "is_active", "created_at", "updated_at"] as const;
const OPTION_KEYS = ["id", "restaurant_id", "group_id", "name", "price_delta_kurus", "sort_order", "is_active", "created_at", "updated_at"] as const;

function category(value: unknown): MenuCategory { const row = exact(object(value), CATEGORY_KEYS); timestamp(row.created_at); timestamp(row.updated_at); return { id: text(row.id), restaurantId: text(row.restaurant_id), name: text(row.name), description: text(row.description, true), icon: row.icon === null ? null : text(row.icon), active: bool(row.is_active), sortOrder: integer(row.sort_order) }; }
function item(value: unknown): MenuItem { const row = exact(object(value), ITEM_KEYS); timestamp(row.created_at); timestamp(row.updated_at); if (!Array.isArray(row.customizations)) invalid(); return { id: text(row.id), restaurantId: text(row.restaurant_id), categoryId: text(row.category_id), name: text(row.name), description: text(row.description, true), imageUrl: row.image_url === null ? null : text(row.image_url), priceKurus: integer(row.price_kurus), active: bool(row.is_active), sortOrder: integer(row.sort_order), definitionRevision: integer(row.definition_revision, 1) }; }
function ingredient(value: unknown): MenuIngredient { const row = exact(object(value), INGREDIENT_KEYS); timestamp(row.created_at); timestamp(row.updated_at); return { id: text(row.id), restaurantId: text(row.restaurant_id), menuItemId: text(row.menu_item_id), name: text(row.name), removable: bool(row.removable), sortOrder: integer(row.sort_order), active: bool(row.is_active) }; }
function group(value: unknown): MenuOptionGroup { const row = exact(object(value), GROUP_KEYS); timestamp(row.created_at); timestamp(row.updated_at); const minimumSelections = integer(row.minimum_selections), maximumSelections = integer(row.maximum_selections, 1); if (minimumSelections > maximumSelections) invalid(); return { id: text(row.id), restaurantId: text(row.restaurant_id), menuItemId: text(row.menu_item_id), name: text(row.name), kind: choice(row.kind, ["size", "modifier", "extra"] as const), minimumSelections, maximumSelections, sortOrder: integer(row.sort_order), active: bool(row.is_active) }; }
function option(value: unknown): MenuOption { const row = exact(object(value), OPTION_KEYS); timestamp(row.created_at); timestamp(row.updated_at); return { id: text(row.id), restaurantId: text(row.restaurant_id), groupId: text(row.group_id), name: text(row.name), priceDeltaKurus: integer(row.price_delta_kurus), sortOrder: integer(row.sort_order), active: bool(row.is_active) }; }

export function parseMenuSnapshot(value: unknown): MenuSnapshot {
  const root = exact(object(value), ["restaurantId", "categories", "items", "ingredients", "groups", "options"]);
  const restaurantId = text(root.restaurantId);
  if (![root.categories, root.items, root.ingredients, root.groups, root.options].every(Array.isArray)) invalid();
  const result: MenuSnapshot = {
    restaurantId,
    categories: unique((root.categories as unknown[]).map(category)),
    items: unique((root.items as unknown[]).map(item)),
    ingredients: unique((root.ingredients as unknown[]).map(ingredient)),
    groups: unique((root.groups as unknown[]).map(group)),
    options: unique((root.options as unknown[]).map(option)),
  };
  const categoryIds = new Set(result.categories.map(row => row.id)), itemIds = new Set(result.items.map(row => row.id)), groupIds = new Set(result.groups.map(row => row.id));
  if ([...result.categories, ...result.items, ...result.ingredients, ...result.groups, ...result.options].some(row => row.restaurantId !== restaurantId)) invalid();
  if (result.items.some(row => !categoryIds.has(row.categoryId)) || result.ingredients.some(row => !itemIds.has(row.menuItemId)) || result.groups.some(row => !itemIds.has(row.menuItemId)) || result.options.some(row => !groupIds.has(row.groupId))) invalid();
  return result;
}

export function parseRestaurantSettings(value: unknown): RestaurantSettings {
  const row = exact(object(value), ["id", "name", "description", "cuisine", "address", "phone", "imageUrl", "deliveryEtaMinMinutes", "deliveryEtaMaxMinutes", "minimumOrderKurus", "openingHours", "preferredLanguage", "lifecycleStatus", "acceptingOrders"]);
  const min = nullableInteger(row.deliveryEtaMinMinutes), max = nullableInteger(row.deliveryEtaMaxMinutes); if (min !== null && max !== null && min > max) invalid();
  return { id: text(row.id), name: text(row.name), description: text(row.description, true), cuisine: text(row.cuisine, true), address: text(row.address, true), phone: nullableText(row.phone), imageUrl: nullableText(row.imageUrl), deliveryEtaMinMinutes: min, deliveryEtaMaxMinutes: max, minimumOrderKurus: integer(row.minimumOrderKurus), openingHours: object(row.openingHours), preferredLanguage: choice(row.preferredLanguage, ["en", "tr"] as const), lifecycleStatus: choice(row.lifecycleStatus, ["pending", "active", "suspended", "closed"] as const), acceptingOrders: bool(row.acceptingOrders) };
}

export function parseKurus(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized); if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
export const formatKurusInput = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

export function buildMenuMediaPath(restaurantId: string, fileName: string, operationId: string) {
  const tenant = text(restaurantId), operation = text(operationId);
  if (tenant.includes("/") || operation.includes("/")) invalid();
  const safeName = fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-120) || "image";
  return `${tenant}/${operation}-${safeName}`;
}

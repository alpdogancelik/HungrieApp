import { parseHistoryOrderPage, type HistoryOrderPage } from "./orders/orderContract";
import { buildMenuMediaPath, parseMenuSnapshot, parseRestaurantSettings, type MenuSnapshot, type RestaurantSettings } from "./managementContract";
import { supabase } from "./supabase";

const timeoutMs = 12000;
async function rpc<T>(name: string, args: Record<string, unknown>, parse: (value: unknown) => T, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(); externalSignal?.addEventListener("abort", abort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await supabase.rpc(name as never, args as never).abortSignal(controller.signal);
    if (result.error) throw result.error;
    return parse(result.data);
  } finally { clearTimeout(timer); externalSignal?.removeEventListener("abort", abort); }
}

const identity = <T>(value: unknown) => value as T;
export const restaurantManagementRepository = {
  listHistory(cursor: string | null, limit = 25, signal?: AbortSignal): Promise<HistoryOrderPage> {
    return rpc("restaurant_list_orders_v1", { p_queue: "history", p_cursor: cursor, p_limit: Math.min(50, Math.max(1, limit)) }, parseHistoryOrderPage, signal);
  },
  getMenu(signal?: AbortSignal): Promise<MenuSnapshot> { return rpc("restaurant_get_menu_v2", {}, parseMenuSnapshot, signal); },
  saveCategory(input: { id?: string; name: string; description: string; icon: string | null; active: boolean }, operationId: string) {
    return rpc("restaurant_save_category_v1", { p_category_id: input.id || "", p_name: input.name.trim(), p_description: input.description.trim(), p_icon: input.icon, p_active: input.active, p_operation_id: operationId }, identity);
  },
  reorderCategories(ids: string[], operationId: string) { return rpc("restaurant_reorder_categories_v1", { p_category_ids: ids, p_operation_id: operationId }, identity); },
  reorderItems(categoryId: string, ids: string[], operationId: string) { return rpc("restaurant_reorder_menu_items_v1", { p_category_id: categoryId, p_item_ids: ids, p_operation_id: operationId }, identity); },
  setAvailability(ids: string[], active: boolean, operationId: string) { return rpc("restaurant_bulk_set_item_availability_v1", { p_item_ids: ids, p_active: active, p_operation_id: operationId }, identity); },
  saveItem(definition: Record<string, unknown>, operationId: string) { return rpc("restaurant_save_menu_item_v2", { p_definition: definition, p_operation_id: operationId }, identity); },
  async uploadMenuImage(restaurantId: string, file: File, operationId: string) {
    const path = buildMenuMediaPath(restaurantId, file.name, operationId);
    const result = await supabase.storage.from("restaurant-media").upload(path, file, { contentType: file.type, upsert: false });
    if (result.error) throw result.error;
    return { path, publicUrl: supabase.storage.from("restaurant-media").getPublicUrl(path).data.publicUrl };
  },
  async removeNewMenuImage(path: string) {
    const result = await supabase.storage.from("restaurant-media").remove([path]); if (result.error) throw result.error;
  },
  getSettings(signal?: AbortSignal): Promise<RestaurantSettings> { return rpc("restaurant_get_settings_v1", {}, parseRestaurantSettings, signal); },
  updateSettings(changes: Record<string, unknown>, operationId: string, signal?: AbortSignal): Promise<RestaurantSettings> {
    return rpc("restaurant_update_settings_v1", { p_changes: changes, p_operation_id: operationId }, parseRestaurantSettings, signal);
  },
};

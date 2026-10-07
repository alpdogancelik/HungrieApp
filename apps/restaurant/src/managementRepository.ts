import { parseHistoryOrderPage, type HistoryOrderPage } from "./orders/orderContract";
import { callRestaurantFunction, restaurantFunctionNames } from "./firebase";
import { parseMenuSnapshot, parseRestaurantSettings, type MenuSnapshot, type RestaurantSettings } from "./managementContract";
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
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
export const restaurantManagementRepository = {
  listHistory(cursor: string | null, search = "", limit = 25, signal?: AbortSignal): Promise<HistoryOrderPage> {
    return rpc("restaurant_list_orders_v2", { p_queue: "history", p_cursor: cursor, p_search: search || null, p_limit: Math.min(50, Math.max(1, limit)) }, parseHistoryOrderPage, signal);
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
    // restaurantId is intentionally not sent: the trusted boundary derives the
    // tenant from current canonical account state.
    void restaurantId;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await callRestaurantFunction<{ path: string; publicUrl: string; mime: string; width: number; height: number; replayed: boolean }>(restaurantFunctionNames.uploadMedia, { operationId, declaredMime: file.type, bytesBase64: bytesToBase64(bytes) });
    return { path: result.path, publicUrl: result.publicUrl };
  },
  getSettings(signal?: AbortSignal): Promise<RestaurantSettings> { return rpc("restaurant_get_settings_v1", {}, parseRestaurantSettings, signal); },
  updateSettings(changes: Record<string, unknown>, operationId: string, signal?: AbortSignal): Promise<RestaurantSettings> {
    return rpc("restaurant_update_settings_v1", { p_changes: changes, p_operation_id: operationId }, parseRestaurantSettings, signal);
  },
};

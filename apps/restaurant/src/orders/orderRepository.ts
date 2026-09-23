import { parseActiveOrderPage, parseRestaurantOrder, type ActiveOrderPage, type CancellationReason, type OrderStatus, type RestaurantOrder } from "./orderContract";
import { supabase } from "../supabase";

const timeoutMs = 12000;
async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: any }>, externalSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await run(controller.signal);
    if (result.error) throw result.error;
    return result.data as T;
  } finally { clearTimeout(timer); externalSignal?.removeEventListener("abort", abort); }
}

export const restaurantOrderRepository = {
  async listActive(cursor: string | null = null, limit = 50, externalSignal?: AbortSignal): Promise<ActiveOrderPage> {
    const raw = await withTimeout<unknown>(signal => supabase.rpc("restaurant_list_orders_v1" as never, { p_queue: "active", p_cursor: cursor, p_limit: Math.min(50, Math.max(1, limit)) } as never).abortSignal(signal), externalSignal);
    return parseActiveOrderPage(raw);
  },
  async get(orderId: string, externalSignal?: AbortSignal): Promise<RestaurantOrder> {
    const raw = await withTimeout<unknown>(signal => supabase.rpc("restaurant_get_order_v1" as never, { p_order_id: orderId } as never).abortSignal(signal), externalSignal);
    return parseRestaurantOrder(raw);
  },
  acknowledge(orderId: string, version: string, operationId: string) {
    return withTimeout<unknown>(signal => supabase.rpc("restaurant_acknowledge_order_seen_v1" as never, { p_order_id: orderId, p_order_version: version, p_operation_id: operationId } as never).abortSignal(signal));
  },
  transition(orderId: string, expectedVersion: string, target: OrderStatus, operationId: string) {
    return withTimeout<unknown>(signal => supabase.rpc("restaurant_transition_order_v1" as never, { p_order_id: orderId, p_expected_version: expectedVersion, p_new_status: target, p_reason_code: null, p_note: null, p_operation_id: operationId } as never).abortSignal(signal));
  },
  cancel(orderId: string, expectedVersion: string, reason: CancellationReason, message: string, operationId: string) {
    return withTimeout<unknown>(signal => supabase.rpc("restaurant_cancel_order_v2" as never, { p_order_id: orderId, p_expected_version: expectedVersion, p_reason_code: reason, p_customer_message: message, p_operation_id: operationId } as never).abortSignal(signal));
  },
};

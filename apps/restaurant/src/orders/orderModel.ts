import type { CancellationReason, OrderStatus, RestaurantOrder } from "./orderContract";

export const nextOrderStatus = (status: OrderStatus): OrderStatus | null => status === "pending" ? "preparing" : status === "preparing" ? "ready" : status === "ready" ? "out_for_delivery" : status === "out_for_delivery" ? "delivered" : null;

export function replaceOrdersMonotonically(previous: RestaurantOrder[], incoming: RestaurantOrder[]) {
  const byId = new Map(previous.map(order => [order.id, order]));
  return incoming.map(order => {
    const old = byId.get(order.id);
    return old && Date.parse(old.updated_at) >= Date.parse(order.updated_at) ? old : order;
  });
}

export type MutationIntent = { key: string; operationId: string; orderId: string; expectedVersion: string; target: OrderStatus; reason: CancellationReason | null; message: string };
const mutationIntents = new Map<string, MutationIntent>();

export function getMutationIntent(input: Omit<MutationIntent, "key" | "operationId">): MutationIntent {
  const key = JSON.stringify([input.orderId, input.expectedVersion, input.target, input.reason, input.message]);
  const existing = mutationIntents.get(key);
  if (existing) return existing;
  const intent = { ...input, key, operationId: crypto.randomUUID() };
  mutationIntents.set(key, intent);
  return intent;
}

export function discardMutationIntent(intent: MutationIntent) { mutationIntents.delete(intent.key); }

export type Reconciliation = "success" | "conflict" | "unknown";
export function classifyMutationResult(before: RestaurantOrder, after: RestaurantOrder, target: OrderStatus): Reconciliation {
  if (after.status === target) return "success";
  if (after.updated_at !== before.updated_at || after.status !== before.status) return "conflict";
  return "unknown";
}

export type MutationFailureKind = "conflict" | "denied" | "known" | "unknown";
export function mutationFailureKind(error: unknown): MutationFailureKind {
  if (!error || typeof error !== "object") return "unknown";
  const code = (error as { code?: unknown }).code;
  if (code === "40001") return "conflict";
  if (code === "42501") return "denied";
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? "known" : "unknown";
}

export function deadlineRemainingMs(deadline: string, clientNow: number, dashboardServerTime?: string, dashboardReconciledAt?: number | null) {
  const offset = dashboardServerTime && dashboardReconciledAt ? Date.parse(dashboardServerTime) - dashboardReconciledAt : 0;
  return Date.parse(deadline) - (clientNow + offset);
}

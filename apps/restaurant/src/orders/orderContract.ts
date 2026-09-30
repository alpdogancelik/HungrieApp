export const ACTIVE_ORDER_STATUSES = ["pending", "preparing", "ready", "out_for_delivery"] as const;
export const ORDER_STATUSES = [...ACTIVE_ORDER_STATUSES, "delivered", "canceled"] as const;
export const CANCELLATION_REASONS = ["too_busy", "item_unavailable", "closing", "equipment_issue", "delivery_unavailable", "other"] as const;

export type ActiveOrderStatus = typeof ACTIVE_ORDER_STATUSES[number];
export type OrderStatus = typeof ORDER_STATUSES[number];
export type CancellationReason = typeof CANCELLATION_REASONS[number];

export type RestaurantOrderItem = {
  id: string;
  menu_item_id: string;
  source_menu_item_id: string | null;
  name: string;
  image_url: string | null;
  unit_price_kurus: number;
  customization_total_kurus: number;
  quantity: number;
  customizations: unknown[];
};

export type RestaurantOrder = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  status: OrderStatus;
  cancellation_reason_code?: string;
  payment_method: "cash" | "pos";
  notes?: string;
  subtotal_kurus: number;
  delivery_fee_kurus: number;
  service_fee_kurus: number;
  discount_kurus: number;
  tip_kurus: number;
  total_kurus: number;
  eta_minutes: number;
  approval_deadline_at?: string;
  reminder_pending: boolean;
  reminder_requested_at?: string;
  preparing_at?: string;
  ready_at?: string;
  out_for_delivery_at?: string;
  delivered_at?: string;
  canceled_at?: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_email?: string;
  customer_whatsapp?: string;
  delivery_address_snapshot?: unknown;
  items: RestaurantOrderItem[];
};

export type ActiveOrderPage = { items: RestaurantOrder[]; has_more: boolean; next_cursor: string | null };
export type HistoryOrderPage = { items: RestaurantOrder[]; has_more: boolean; next_cursor: string | null };

export class RestaurantOrderContractError extends Error {
  constructor() { super("Invalid Restaurant order response"); this.name = "RestaurantOrderContractError"; }
}

const invalid = (): never => { throw new RestaurantOrderContractError(); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const allowed = (value: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value;
};
const required = (value: Record<string, unknown>, keys: readonly string[]) => { if (keys.some(key => !(key in value))) invalid(); return value; };
const text = (value: unknown) => typeof value === "string" && value.trim() === value && value.length > 0 ? value : invalid();
const optionalText = (value: unknown) => value === undefined ? undefined : text(value);
const timestamp = (value: unknown) => { const result = text(value); if (Number.isNaN(Date.parse(result))) invalid(); return result; };
const optionalTimestamp = (value: unknown) => value === undefined ? undefined : timestamp(value);
const integer = (value: unknown, minimum = 0) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : invalid();
const boolean = (value: unknown) => typeof value === "boolean" ? value : invalid();
const choice = <T extends string>(value: unknown, values: readonly T[]) => values.includes(value as T) ? value as T : invalid();

const ITEM_KEYS = ["id", "menu_item_id", "source_menu_item_id", "name", "image_url", "unit_price_kurus", "customization_total_kurus", "quantity", "customizations"] as const;
const ORDER_KEYS = ["id", "restaurant_id", "restaurant_name", "status", "cancellation_reason_code", "payment_method", "notes", "subtotal_kurus", "delivery_fee_kurus", "service_fee_kurus", "discount_kurus", "tip_kurus", "total_kurus", "eta_minutes", "approval_deadline_at", "reminder_pending", "reminder_requested_at", "preparing_at", "ready_at", "out_for_delivery_at", "delivered_at", "canceled_at", "created_at", "updated_at", "customer_name", "customer_email", "customer_whatsapp", "delivery_address_snapshot", "items"] as const;
const ORDER_REQUIRED = ["id", "restaurant_id", "restaurant_name", "status", "payment_method", "subtotal_kurus", "delivery_fee_kurus", "service_fee_kurus", "discount_kurus", "tip_kurus", "total_kurus", "eta_minutes", "reminder_pending", "created_at", "updated_at", "items"] as const;

function parseItem(value: unknown): RestaurantOrderItem {
  const row = required(allowed(object(value), ITEM_KEYS), ITEM_KEYS.filter(key => key !== "image_url"));
  const customizations = Array.isArray(row.customizations) ? row.customizations : invalid();
  return {
    id: text(row.id), menu_item_id: text(row.menu_item_id), source_menu_item_id: row.source_menu_item_id === null ? null : text(row.source_menu_item_id), name: text(row.name),
    image_url: row.image_url === null || row.image_url === undefined ? null : text(row.image_url),
    unit_price_kurus: integer(row.unit_price_kurus), customization_total_kurus: integer(row.customization_total_kurus),
    quantity: integer(row.quantity, 1), customizations,
  };
}

export function parseRestaurantOrder(value: unknown): RestaurantOrder {
  const row = required(allowed(object(value), ORDER_KEYS), ORDER_REQUIRED);
  const items = Array.isArray(row.items) ? row.items.map(parseItem) : invalid();
  const itemIds = new Set(items.map(item => item.id));
  if (itemIds.size !== items.length) invalid();
  return {
    id: text(row.id), restaurant_id: text(row.restaurant_id), restaurant_name: text(row.restaurant_name),
    status: choice(row.status, ORDER_STATUSES), cancellation_reason_code: optionalText(row.cancellation_reason_code),
    payment_method: choice(row.payment_method, ["cash", "pos"] as const), notes: optionalText(row.notes),
    subtotal_kurus: integer(row.subtotal_kurus), delivery_fee_kurus: integer(row.delivery_fee_kurus), service_fee_kurus: integer(row.service_fee_kurus),
    discount_kurus: integer(row.discount_kurus), tip_kurus: integer(row.tip_kurus), total_kurus: integer(row.total_kurus), eta_minutes: integer(row.eta_minutes),
    approval_deadline_at: optionalTimestamp(row.approval_deadline_at), reminder_pending: boolean(row.reminder_pending), reminder_requested_at: optionalTimestamp(row.reminder_requested_at),
    preparing_at: optionalTimestamp(row.preparing_at), ready_at: optionalTimestamp(row.ready_at), out_for_delivery_at: optionalTimestamp(row.out_for_delivery_at),
    delivered_at: optionalTimestamp(row.delivered_at), canceled_at: optionalTimestamp(row.canceled_at), created_at: timestamp(row.created_at), updated_at: timestamp(row.updated_at),
    customer_name: optionalText(row.customer_name), customer_email: optionalText(row.customer_email), customer_whatsapp: optionalText(row.customer_whatsapp),
    delivery_address_snapshot: row.delivery_address_snapshot, items,
  };
}

export function parseActiveOrderPage(value: unknown): ActiveOrderPage {
  const root = required(allowed(object(value), ["items", "has_more", "next_cursor"]), ["items", "has_more", "next_cursor"]);
  const items = Array.isArray(root.items) ? root.items.map(parseRestaurantOrder) : invalid();
  if (items.some(item => !ACTIVE_ORDER_STATUSES.includes(item.status as ActiveOrderStatus))) invalid();
  const ids = new Set(items.map(item => item.id));
  if (ids.size !== items.length) invalid();
  return { items, has_more: boolean(root.has_more), next_cursor: root.next_cursor === null ? null : text(root.next_cursor) };
}

export function parseHistoryOrderPage(value: unknown): HistoryOrderPage {
  const root = required(allowed(object(value), ["items", "has_more", "next_cursor"]), ["items", "has_more", "next_cursor"]);
  const items = Array.isArray(root.items) ? root.items.map(parseRestaurantOrder) : invalid();
  if (items.some(item => item.status !== "delivered" && item.status !== "canceled")) invalid();
  if (new Set(items.map(item => item.id)).size !== items.length) invalid();
  return { items, has_more: boolean(root.has_more), next_cursor: root.next_cursor === null ? null : text(root.next_cursor) };
}

export function normalizeCancellationMessage(value: string) {
  const message = value.trim();
  if (message.length > 500 || /[^\S\r\n\t]*[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) invalid();
  return message;
}

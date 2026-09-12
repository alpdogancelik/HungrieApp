export type Delivery = {
  delivery_id: string;
  event_id: string;
  event_type: "order_status" | "restaurant_new_order" | "restaurant_reminder" | "review_reply";
  order_id?: string | null;
  review_id?: string | null;
  expected_status?: string | null;
  token: string;
  platform: "ios" | "android";
  preferred_language?: string | null;
  restaurant_name?: string | null;
};

export const retryableExpoCodes = new Set(["TOO_MANY_REQUESTS", "MessageRateExceeded"]);
export const permanentExpoCodes = new Set([
  "DeviceNotRegistered", "InvalidCredentials", "MismatchSenderId", "MessageTooBig",
]);

const copy = {
  en: {
    restaurant_new_order: ["New order", "A new order is waiting for approval."],
    restaurant_reminder: ["Order reminder", "A customer is waiting for order approval."],
    review_reply: ["Restaurant replied", "A restaurant replied to your review."],
    pending: ["Order received", "Your order is waiting for restaurant approval."],
    preparing: ["Order accepted", "Your order is being prepared."],
    ready: ["Order ready", "Your order is ready for courier pickup."],
    out_for_delivery: ["Order on the way", "Your order is out for delivery."],
    delivered: ["Order delivered", "Enjoy your meal."],
    canceled: ["Order canceled", "Your order was canceled."],
  },
  tr: {
    restaurant_new_order: ["Yeni sipariş", "Onay bekleyen yeni bir sipariş var."],
    restaurant_reminder: ["Sipariş hatırlatması", "Bir müşteri sipariş onayı bekliyor."],
    review_reply: ["Restoran yanıtladı", "Restoran değerlendirmene yanıt verdi."],
    pending: ["Sipariş alındı", "Siparişin restoran onayı bekliyor."],
    preparing: ["Sipariş onaylandı", "Siparişin hazırlanıyor."],
    ready: ["Sipariş hazır", "Siparişin kurye teslimi için hazır."],
    out_for_delivery: ["Sipariş yolda", "Siparişin teslimat için yola çıktı."],
    delivered: ["Sipariş teslim edildi", "Afiyet olsun."],
    canceled: ["Sipariş iptal edildi", "Siparişin iptal edildi."],
  },
} as const;

export const buildExpoMessage = (delivery: Delivery) => {
  const language = delivery.preferred_language === "tr" ? "tr" : "en";
  const key = delivery.event_type === "order_status"
    ? (delivery.expected_status || "pending")
    : delivery.event_type;
  const [title, body] = (copy[language] as Record<string, readonly [string, string]>)[key] ||
    (copy[language] as Record<string, readonly [string, string]>).pending;
  const isRestaurant = delivery.event_type === "restaurant_new_order" || delivery.event_type === "restaurant_reminder";
  return {
    to: delivery.token,
    title,
    body: delivery.restaurant_name && delivery.event_type === "order_status"
      ? `${delivery.restaurant_name}: ${body}`
      : body,
    sound: isRestaurant ? "hungrie.wav" : "default",
    channelId: isRestaurant ? "orders" : "order-status",
    priority: "high",
    collapseId: `${delivery.event_type}:${delivery.order_id || delivery.review_id || delivery.event_id}`,
    data: {
      eventId: delivery.event_id,
      type: delivery.event_type,
      ...(delivery.order_id ? { orderId: delivery.order_id } : {}),
      ...(delivery.review_id ? { reviewId: delivery.review_id } : {}),
    },
  };
};

export const classifyHttpFailure = (status: number) => status === 429 || status >= 500 ? "retry" : "permanent";

export const classifyExpoError = (code?: string | null) => {
  if (code && retryableExpoCodes.has(code)) return "retry";
  return "permanent";
};

export const sanitizeError = (value: unknown) => String(value instanceof Error ? value.message : value || "Unknown error")
  .replace(/(Expo|Exponent)PushToken\[[^\]]+\]/g, "[push-token]")
  .slice(0, 300);

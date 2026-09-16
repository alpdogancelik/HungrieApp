export type CustomerCancellationReasonCode =
    | "too_busy"
    | "item_unavailable"
    | "closing"
    | "equipment_issue"
    | "delivery_unavailable"
    | "approval_deadline_expired"
    | "customer_canceled"
    | "support_canceled"
    | "other";

const ENGLISH: Record<CustomerCancellationReasonCode, string> = {
    too_busy: "The restaurant is currently too busy.",
    item_unavailable: "An item in your order is unavailable.",
    closing: "The restaurant is closing.",
    equipment_issue: "The restaurant has an equipment problem.",
    delivery_unavailable: "Delivery is currently unavailable.",
    approval_deadline_expired: "The restaurant did not respond in time.",
    customer_canceled: "You canceled this order.",
    support_canceled: "Hungrie Support canceled this order.",
    other: "The restaurant canceled this order.",
};

const TURKISH: Record<CustomerCancellationReasonCode, string> = {
    too_busy: "Restoran şu anda çok yoğun.",
    item_unavailable: "Siparişindeki bir ürün mevcut değil.",
    closing: "Restoran kapanıyor.",
    equipment_issue: "Restoranda ekipman sorunu var.",
    delivery_unavailable: "Teslimat şu anda kullanılamıyor.",
    approval_deadline_expired: "Restoran zamanında yanıt vermedi.",
    customer_canceled: "Bu siparişi sen iptal ettin.",
    support_canceled: "Sipariş Hungrie Destek tarafından iptal edildi.",
    other: "Restoran bu siparişi iptal etti.",
};

export const getCancellationReasonText = (value: unknown, isTurkish: boolean) => {
    const normalized = String(value || "").trim() as CustomerCancellationReasonCode;
    const messages = isTurkish ? TURKISH : ENGLISH;
    return messages[normalized] || messages.other;
};

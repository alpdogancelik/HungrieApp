export type PanelOrderItem = {
    name?: string;
    quantity?: number;
    price?: number;
};

export type PanelOrderStatus =
    | "pending"
    | "accepted"
    | "out_for_delivery"
    | "canceled"
    | "rejected"
    | "delivered"
    | string;

export type PanelOrder = {
    id: string;
    customer: string;
    items: PanelOrderItem[];
    status: PanelOrderStatus;
    time: string;
    createdAtMs: number;
    whatsapp?: string;
    address?: string;
    note?: string;
    paymentMethod?: string;
    total: number;
    reminderPending?: boolean;
    reminderRequestedAtMs?: number;
};

type FirestoreTimestampLike = {
    toDate?: () => Date;
    seconds?: number;
    nanoseconds?: number;
};

const toMillis = (value: unknown): number => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    const timestamp = value as FirestoreTimestampLike;
    if (typeof timestamp.toDate === "function") return timestamp.toDate().getTime();
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
    return 0;
};

const toTextTime = (createdAtMs: number) => {
    if (!createdAtMs) return "Just now";
    return new Date(createdAtMs).toLocaleString();
};

export const normalizePanelOrderStatus = (status: unknown): PanelOrderStatus => {
    const raw = String(status || "pending").trim().toLowerCase();
    if (raw === "pending approval" || raw === "awaiting_confirmation") return "pending";
    if (raw === "declined") return "rejected";
    if (raw === "cancelled") return "canceled";
    if (raw === "preparing" || raw === "ready") return "accepted";
    if (raw === "rejected") return "rejected";
    if (
        raw === "accepted" ||
        raw === "pending" ||
        raw === "out_for_delivery" ||
        raw === "canceled" ||
        raw === "delivered"
    ) {
        return raw;
    }
    return raw || "pending";
};

const asTrimmedText = (value: unknown): string => {
    if (typeof value !== "string") return "";
    return value.trim();
};

const pickFirstNonEmpty = (values: unknown[]): string => {
    for (const value of values) {
        const text = asTrimmedText(value);
        if (text) return text;
    }
    return "";
};

const resolveOrderNote = (order: any): string => {
    const nestedNotesObject = order?.notes && typeof order.notes === "object" ? order.notes : null;

    return pickFirstNonEmpty([
        // Common direct fields
        order?.note,
        order?.notes,
        order?.orderNote,
        order?.customerNote,
        order?.customerNotes,
        order?.restaurantNote,
        order?.restaurantNotes,
        order?.specialInstructions,
        order?.specialInstruction,
        order?.extraNote,
        order?.noteText,
        order?.deliveryNote,
        // Nested alternatives seen in older/orderly payloads
        order?.meta?.note,
        order?.meta?.orderNote,
        order?.delivery?.note,
        order?.delivery?.notes,
        nestedNotesObject?.text,
        nestedNotesObject?.message,
        nestedNotesObject?.customer,
        nestedNotesObject?.restaurant,
    ]);
};

export const mapFirestoreOrder = (order: any): PanelOrder => {
    const createdAtMs = Number(order?.createdAtMs || 0) || toMillis(order?.createdAt || order?.updatedAt || Date.now());
    const resolvedNote = resolveOrderNote(order);

    return {
        id: String(order?.id || ""),
        customer: order?.customerName || order?.customer?.name || "Customer",
        items: Array.isArray(order?.items)
            ? order.items
            : Array.isArray(order?.orderItems)
              ? order.orderItems
              : [],
        status: normalizePanelOrderStatus(order?.status),
        time: toTextTime(createdAtMs),
        createdAtMs,
        whatsapp: order?.customerWhatsapp || order?.customer?.whatsappNumber || "",
        address: order?.deliveryAddressText || order?.address || "",
        note: resolvedNote,
        paymentMethod: order?.paymentMethod || "N/A",
        total: Number(order?.total || 0),
        reminderPending: Boolean(order?.reminderPending),
        reminderRequestedAtMs: toMillis(order?.reminderRequestedAt) || Number(order?.reminderRequestedAtMs || 0),
    };
};

export const sortOrdersDesc = <T extends { createdAtMs: number }>(list: T[]) =>
    [...list].sort((a, b) => b.createdAtMs - a.createdAtMs);

export const filterOrders = (
    orders: PanelOrder[],
    statusFilter: "all" | "pending" | "accepted" | "canceled" | "delivered",
    searchTerm: string,
) => {
    const normalized = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
        const orderStatus = normalizePanelOrderStatus(order.status);
        const statusMatch =
            statusFilter === "all" ||
            orderStatus === statusFilter ||
            (statusFilter === "accepted" && orderStatus === "out_for_delivery") ||
            (statusFilter === "canceled" && orderStatus === "rejected");
        if (!statusMatch) return false;
        if (!normalized) return true;
        return order.customer.toLowerCase().includes(normalized);
    });
};

import { memo, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import cn from "clsx";
import type { OrderStatus, RestaurantOrder } from "@/type";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    pending: "Pending",
    preparing: "Preparing",
    ready: "Ready",
    out_for_delivery: "On the way",
    delivered: "Delivered",
    canceled: "Canceled",
};

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
    pending: "preparing",
    preparing: "ready",
    ready: "out_for_delivery",
    out_for_delivery: "delivered",
    delivered: null,
    canceled: null,
};

export const ORDER_STATUS_COLORS: Record<
    OrderStatus,
    { text: string; dot: string; bg: string }
> = {
    pending: { text: "#f97316", dot: "#fed7aa", bg: "rgba(249,115,22,0.08)" },
    preparing: { text: "#d97706", dot: "#fde68a", bg: "rgba(217,119,6,0.08)" },
    ready: { text: "#059669", dot: "#bbf7d0", bg: "rgba(5,150,105,0.08)" },
    out_for_delivery: { text: "#0284c7", dot: "#bae6fd", bg: "rgba(2,132,199,0.08)" },
    delivered: { text: "#475569", dot: "#e2e8f0", bg: "rgba(71,85,105,0.08)" },
    canceled: { text: "#dc2626", dot: "#fecaca", bg: "rgba(220,38,38,0.08)" },
};

const formatTimestamp = (value?: string) => {
    if (!value) return "Az önce güncellendi";
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

type Props = {
    order: RestaurantOrder;
    variant?: "restaurant" | "customer";
    onAdvance?: (orderId: string, nextStatus: OrderStatus) => void;
    disableActions?: boolean;
};

const OrderCard = ({ order, variant = "restaurant", onAdvance, disableActions = false }: Props) => {
    const status = ((order.status as OrderStatus) || "pending") as OrderStatus;
    const badge = ORDER_STATUS_COLORS[status];
    const nextStatus = ORDER_STATUS_FLOW[status];
    const orderId = useMemo(() => String(order.$id ?? order.id ?? Date.now()), [order.$id, order.id]);
    const items = order.orderItems ?? [];
    const total = Number(order.total || 0).toFixed(2);
    const headerTitle = variant === "restaurant" ? order.customerName || "Walk-in guest" : order.restaurant?.name || "Hungrie";
    const headerSubtitle =
        variant === "restaurant" ? order.address || "Campus pickup" : formatTimestamp(order.updatedAt);
    const contactWhatsapp = order.customerWhatsapp || order.customer?.whatsappNumber || (order as any)?.customer?.whatsapp;
    const contactEmail = order.customerEmail || order.customer?.email;

    return (
        <View className="bg-white rounded-3xl border border-gray-100 p-4 gap-3 shadow-md shadow-black/5">
            <View className="flex-row items-center justify-between">
                <View className="gap-1 flex-1 mr-3">
                    <Text className="paragraph-semibold text-dark-100">{headerTitle}</Text>
                    <Text className="body-medium text-dark-60" numberOfLines={2}>{headerSubtitle}</Text>
                    {variant === "restaurant" && (
                        <>
                            {contactWhatsapp ? (
                                <Text className="caption text-dark-60" numberOfLines={1}>WhatsApp: {contactWhatsapp}</Text>
                            ) : null}
                            {contactEmail ? (
                                <Text className="caption text-dark-60" numberOfLines={1}>{contactEmail}</Text>
                            ) : null}
                        </>
                    )}
                </View>
                <View
                    className="px-3 py-1 rounded-full flex-row items-center gap-2"
                    style={{ backgroundColor: badge.bg }}
                    accessibilityRole="text"
                    accessibilityLabel={`Sipariş durumu ${ORDER_STATUS_LABELS[status]}`}
                >
                    <View className="size-2 rounded-full" style={{ backgroundColor: badge.dot }} />
                    <Text className="paragraph-semibold" style={{ color: badge.text }}>
                        {ORDER_STATUS_LABELS[status]}
                    </Text>
                </View>
            </View>

            <View className="gap-1">
                {items.slice(0, 3).map((item, index) => (
                    <Text key={`${orderId}-${index}`} className="body-medium text-dark-80">
                        {item?.quantity || 1}x {item?.name || "Menu item"}
                    </Text>
                ))}
                {items.length > 3 && (
                    <Text className="body-medium text-dark-40">+{items.length - 3} ürün daha</Text>
                )}
            </View>

            <View className="flex-row items-center justify-between pt-2">
                <View>
                    <Text className="paragraph-semibold text-dark-80">Toplam</Text>
                    <Text className="h3-bold text-dark-100">TRY {total}</Text>
                </View>
                {variant === "restaurant" && nextStatus ? (
                    <TouchableOpacity
                        className={cn(
                            "px-4 py-2 rounded-full border",
                            disableActions ? "bg-gray-100 border-gray-200" : "bg-primary/10 border-primary"
                        )}
                        disabled={disableActions}
                        onPress={() => onAdvance?.(orderId, nextStatus)}
                    >
                        <Text className={cn("paragraph-semibold", disableActions ? "text-dark-60" : "text-primary")}>
                            {ORDER_STATUS_LABELS[nextStatus]} olarak işaretle
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <Text className="paragraph-semibold text-primary">
                        {status === "delivered" ? "Tamamlandı" : status === "canceled" ? "İptal edildi" : "Hazırlanıyor"}
                    </Text>
                )}
            </View>
        </View>
    );
};

export default memo(OrderCard);

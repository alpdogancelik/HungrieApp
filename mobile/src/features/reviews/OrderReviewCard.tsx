import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { OrderReview, OrderReviewItemSnapshot } from "@/src/domain/types";
import { submitOrderReview } from "@/src/services/orderReviews";
import OrderReviewSheet from "@/src/features/reviews/OrderReviewSheet";

type OrderReviewCardProps = {
    order: any;
    reviewed: boolean;
    userName?: string;
    onReviewSaved?: (review: OrderReview) => void;
};

const toMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value === "object" && "seconds" in value) {
        return Number(value.seconds || 0) * 1000 + Number(value.nanoseconds || 0) / 1_000_000;
    }
    const parsed = new Date(value);
    const ms = parsed.getTime();
    return Number.isNaN(ms) ? 0 : ms;
};

const formatDate = (value: any) => {
    const ms = toMillis(value);
    if (!ms) return "-";
    return new Date(ms).toLocaleString();
};

const formatCurrency = (value?: number | string) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const normalizeOrderItems = (order: any): OrderReviewItemSnapshot[] => {
    const rawItems = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
    return rawItems
        .map((item: any) => {
            const name = String(item?.name || "").trim();
            if (!name) return null;
            return {
                menuItemId: String(item?.menuItemId || item?.itemId || item?.id || "").trim() || undefined,
                name,
                quantity: Math.max(1, Number(item?.quantity || 1)),
                price: Number.isFinite(Number(item?.price)) ? Number(item?.price) : undefined,
                imageUrl: String(item?.imageUrl || item?.image_url || "").trim() || undefined,
            } as OrderReviewItemSnapshot;
        })
        .filter(Boolean) as OrderReviewItemSnapshot[];
};

const OrderReviewCard = ({ order, reviewed, userName, onReviewSaved }: OrderReviewCardProps) => {
    const [sheetVisible, setSheetVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const orderId = String(order?.id || "").trim();
    const restaurantName = String(order?.restaurant?.name || order?.restaurantName || order?.restaurantId || "Restoran");
    const itemsSnapshot = useMemo(() => normalizeOrderItems(order), [order]);
    const itemsSummary = itemsSnapshot.length
        ? itemsSnapshot.map((item) => `${Number(item.quantity || 1)}x ${item.name}`).join(" - ")
        : "Urun bilgisi yok";

    const handleSubmit = async (payload: { ratings: { speed: 1 | 2 | 3 | 4 | 5; taste: 1 | 2 | 3 | 4 | 5; value: 1 | 2 | 3 | 4 | 5 }; comment?: string }) => {
        if (!orderId || reviewed) return;
        try {
            setSubmitting(true);
            setSubmitError(null);
            const saved = await submitOrderReview({
                orderId,
                userName,
                ratings: payload.ratings,
                comment: payload.comment,
            });
            onReviewSaved?.(saved);
            setSheetVisible(false);
            Alert.alert("Tesekkurler", "Siparis degerlendirmeniz kaydedildi.");
        } catch (error: any) {
            const message = error?.message || "Lutfen tekrar deneyin.";
            setSubmitError(message);
            Alert.alert("Degerlendirme kaydedilemedi", message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.card}>
            <View style={styles.headRow}>
                <Text style={styles.title}>{restaurantName}</Text>
                <View style={[styles.statePill, reviewed ? styles.statePillDone : styles.statePillPending]}>
                    <Text style={[styles.stateText, reviewed ? styles.stateTextDone : styles.stateTextPending]}>
                        {reviewed ? "Değerlendirildi" : "Değerlendirilmedi"}
                    </Text>
                </View>
            </View>

            <Text style={styles.meta}>{`Sipariş: #${orderId || "-"}`}</Text>
            <Text style={styles.meta}>{`Tarih: ${formatDate(order?.updatedAt || order?.createdAt || order?.createdAtMs)}`}</Text>
            <Text style={styles.meta}>{`Toplam: ${formatCurrency(order?.total)}`}</Text>
            <Text style={styles.summary}>{itemsSummary}</Text>

            <View style={styles.actionRow}>
                {reviewed ? (
                    <View style={styles.doneButton}>
                        <Text style={styles.doneButtonText}>Değerlendirildi</Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={() => {
                            setSubmitError(null);
                            setSheetVisible(true);
                        }}
                        style={styles.reviewButton}
                    >
                        <Text style={styles.reviewButtonText}>Siparişi değerlendir</Text>
                    </TouchableOpacity>
                )}
            </View>

            <OrderReviewSheet
                visible={sheetVisible}
                submitting={submitting}
                items={itemsSnapshot}
                errorText={submitError}
                onClose={() => {
                    if (submitting) return;
                    setSubmitError(null);
                    setSheetVisible(false);
                }}
                onSubmit={handleSubmit}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
        gap: 6,
    },
    headRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    title: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#0F172A",
    },
    statePill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    statePillDone: {
        backgroundColor: "#ECFDF5",
    },
    statePillPending: {
        backgroundColor: "#FFF5EA",
    },
    stateText: {
        fontFamily: "ChairoSans",
        fontSize: 11,
    },
    stateTextDone: {
        color: "#157347",
    },
    stateTextPending: {
        color: "#B94900",
    },
    meta: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#64748B",
    },
    summary: {
        marginTop: 4,
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#1E293B",
    },
    actionRow: {
        marginTop: 8,
        alignItems: "flex-end",
    },
    reviewButton: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: "#FE8C00",
    },
    reviewButtonText: {
        color: "#FFFFFF",
        fontFamily: "ChairoSans",
        fontSize: 13,
    },
    doneButton: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: "#E2E8F0",
    },
    doneButtonText: {
        color: "#475569",
        fontFamily: "ChairoSans",
        fontSize: 13,
    },
});

export default OrderReviewCard;

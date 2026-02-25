import { memo, useEffect, useRef } from "react";
import { Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";

import type { PanelOrder } from "@/src/features/restaurantPanel/model/panelOrders";
import { PanelButton, SectionCard, StatusPill } from "@/components/panel";
import OrderNote from "./OrderNote";
import type { PanelLocale } from "@/src/features/restaurantPanel/panelLocale";

type Props = {
    order: PanelOrder;
    locale: PanelLocale;
    t: (key: string, vars?: Record<string, string | number>) => string;
    formatCurrency: (value: number) => string;
    formatDate: (value: number | Date | string) => string;
    formatPhone: (value?: string) => string;
    formatAddress: (value?: string) => string;
    expanded: boolean;
    isNew: boolean;
    actionLoadingStatus?: string;
    onToggle: (orderId: string) => void;
    onStatusChange: (orderId: string, nextStatus: "pending" | "accepted" | "canceled" | "delivered") => Promise<void> | void;
};

const OrderCard = ({
    order,
    locale,
    t,
    formatCurrency,
    formatDate,
    formatPhone,
    formatAddress,
    expanded,
    isNew,
    actionLoadingStatus,
    onToggle,
    onStatusChange,
}: Props) => {
    const bgAnim = useRef(new Animated.Value(0)).current;
    const actionsDisabled = Boolean(actionLoadingStatus);

    useEffect(() => {
        if (!isNew) return;
        bgAnim.setValue(1);
        Animated.timing(bgAnim, {
            toValue: 0,
            duration: 2100,
            useNativeDriver: false,
        }).start();
    }, [bgAnim, isNew]);

    const confirmAction = (nextStatus: "accepted" | "canceled" | "delivered") => {
        const actionName =
            nextStatus === "accepted"
                ? t("orders.action.accept")
                : nextStatus === "canceled"
                  ? t("orders.action.reject")
                  : t("orders.action.deliver");
        Alert.alert(
            t("orders.confirmTitle"),
            t("orders.confirmBody", { action: actionName }),
            [
                { text: t("orders.cancel"), style: "cancel" },
                {
                    text: t("orders.confirm"),
                    style: nextStatus === "canceled" ? "destructive" : "default",
                    onPress: () => {
                        void onStatusChange(order.id, nextStatus);
                    },
                },
            ],
            { cancelable: true },
        );
    };

    return (
        <Pressable
            onPress={() => onToggle(order.id)}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.orderCardSummary", { customer: order.customer, status: t(`orders.status.${order.status}`) })}
            style={({ pressed }) => [pressed ? { opacity: 0.96 } : null]}
        >
            <Animated.View
                style={[
                    styles.animatedWrap,
                    {
                        backgroundColor: bgAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["#FFFFFF", "#FFF2CC"],
                        }),
                    },
                ]}
            >
                <SectionCard compact style={styles.card}>
                    <View style={styles.orderHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.orderCustomer}>{order.customer}</Text>
                            <Text style={styles.orderMeta}>{formatDate(order.createdAtMs || order.time)}</Text>
                        </View>
                        <View style={styles.orderHeaderRight}>
                            <StatusPill status={String(order.status)} label={t(`orders.status.${String(order.status)}`)} />
                            <Text style={styles.orderTotal}>{formatCurrency(Number(order.total || 0))}</Text>
                        </View>
                    </View>

                    {order.whatsapp ? <Text style={styles.orderMeta}>{t("orders.whatsapp", { value: formatPhone(order.whatsapp) })}</Text> : null}
                    {order.address ? <Text style={styles.orderMeta}>{t("orders.address", { value: formatAddress(order.address) })}</Text> : null}
                    <OrderNote
                        note={order.note}
                        label={t("orders.note")}
                        expandLabel={t("orders.tapToExpand")}
                        collapseLabel={t("orders.showLess")}
                        accessibilityLabel={t("a11y.orderNoteToggle")}
                    />

                    <Text style={styles.orderItemsLabel}>{t("orders.items")}</Text>
                    <View style={styles.itemsTable}>
                        {Array.isArray(order.items) && order.items.length ? (
                            order.items.map((item, index) => (
                                <View key={`${order.id}-item-${index}`} style={styles.itemRow}>
                                    <Text style={styles.itemQty}>{Number(item.quantity || 0)}x</Text>
                                    <Text style={styles.itemName} numberOfLines={1}>
                                        {item.name || t("common.itemFallback")}
                                    </Text>
                                    <Text style={styles.itemPrice}>
                                        {formatCurrency(Number(item.price || 0) * Number(item.quantity || 1))}
                                    </Text>
                                </View>
                            ))
                        ) : (
                            <Text style={styles.orderMeta}>{t("common.noItemsAvailable")}</Text>
                        )}
                    </View>

                    {expanded ? <Text style={styles.orderMeta}>{t("orders.paymentMethod", { value: order.paymentMethod || t("common.na") })}</Text> : null}

                    <View style={styles.actionsRow}>
                        {order.status === "pending" ? (
                            <>
                                <PanelButton
                                    label={t("orders.accept")}
                                    variant="primary"
                                    onPress={() => confirmAction("accepted")}
                                    style={styles.actionButton}
                                    disabled={actionsDisabled}
                                    loading={actionLoadingStatus === "accepted"}
                                    accessibilityLabel={t("a11y.acceptOrder", { customer: order.customer })}
                                />
                                <PanelButton
                                    label={t("orders.reject")}
                                    variant="destructive"
                                    onPress={() => confirmAction("canceled")}
                                    style={styles.actionButton}
                                    disabled={actionsDisabled}
                                    loading={actionLoadingStatus === "canceled"}
                                    accessibilityLabel={t("a11y.rejectOrder", { customer: order.customer })}
                                />
                            </>
                        ) : order.status === "accepted" ? (
                            <>
                                <PanelButton
                                    label={t("orders.courierAssigned")}
                                    variant="secondary"
                                    onPress={() => void onStatusChange(order.id, "accepted")}
                                    style={styles.actionButton}
                                    disabled={actionsDisabled}
                                    loading={actionLoadingStatus === "accepted"}
                                />
                                <PanelButton
                                    label={t("orders.markDelivered")}
                                    variant="primary"
                                    onPress={() => confirmAction("delivered")}
                                    style={styles.actionButton}
                                    disabled={actionsDisabled}
                                    loading={actionLoadingStatus === "delivered"}
                                />
                            </>
                        ) : null}
                    </View>
                </SectionCard>
            </Animated.View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    animatedWrap: {
        borderRadius: 16,
    },
    card: {
        backgroundColor: "transparent",
    },
    orderHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    orderHeaderRight: {
        alignItems: "flex-end",
        gap: 6,
    },
    orderCustomer: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: "#1E2433",
        lineHeight: 22,
    },
    orderTotal: {
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 22,
        color: "#1E2433",
    },
    orderMeta: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#627189",
        lineHeight: 18,
    },
    orderItemsLabel: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#1E2433",
    },
    itemsTable: {
        gap: 4,
    },
    itemRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E7DCCF",
        paddingBottom: 4,
        paddingTop: 2,
    },
    itemQty: {
        width: 30,
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#1E2433",
    },
    itemName: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#1E2433",
    },
    itemPrice: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#1E2433",
    },
    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 2,
    },
    actionButton: {
        flexGrow: 1,
        minWidth: 140,
    },
});

export default memo(OrderCard);

import { memo, useEffect, useRef } from "react";
import { Alert, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { normalizePanelOrderStatus, type PanelOrder } from "@/src/features/restaurantPanel/model/panelOrders";
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
    onStatusChange: (
        orderId: string,
        nextStatus: "pending" | "accepted" | "out_for_delivery" | "canceled" | "delivered",
    ) => Promise<void> | void;
};

const OrderCard = ({
    order,
    locale: _locale,
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
    const { width } = useWindowDimensions();
    const isCompact = width < 390;
    const isPhone = width < 430;
    const normalizedStatus = String(normalizePanelOrderStatus(order.status));
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

    const confirmAction = (nextStatus: "accepted" | "out_for_delivery" | "canceled" | "delivered") => {
        const actionName =
            nextStatus === "accepted"
                ? t("orders.action.accept")
                : nextStatus === "out_for_delivery"
                  ? t("orders.action.handover")
                : nextStatus === "canceled"
                  ? t("orders.action.reject")
                  : t("orders.action.deliver");

        if (Platform.OS === "web") {
            const g = globalThis as { confirm?: (message?: string) => boolean } | undefined;
            const confirmed = g?.confirm
                ? g.confirm(t("orders.confirmBody", { action: actionName }))
                : true;
            if (confirmed) {
                void onStatusChange(order.id, nextStatus);
            }
            return;
        }

        const confirmTitle = nextStatus === "canceled" ? t("orders.rejectConfirmTitle") : t("orders.confirmTitle");
        const confirmBody = nextStatus === "canceled" ? t("orders.rejectConfirmBody") : t("orders.confirmBody", { action: actionName });

        Alert.alert(
            confirmTitle,
            confirmBody,
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
                <Pressable
                    onPress={() => onToggle(order.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.orderCardSummary", { customer: order.customer, status: t(`orders.status.${normalizedStatus}`) })}
                    style={({ pressed }) => [styles.summaryPressable, pressed ? styles.summaryPressablePressed : null]}
                >
                    <View style={[styles.orderHeader, isCompact ? styles.orderHeaderCompact : null]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.orderCustomer}>{order.customer}</Text>
                            <Text style={styles.orderMeta}>{formatDate(order.createdAtMs || order.time)}</Text>
                        </View>
                        <View style={[styles.orderHeaderRight, isCompact ? styles.orderHeaderRightCompact : null]}>
                            <StatusPill status={normalizedStatus} label={t(`orders.status.${normalizedStatus}`)} />
                            <Text style={[styles.orderTotal, isCompact ? styles.orderTotalCompact : null]}>
                                {formatCurrency(Number(order.total || 0))}
                            </Text>
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
                                    <Text style={styles.itemName} numberOfLines={isCompact ? 2 : 1}>
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
                </Pressable>

                <View
                    style={[
                        styles.actionsRow,
                        isPhone ? styles.actionsRowCompact : null,
                        normalizedStatus === "pending" && isPhone ? styles.pendingActionsCompact : null,
                    ]}
                >
                    {normalizedStatus === "pending" ? (
                        <>
                            <PanelButton
                                label={t("orders.accept")}
                                variant="secondary"
                                onPress={() => confirmAction("accepted")}
                                style={[
                                    styles.actionButton,
                                    isCompact ? styles.actionButtonCompact : null,
                                    isPhone ? styles.acceptButtonCompact : null,
                                ]}
                                disabled={actionsDisabled}
                                loading={actionLoadingStatus === "accepted"}
                                accessibilityLabel={t("a11y.acceptOrder", { customer: order.customer })}
                            />
                            <PanelButton
                                label={t("orders.reject")}
                                variant="destructive"
                                onPress={() => confirmAction("canceled")}
                                style={[
                                    styles.actionButton,
                                    isCompact ? styles.actionButtonCompact : null,
                                    isPhone ? styles.rejectButtonCompact : null,
                                ]}
                                disabled={actionsDisabled}
                                loading={actionLoadingStatus === "canceled"}
                                accessibilityLabel={t("a11y.rejectOrder", { customer: order.customer })}
                            />
                        </>
                    ) : normalizedStatus === "accepted" ? (
                        <View style={styles.singleActionRow}>
                            <PanelButton
                                label={t("orders.handoverCourier")}
                                variant="secondary"
                                onPress={() => confirmAction("out_for_delivery")}
                                style={[styles.actionButton, isCompact ? styles.actionButtonCompact : null]}
                                disabled={actionsDisabled}
                                loading={actionLoadingStatus === "out_for_delivery"}
                            />
                        </View>
                    ) : normalizedStatus === "out_for_delivery" ? (
                        <View style={styles.singleActionRow}>
                            <PanelButton
                                label={t("orders.markDelivered")}
                                variant="secondary"
                                onPress={() => confirmAction("delivered")}
                                style={[styles.actionButton, isCompact ? styles.actionButtonCompact : null]}
                                disabled={actionsDisabled}
                                loading={actionLoadingStatus === "delivered"}
                            />
                        </View>
                    ) : null}
                </View>
            </SectionCard>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    animatedWrap: {
        borderRadius: 16,
    },
    card: {
        backgroundColor: "transparent",
    },
    summaryPressable: {
        gap: 6,
    },
    summaryPressablePressed: {
        opacity: 0.96,
    },
    orderHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    orderHeaderCompact: {
        flexDirection: "column",
        alignItems: "stretch",
        gap: 6,
    },
    orderHeaderRight: {
        alignItems: "flex-end",
        gap: 6,
    },
    orderHeaderRightCompact: {
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 4,
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
    orderTotalCompact: {
        fontSize: 18,
        lineHeight: 20,
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
        alignItems: "flex-start",
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
        flexShrink: 0,
    },
    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 6,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#E7DCCF",
    },
    actionsRowCompact: {
        flexDirection: "column",
        gap: 6,
    },
    pendingActionsCompact: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    singleActionRow: {
        width: "100%",
    },
    actionButton: {
        flexGrow: 1,
        minWidth: 140,
    },
    actionButtonCompact: {
        minWidth: 0,
        width: "100%",
    },
    acceptButtonCompact: {
        width: "48%",
        alignSelf: "flex-start",
        minWidth: 0,
    },
    rejectButtonCompact: {
        width: "48%",
        alignSelf: "flex-end",
        minWidth: 0,
    },
});

export default memo(OrderCard);

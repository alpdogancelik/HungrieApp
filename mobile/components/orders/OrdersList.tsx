import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import type { PanelOrder } from "@/src/features/restaurantPanel/model/panelOrders";
import { filterOrders, sortOrdersDesc } from "@/src/features/restaurantPanel/model/panelOrders";
import type { OrdersStatusFilter } from "./OrderFilters";
import OrderCard from "./OrderCard";
import { SectionCard } from "@/components/panel";
import type { PanelLocale } from "@/src/features/restaurantPanel/panelLocale";

type Props = {
    locale: PanelLocale;
    t: (key: string, vars?: Record<string, string | number>) => string;
    formatCurrency: (value: number) => string;
    formatDate: (value: number | Date | string) => string;
    formatPhone: (value?: string) => string;
    formatAddress: (value?: string) => string;
    orders: PanelOrder[];
    statusFilter: OrdersStatusFilter;
    searchTerm: string;
    expandedOrderId: string | null;
    actionLoadingByOrder: Record<string, string | undefined>;
    newOrderIds: string[];
    onToggleOrder: (orderId: string) => void;
    onStatusChange: (orderId: string, nextStatus: "pending" | "accepted" | "canceled" | "delivered") => Promise<void> | void;
};

const emptyCopy = (
    statusFilter: OrdersStatusFilter,
    hasAnyOrders: boolean,
    hasSearch: boolean,
    t: (key: string, vars?: Record<string, string | number>) => string,
) => {
    if (!hasAnyOrders) {
        return {
            title: t("orders.noOrders"),
            description: t("orders.noOrdersHint"),
        };
    }
    if (hasSearch) {
        return {
            title: t("orders.noSearchResult"),
            description: t("orders.noSearchResultHint"),
        };
    }
    if (statusFilter !== "all") {
        return {
            title: t("orders.noFilterResult"),
            description: t("orders.noFilterResultHint", { status: t(`orders.filter.${statusFilter}`) }),
        };
    }
    return {
        title: t("orders.noSearchResult"),
        description: t("orders.noSearchResultHint"),
    };
};

const OrdersList = ({
    locale,
    t,
    formatCurrency,
    formatDate,
    formatPhone,
    formatAddress,
    orders,
    statusFilter,
    searchTerm,
    expandedOrderId,
    actionLoadingByOrder,
    newOrderIds,
    onToggleOrder,
    onStatusChange,
}: Props) => {
    const filteredOrders = useMemo(
        () => sortOrdersDesc(filterOrders(orders, statusFilter, searchTerm)),
        [orders, searchTerm, statusFilter],
    );

    const emptyState = emptyCopy(statusFilter, orders.length > 0, Boolean(searchTerm.trim()), t);

    if (!filteredOrders.length) {
        return (
            <View style={styles.emptyContent}>
                <SectionCard compact style={styles.emptyCard}>
                    <View style={styles.emptyIcon}>
                        <Feather name="inbox" size={18} color="#B94900" />
                    </View>
                    <Text style={styles.emptyTitle}>{emptyState.title}</Text>
                    <Text style={styles.emptyText}>{emptyState.description}</Text>
                </SectionCard>
            </View>
        );
    }

    return (
        <View style={styles.listContent}>
            {filteredOrders.map((item, index) => (
                <View key={item.id} style={index > 0 ? styles.itemSpacer : null}>
                    <OrderCard
                        order={item}
                        locale={locale}
                        t={t}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        formatPhone={formatPhone}
                        formatAddress={formatAddress}
                        expanded={expandedOrderId === item.id}
                        actionLoadingStatus={actionLoadingByOrder[item.id]}
                        isNew={newOrderIds.includes(item.id)}
                        onToggle={onToggleOrder}
                        onStatusChange={onStatusChange}
                    />
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    listContent: {
        paddingTop: 2,
        paddingBottom: 4,
    },
    itemSpacer: {
        marginTop: 8,
    },
    emptyContent: {
        paddingVertical: 6,
    },
    emptyCard: {
        backgroundColor: "#FFF9F2",
    },
    emptyIcon: {
        width: 34,
        height: 34,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFEBD4",
        marginBottom: 2,
    },
    emptyTitle: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#1E2433",
    },
    emptyText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#627189",
        lineHeight: 18,
    },
});

export default memo(OrdersList);

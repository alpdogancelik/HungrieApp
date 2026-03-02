import { useEffect, useMemo, useState } from "react";
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";

import useAuthStore from "@/store/auth.store";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import { subscribeRestaurantPastOrders } from "@/src/services/firebaseOrders";
import { mapFirestoreOrder, type PanelOrder, sortOrdersDesc } from "@/src/features/restaurantPanel/model/panelOrders";
import {
    PanelButton,
    PanelCard,
    PanelEmptyState,
    PanelLoadingState,
    PanelShell,
    panelDesign,
} from "@/src/features/restaurantPanel/ui";
import { OrderNote } from "@/components/orders";
import { LanguageSwitch, StatusPill } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

type PastStatusFilter = "all" | "delivered" | "canceled" | "rejected";
type DateRangeFilter = "last7" | "last30" | "custom";

const STATUS_FILTERS: PastStatusFilter[] = ["all", "delivered", "canceled", "rejected"];
const RANGE_FILTERS: DateRangeFilter[] = ["last7", "last30", "custom"];

const parseDateInput = (value: string, endOfDay = false): number | null => {
    const text = value.trim();
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const parsed = new Date(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getTime();
};

const csvEscape = (value: unknown) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const buildCsv = (orders: PanelOrder[], t: (key: string, vars?: Record<string, string | number>) => string) => {
    const header = [
        t("history.csv.orderId"),
        t("history.csv.customer"),
        t("history.csv.status"),
        t("history.csv.total"),
        t("history.csv.payment"),
        t("history.csv.createdAt"),
        t("history.csv.items"),
    ];
    const lines = orders.map((order) => {
        const items = order.items
            .map((item) => `${Number(item.quantity || 0)}x ${item.name || t("common.itemFallback")} (${Number(item.price || 0).toFixed(2)} TRY)`)
            .join(" | ");
        return [
            csvEscape(order.id),
            csvEscape(order.customer),
            csvEscape(order.status),
            csvEscape(Number(order.total || 0).toFixed(2)),
            csvEscape(order.paymentMethod || t("common.na")),
            csvEscape(order.time),
            csvEscape(items),
        ].join(",");
    });
    return [header.join(","), ...lines].join("\n");
};

const RestaurantHistory = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 980;
    const isPhone = width < 760;

    const { isAuthenticated } = useAuthStore();
    const [orders, setOrders] = useState<PanelOrder[]>([]);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<PastStatusFilter>("all");
    const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>("last30");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");

    const [selectedOrder, setSelectedOrder] = useState<PanelOrder | null>(null);
    const { locale, setLocale, t, formatCurrency, formatDate, formatAddress, formatPhone } = useRestaurantPanelLocale(restaurantId);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (!isAuthenticated) {
                setLoading(false);
                return;
            }
            const restId = await getOwnedRestaurantId();
            if (!mounted) return;
            setRestaurantId(restId);
            if (!restId) setLoading(false);
        };
        load();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!restaurantId) return;
        const unsub = subscribeRestaurantPastOrders(restaurantId, (list) => {
            setOrders(sortOrdersDesc(list.map(mapFirestoreOrder)));
            setLoading(false);
        });
        return () => unsub?.();
    }, [restaurantId]);

    const filtered = useMemo(() => {
        const now = Date.now();
        const last7 = now - 7 * 24 * 60 * 60 * 1000;
        const last30 = now - 30 * 24 * 60 * 60 * 1000;
        const customStartMs = parseDateInput(customStart, false);
        const customEndMs = parseDateInput(customEnd, true);
        const normalizedSearch = search.trim().toLowerCase();

        return sortOrdersDesc(
            orders.filter((order) => {
                const statusMatch = statusFilter === "all" || String(order.status) === statusFilter;
                if (!statusMatch) return false;

                const searchMatch =
                    !normalizedSearch ||
                    order.customer.toLowerCase().includes(normalizedSearch) ||
                    order.id.toLowerCase().includes(normalizedSearch);
                if (!searchMatch) return false;

                if (rangeFilter === "last7") return order.createdAtMs >= last7;
                if (rangeFilter === "last30") return order.createdAtMs >= last30;

                if (rangeFilter === "custom") {
                    if (customStart && customStartMs === null) return false;
                    if (customEnd && customEndMs === null) return false;
                    if (customStartMs !== null && order.createdAtMs < customStartMs) return false;
                    if (customEndMs !== null && order.createdAtMs > customEndMs) return false;
                }

                return true;
            }),
        );
    }, [customEnd, customStart, orders, rangeFilter, search, statusFilter]);

    const handleExportCsv = async () => {
        const csv = buildCsv(filtered, t);
        if (Platform.OS === "web" && typeof window !== "undefined") {
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `past-orders-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return;
        }

        await Share.share({
            title: t("history.shareTitle"),
            message: csv,
        });
    };

    return (
        <PanelShell
            kicker={t("common.restaurantHub")}
            title={t("history.title")}
            subtitle={t("history.subtitle")}
            onBackPress={() => router.push("/restaurantpanel")}
            backLabel={t("button.backToLiveOrders")}
            backAccessibilityLabel={t("a11y.backToLiveOrders")}
            right={<LanguageSwitch locale={locale} onChange={(next) => void setLocale(next)} getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })} />}
        >
            <PanelCard compact>
                <View style={[styles.controlsGrid, isDesktop ? styles.controlsGridDesktop : null]}>
                    <View style={styles.controlBlock}>
                        <TextInput
                            placeholder={t("history.search")}
                            placeholderTextColor="#8895AA"
                            value={search}
                            onChangeText={setSearch}
                            style={styles.searchInput}
                            accessibilityLabel={t("a11y.searchPastOrders")}
                        />
                    </View>

                    <PanelButton
                        label={t("history.exportCsv", { count: filtered.length })}
                        variant="outline"
                        onPress={handleExportCsv}
                        disabled={!filtered.length}
                        accessibilityLabel={t("a11y.exportCsv")}
                        style={[styles.exportButton, isPhone ? styles.exportButtonPhone : null]}
                    />
                </View>

                <View style={styles.pillRow}>
                    {STATUS_FILTERS.map((status) => {
                        const active = statusFilter === status;
                        return (
                            <Pressable
                                key={status}
                                onPress={() => setStatusFilter(status)}
                                style={[styles.pill, active ? styles.pillActive : null]}
                                accessibilityRole="button"
                                accessibilityLabel={t("a11y.historyStatusFilter", { value: t(`history.status.${status}`) })}
                            >
                                <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>{t(`history.status.${status}`)}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                <View style={styles.pillRow}>
                    {RANGE_FILTERS.map((range) => {
                        const active = rangeFilter === range;
                        return (
                            <Pressable
                                key={range}
                                onPress={() => setRangeFilter(range)}
                                style={[styles.pill, active ? styles.pillActive : null]}
                                accessibilityRole="button"
                                accessibilityLabel={t("a11y.historyRangeFilter", { value: t(`history.range.${range}`) })}
                            >
                                <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>{t(`history.range.${range}`)}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                {rangeFilter === "custom" ? (
                    <View style={[styles.controlsGrid, isDesktop ? styles.controlsGridDesktop : null]}>
                        <TextInput
                            placeholder={t("history.customStart")}
                            placeholderTextColor="#8895AA"
                            value={customStart}
                            onChangeText={setCustomStart}
                            style={styles.searchInput}
                            accessibilityLabel={t("a11y.customRangeStart")}
                        />
                        <TextInput
                            placeholder={t("history.customEnd")}
                            placeholderTextColor="#8895AA"
                            value={customEnd}
                            onChangeText={setCustomEnd}
                            style={styles.searchInput}
                            accessibilityLabel={t("a11y.customRangeEnd")}
                        />
                    </View>
                ) : null}
            </PanelCard>

            {loading ? (
                <PanelLoadingState title={t("loading.historyTitle")} description={t("loading.historyDescription")} />
            ) : !filtered.length ? (
                <PanelEmptyState
                    title={t("history.noResults")}
                    description={t("history.noResultsHint")}
                />
            ) : (
                <View style={styles.listWrap}>
                    {filtered.map((order) => (
                        <Pressable
                            key={order.id}
                            onPress={() => setSelectedOrder(order)}
                            accessibilityRole="button"
                            accessibilityLabel={t("a11y.openOrderDetails", { id: order.id })}
                            style={({ pressed }) => [pressed ? { opacity: 0.95 } : null]}
                        >
                            <PanelCard compact style={styles.historyCard}>
                                <View style={[styles.rowTop, isPhone ? styles.rowTopPhone : null]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.customer}>{order.customer}</Text>
                                        <Text style={styles.meta}>{formatDate(order.createdAtMs || order.time)}</Text>
                                        <Text style={styles.meta} numberOfLines={1}>#{order.id}</Text>
                                    </View>
                                    <View style={[styles.rowRight, isPhone ? styles.rowRightPhone : null]}>
                                        <StatusPill status={String(order.status)} label={t(`orders.status.${String(order.status)}`)} />
                                        <Text style={styles.total}>{formatCurrency(Number(order.total || 0))}</Text>
                                    </View>
                                </View>
                                {order.address ? <Text style={styles.meta}>{t("orders.address", { value: formatAddress(order.address) })}</Text> : null}
                                <OrderNote
                                    note={order.note}
                                    label={t("orders.note")}
                                    expandLabel={t("orders.tapToExpand")}
                                    collapseLabel={t("orders.showLess")}
                                    accessibilityLabel={t("a11y.orderNoteToggle")}
                                />
                                <Text style={styles.meta}>{t("history.payment", { value: order.paymentMethod || t("common.na") })}</Text>
                            </PanelCard>
                        </Pressable>
                    ))}
                </View>
            )}

            <PanelButton
                label={t("button.backToLiveOrders")}
                variant="outline"
                onPress={() => router.push("/restaurantpanel")}
                accessibilityLabel={t("a11y.backToLiveOrders")}
            />

            <Modal
                transparent
                animationType="fade"
                visible={Boolean(selectedOrder)}
                onRequestClose={() => setSelectedOrder(null)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalCard, isDesktop ? styles.modalCardDesktop : null]}>
                        {selectedOrder ? (
                            <>
                                <View style={[styles.modalHeader, isPhone ? styles.modalHeaderPhone : null]}>
                                    <Text style={styles.modalTitle}>{t("history.orderDetails")}</Text>
                                    <StatusPill status={String(selectedOrder.status)} label={t(`orders.status.${String(selectedOrder.status)}`)} />
                                </View>
                                <Text style={styles.modalMeta}>{t("history.orderId", { value: selectedOrder.id })}</Text>
                                <Text style={styles.modalMeta}>{t("history.customer", { value: selectedOrder.customer })}</Text>
                                <Text style={styles.modalMeta}>{t("history.created", { value: formatDate(selectedOrder.createdAtMs || selectedOrder.time) })}</Text>
                                <Text style={styles.modalMeta}>{t("history.payment", { value: selectedOrder.paymentMethod || t("common.na") })}</Text>
                                {selectedOrder.address ? <Text style={styles.modalMeta}>{t("orders.address", { value: formatAddress(selectedOrder.address) })}</Text> : null}
                                <OrderNote
                                    note={selectedOrder.note}
                                    label={t("orders.note")}
                                    expandLabel={t("orders.tapToExpand")}
                                    collapseLabel={t("orders.showLess")}
                                    accessibilityLabel={t("a11y.orderNoteToggle")}
                                />
                                {selectedOrder.whatsapp ? <Text style={styles.modalMeta}>{t("orders.whatsapp", { value: formatPhone(selectedOrder.whatsapp) })}</Text> : null}

                                <Text style={styles.modalSectionTitle}>{t("orders.items")}</Text>
                                <ScrollView style={styles.modalItemsWrap}>
                                    {selectedOrder.items.length ? (
                                        selectedOrder.items.map((item, index) => (
                                            <View key={`${selectedOrder.id}-item-${index}`} style={styles.modalItemRow}>
                                                <Text style={styles.modalItemQty}>{Number(item.quantity || 0)}x</Text>
                                                <Text style={styles.modalItemName}>{item.name || t("common.itemFallback")}</Text>
                                                <Text style={styles.modalItemPrice}>{formatCurrency(Number(item.price || 0) * Number(item.quantity || 1))}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={styles.modalMeta}>{t("common.noItemDetailAvailable")}</Text>
                                    )}
                                </ScrollView>

                                <View style={[styles.modalFooter, isPhone ? styles.modalFooterPhone : null]}>
                                    <Text style={styles.modalTotal}>{formatCurrency(Number(selectedOrder.total || 0))}</Text>
                                    <PanelButton
                                        label={t("button.close")}
                                        variant="outline"
                                        onPress={() => setSelectedOrder(null)}
                                    />
                                </View>
                            </>
                        ) : null}
                    </View>
                </View>
            </Modal>
        </PanelShell>
    );
};

const styles = StyleSheet.create({
    controlsGrid: {
        gap: panelDesign.spacing.sm,
    },
    controlsGridDesktop: {
        flexDirection: "row",
        alignItems: "center",
    },
    controlBlock: {
        flex: 1,
    },
    exportButton: {
        minWidth: 160,
        flexGrow: 1,
    },
    exportButtonPhone: {
        minWidth: 0,
        width: "100%",
    },
    searchInput: {
        minHeight: 46,
        borderRadius: panelDesign.radius.md,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: panelDesign.colors.text,
        fontFamily: "ChairoSans",
        fontSize: 16,
        flex: 1,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: panelDesign.colors.backgroundSoft,
        minWidth: 86,
        alignItems: "center",
    },
    pillActive: {
        borderColor: panelDesign.colors.primary,
        backgroundColor: panelDesign.colors.primarySoft,
    },
    pillLabel: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: panelDesign.colors.muted,
        textAlign: "center",
    },
    pillLabelActive: {
        color: "#B94900",
    },
    listWrap: {
        gap: panelDesign.spacing.sm,
    },
    historyCard: {
        padding: panelDesign.spacing.sm,
    },
    rowTop: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
    },
    rowTopPhone: {
        flexDirection: "column",
        gap: 8,
    },
    rowRight: {
        alignItems: "flex-end",
        gap: 6,
    },
    rowRightPhone: {
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    customer: {
        fontFamily: "ChairoSans",
        fontSize: 19,
        color: panelDesign.colors.text,
        lineHeight: 24,
    },
    total: {
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 24,
        color: panelDesign.colors.text,
    },
    meta: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: panelDesign.colors.muted,
        lineHeight: 19,
    },
    historyActionRow: {
        marginTop: 4,
        alignItems: "flex-end",
    },
    historyActionButton: {
        minWidth: 126,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
    },
    modalCard: {
        width: "100%",
        maxHeight: "88%",
        backgroundColor: "#FFFFFF",
        borderRadius: panelDesign.radius.lg,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        padding: panelDesign.spacing.md,
        gap: panelDesign.spacing.sm,
    },
    modalCardDesktop: {
        maxWidth: 700,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    modalHeaderPhone: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
    },
    modalTitle: {
        fontFamily: "ChairoSans",
        fontSize: 22,
        color: panelDesign.colors.text,
    },
    modalMeta: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: panelDesign.colors.muted,
        lineHeight: 20,
    },
    modalSectionTitle: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: panelDesign.colors.text,
        marginTop: 6,
    },
    modalItemsWrap: {
        maxHeight: 260,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        borderRadius: panelDesign.radius.md,
        padding: 10,
    },
    modalItemRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: panelDesign.colors.border,
    },
    modalItemQty: {
        width: 30,
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: panelDesign.colors.text,
    },
    modalItemName: {
        flex: 1,
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: panelDesign.colors.text,
    },
    modalItemPrice: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: panelDesign.colors.text,
    },
    modalFooter: {
        marginTop: 8,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
    },
    modalFooterPhone: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    modalTotal: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: panelDesign.colors.text,
    },
});

export default RestaurantHistory;

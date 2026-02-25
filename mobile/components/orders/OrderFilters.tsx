import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { PanelLocale } from "@/src/features/restaurantPanel/panelLocale";

export type OrdersStatusFilter = "all" | "pending" | "accepted" | "canceled" | "delivered";

const FILTERS: OrdersStatusFilter[] = ["all", "pending", "accepted", "canceled"];

type Props = {
    locale: PanelLocale;
    statusFilter: OrdersStatusFilter;
    onStatusFilterChange: (status: OrdersStatusFilter) => void;
    onSearchDebounced: (value: string) => void;
    searchPlaceholder: string;
    getFilterLabel: (status: OrdersStatusFilter) => string;
    getFilterCount?: (status: OrdersStatusFilter) => number;
    getFilterAccessibilityLabel?: (status: OrdersStatusFilter) => string;
    debounceMs?: number;
};

const OrderFilters = ({
    locale,
    statusFilter,
    onStatusFilterChange,
    onSearchDebounced,
    searchPlaceholder,
    getFilterLabel,
    getFilterCount,
    getFilterAccessibilityLabel,
    debounceMs = 280,
}: Props) => {
    const [search, setSearch] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => {
            onSearchDebounced(search.trim());
        }, debounceMs);
        return () => clearTimeout(timer);
    }, [debounceMs, onSearchDebounced, search]);

    return (
        <View style={styles.wrap}>
            <View style={styles.filterRow}>
                {FILTERS.map((status) => {
                    const active = statusFilter === status;
                    return (
                        <Pressable
                            key={status}
                            onPress={() => onStatusFilterChange(status)}
                            accessibilityRole="button"
                            accessibilityLabel={
                                getFilterAccessibilityLabel
                                    ? getFilterAccessibilityLabel(status)
                                    : locale === "tr"
                                      ? `${getFilterLabel(status)} durumuna filtrele`
                                      : `Filter by ${getFilterLabel(status)}`
                            }
                            style={({ pressed }) => [
                                styles.filterPill,
                                active ? styles.filterPillActive : null,
                                pressed ? { opacity: 0.85 } : null,
                            ]}
                        >
                            <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                                {getFilterLabel(status)}
                            </Text>
                            <View style={[styles.countBadge, active ? styles.countBadgeActive : null]}>
                                <Text style={[styles.countText, active ? styles.countTextActive : null]}>
                                    {getFilterCount ? getFilterCount(status) : 0}
                                </Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>

            <TextInput
                placeholder={searchPlaceholder}
                placeholderTextColor="#8895AA"
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                accessibilityLabel={searchPlaceholder}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        gap: 10,
    },
    filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    filterPill: {
        borderWidth: 1,
        borderColor: "#E7DCCF",
        borderRadius: 999,
        backgroundColor: "#FFF9F2",
        paddingHorizontal: 12,
        paddingVertical: 7,
        minHeight: 38,
        minWidth: 96,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
    },
    filterPillActive: {
        borderColor: "#EE7A14",
        backgroundColor: "#FFF1E3",
    },
    filterText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#627189",
        textAlign: "center",
    },
    filterTextActive: {
        color: "#B94900",
    },
    countBadge: {
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F2E9DC",
    },
    countBadgeActive: {
        backgroundColor: "#FBD9B8",
    },
    countText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#627189",
        lineHeight: 14,
    },
    countTextActive: {
        color: "#B94900",
    },
    searchInput: {
        minHeight: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E7DCCF",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 12,
        paddingVertical: 9,
        color: "#1E2433",
        fontFamily: "ChairoSans",
        fontSize: 15,
    },
});

export default OrderFilters;

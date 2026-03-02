import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { PanelLocale } from "@/src/features/restaurantPanel/panelLocale";

export type OrdersStatusFilter = "all" | "pending" | "accepted" | "canceled" | "delivered";

const FILTERS: OrdersStatusFilter[] = ["all", "pending", "accepted", "canceled", "delivered"];

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
    const { width } = useWindowDimensions();
    const isPhone = width < 760;
    const [search, setSearch] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => {
            onSearchDebounced(search.trim());
        }, debounceMs);
        return () => clearTimeout(timer);
    }, [debounceMs, onSearchDebounced, search]);

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal={isPhone}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.filterRow, isPhone ? styles.filterRowPhone : null]}
            >
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
                                isPhone ? styles.filterPillPhone : null,
                                active ? styles.filterPillActive : null,
                                pressed ? { opacity: 0.85 } : null,
                            ]}
                        >
                            <Text style={[styles.filterText, isPhone ? styles.filterTextPhone : null, active ? styles.filterTextActive : null]}>
                                {getFilterLabel(status)}
                            </Text>
                            <View style={[styles.countBadge, isPhone ? styles.countBadgePhone : null, active ? styles.countBadgeActive : null]}>
                                <Text style={[styles.countText, isPhone ? styles.countTextPhone : null, active ? styles.countTextActive : null]}>
                                    {getFilterCount ? getFilterCount(status) : 0}
                                </Text>
                            </View>
                        </Pressable>
                    );
                })}
            </ScrollView>

            <TextInput
                placeholder={searchPlaceholder}
                placeholderTextColor="#8895AA"
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, isPhone ? styles.searchInputPhone : null]}
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
    filterRowPhone: {
        flexWrap: "nowrap",
        paddingRight: 4,
        gap: 6,
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
    filterPillPhone: {
        minHeight: 34,
        minWidth: 76,
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 6,
        flexShrink: 0,
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
    filterTextPhone: {
        fontSize: 13,
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
    countBadgePhone: {
        minWidth: 24,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 5,
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
    countTextPhone: {
        fontSize: 11,
        lineHeight: 12,
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
    searchInputPhone: {
        minHeight: 42,
        fontSize: 14,
    },
});

export default OrderFilters;

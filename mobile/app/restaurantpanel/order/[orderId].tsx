import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { subscribeOrder } from "@/src/services/firebaseOrders";
import { mapFirestoreOrder, type PanelOrder } from "@/src/features/restaurantPanel/model/panelOrders";
import { LanguageSwitch, PageHeader, PanelButton, SectionCard, StatusPill } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

const RestaurantOrderDetailScreen = () => {
    const router = useRouter();
    const { orderId } = useLocalSearchParams<{ orderId?: string }>();
    const [order, setOrder] = useState<PanelOrder | null>(null);
    const { locale, setLocale, t, formatCurrency, formatDate, formatAddress, formatPhone } = useRestaurantPanelLocale(null);

    useEffect(() => {
        const id = String(orderId || "");
        if (!id) return;
        const unsub = subscribeOrder(id, (next) => {
            if (!next) {
                setOrder(null);
                return;
            }
            setOrder(mapFirestoreOrder(next));
        });
        return () => unsub?.();
    }, [orderId]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container}>
                <PageHeader
                    title={order ? `${t("history.orderDetails")} #${order.id.slice(-6)}` : t("history.orderDetails")}
                    subtitle={t("orders.openedFromPush")}
                    right={
                        <LanguageSwitch
                            locale={locale}
                            onChange={(next) => void setLocale(next)}
                            getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })}
                        />
                    }
                />

                {!order ? (
                    <SectionCard title={t("orders.notFoundTitle")} subtitle={t("orders.notFoundDescription")} />
                ) : (
                    <SectionCard title={order.customer} subtitle={formatDate(order.createdAtMs || order.time)} right={<StatusPill status={String(order.status)} label={t(`orders.status.${String(order.status)}`)} />}>
                        <Text style={styles.meta}>{t("history.payment", { value: order.paymentMethod || t("common.na") })}</Text>
                        {order.address ? <Text style={styles.meta}>{t("orders.address", { value: formatAddress(order.address) })}</Text> : null}
                        {order.whatsapp ? <Text style={styles.meta}>{t("orders.whatsapp", { value: formatPhone(order.whatsapp) })}</Text> : null}

                        <Text style={styles.sectionTitle}>{t("orders.items")}</Text>
                        <View style={styles.itemsWrap}>
                            {order.items.map((item, index) => (
                                <View key={`${order.id}-item-${index}`} style={styles.itemRow}>
                                    <Text style={styles.itemQty}>{Number(item.quantity || 0)}x</Text>
                                    <Text style={styles.itemName}>{item.name || t("common.itemFallback")}</Text>
                                    <Text style={styles.itemPrice}>
                                        {formatCurrency(Number(item.price || 0) * Number(item.quantity || 1))}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <Text style={styles.total}>{formatCurrency(Number(order.total || 0))}</Text>
                    </SectionCard>
                )}

                <PanelButton
                    label={t("button.backToPanel")}
                    variant="secondary"
                    onPress={() => router.push("/restaurantpanel")}
                    accessibilityLabel={t("a11y.backToPanel")}
                />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#FDF4E7",
    },
    container: {
        padding: 14,
        gap: 12,
        paddingBottom: 24,
    },
    meta: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#627189",
        lineHeight: 20,
    },
    sectionTitle: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: "#1E2433",
        marginTop: 4,
    },
    itemsWrap: {
        gap: 4,
    },
    itemRow: {
        flexDirection: "row",
        gap: 8,
        paddingVertical: 3,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E7DCCF",
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
    total: {
        fontFamily: "ChairoSans",
        fontSize: 17,
        color: "#1E2433",
        marginTop: 8,
    },
});

export default RestaurantOrderDetailScreen;

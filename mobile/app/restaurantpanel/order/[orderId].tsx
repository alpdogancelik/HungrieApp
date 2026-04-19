import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { subscribeOrder } from "@/src/services/firebaseOrders";
import { mapFirestoreOrder, type PanelOrder } from "@/src/features/restaurantPanel/model/panelOrders";
import { LanguageSwitch, PageHeader, SectionCard, StatusPill } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";
import useAuthStore from "@/store/auth.store";

const RestaurantOrderDetailScreen = () => {
    const router = useRouter();
    const { orderId } = useLocalSearchParams<{ orderId?: string }>();
    const { width } = useWindowDimensions();
    const isPhone = width < 760;
    const { isAuthenticated, isLoading: authLoading } = useAuthStore();
    const [order, setOrder] = useState<PanelOrder | null>(null);
    const [redirectTo, setRedirectTo] = useState<"/sign-in" | null>(null);
    const { locale, setLocale, t, formatCurrency, formatDate, formatAddress, formatPhone } = useRestaurantPanelLocale(null);

    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) {
            setRedirectTo("/sign-in");
            return;
        }
        setRedirectTo(null);
    }, [authLoading, isAuthenticated]);

    useEffect(() => {
        if (authLoading || !isAuthenticated) return;
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
    }, [authLoading, isAuthenticated, orderId]);

    if (redirectTo) {
        return <Redirect href={redirectTo} />;
    }

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
                                <View key={`${order.id}-item-${index}`} style={[styles.itemRow, isPhone ? styles.itemRowPhone : null]}>
                                    <Text style={styles.itemQty}>{Number(item.quantity || 0)}x</Text>
                                    <Text style={styles.itemName} numberOfLines={isPhone ? 2 : 1}>{item.name || t("common.itemFallback")}</Text>
                                    <Text style={styles.itemPrice}>
                                        {formatCurrency(Number(item.price || 0) * Number(item.quantity || 1))}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <Text style={styles.total}>{formatCurrency(Number(order.total || 0))}</Text>
                    </SectionCard>
                )}

                <TouchableOpacity
                    onPress={() => router.push("/restaurantpanel")}
                    activeOpacity={0.82}
                    accessibilityLabel={t("a11y.backToPanel")}
                    style={styles.backButton}
                >
                    <View style={styles.backButtonContent}>
                        <View style={styles.backButtonIconWrap}>
                            <Feather name="chevron-left" size={15} color="#B94900" />
                        </View>
                        <Text style={styles.backButtonLabel}>{t("button.backToPanel")}</Text>
                    </View>
                </TouchableOpacity>
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
    backButton: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#EE7A14",
        backgroundColor: "#FFF5EA",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    backButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    backButtonIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    backButtonLabel: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B94900",
        fontWeight: "600",
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
    itemRowPhone: {
        alignItems: "flex-start",
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
    total: {
        fontFamily: "ChairoSans",
        fontSize: 17,
        color: "#1E2433",
        marginTop: 8,
    },
});

export default RestaurantOrderDetailScreen;

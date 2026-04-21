import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import useAuthStore from "@/store/auth.store";
import { logout } from "@/lib/api";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import {
    fetchRestaurantPastOrders,
    subscribeRestaurantOrders,
    subscribeRestaurantReminderOrders,
    transitionOrder,
} from "@/src/services/firebaseOrders";
import { mapFirestoreOrder, normalizePanelOrderStatus, type PanelOrder, sortOrdersDesc } from "@/src/features/restaurantPanel/model/panelOrders";
import { DashboardSummary, LanguageSwitch, PageHeader, PanelButton, SectionCard } from "@/components/panel";
import { OrderFilters, OrderNotificationToast, OrdersList, type OrdersStatusFilter } from "@/components/orders";
import { useOrderNotifications } from "@/src/hooks/useOrderNotifications";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

const isSameDay = (timeA: number, timeB: number) => {
    const a = new Date(timeA);
    const b = new Date(timeB);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const LoadingSkeleton = () => {
    return (
        <View style={styles.skeletonWrap}>
            {[0, 1, 2].map((item) => (
                <SectionCard key={`s-${item}`} compact>
                    <View style={styles.skeletonLineLg} />
                    <View style={styles.skeletonLineMd} />
                    <View style={styles.skeletonLineSm} />
                </SectionCard>
            ))}
        </View>
    );
};

const RestaurantPanel = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 980;
    const isPhone = width < 760;

    const { isAuthenticated, isLoading: authLoading, user, resetAuthState } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [redirectTo, setRedirectTo] = useState<"/" | "/sign-in" | null>(null);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [restaurantName, setRestaurantName] = useState<string | null>(null);

    const [orders, setOrders] = useState<PanelOrder[]>([]);
    const [pastOrders, setPastOrders] = useState<PanelOrder[]>([]);
    const [reminderOrders, setReminderOrders] = useState<PanelOrder[]>([]);

    const [statusFilter, setStatusFilter] = useState<OrdersStatusFilter>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [actionLoadingByOrder, setActionLoadingByOrder] = useState<Record<string, string | undefined>>({});
    const scrollRef = useRef<ScrollView | null>(null);
    const [ordersSectionY, setOrdersSectionY] = useState(0);
    const { locale, ready, setLocale, t, formatCurrency, formatDate, formatPhone, formatAddress } = useRestaurantPanelLocale(restaurantId);
    const localeReady = !restaurantId || ready;

    const {
        notificationsEnabled,
        soundEnabled,
        toast,
        highlightedOrderIds,
        dismissToast,
        toggleNotifications,
        enableSound,
        toggleSound,
        testNotification,
    } = useOrderNotifications({ restaurantId, orders, t });

    const loadPastOrders = useCallback(async (targetRestaurantId: string) => {
        if (!targetRestaurantId) {
            setPastOrders([]);
            return;
        }
        try {
            const list = await fetchRestaurantPastOrders(targetRestaurantId);
            setPastOrders(sortOrdersDesc(list.map(mapFirestoreOrder)));
        } catch {
            setPastOrders([]);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        const verifyAccess = async () => {
            if (authLoading) return;

            if (!isAuthenticated) {
                if (!mounted) return;
                setRedirectTo("/sign-in");
                setLoading(false);
                return;
            }

            const ownedRestaurantId = await getOwnedRestaurantId();
            if (!mounted) return;

            if (!ownedRestaurantId) {
                setRedirectTo("/");
                setLoading(false);
                return;
            }

            setRedirectTo(null);
            setAuthorized(true);
            setRestaurantId(ownedRestaurantId);
            setRestaurantName(ownedRestaurantId);
            setLoading(false);
        };

        verifyAccess();
        return () => {
            mounted = false;
        };
    }, [authLoading, isAuthenticated]);

    useEffect(() => {
        if (!restaurantId) return;

        const unsubscribeActive = subscribeRestaurantOrders(restaurantId, ["pending", "accepted", "preparing", "ready", "out_for_delivery"], (list) => {
            setOrders(sortOrdersDesc(list.map(mapFirestoreOrder)));
        });

        void loadPastOrders(restaurantId);

        const unsubscribeReminders = subscribeRestaurantReminderOrders(restaurantId, (list) => {
            setReminderOrders(sortOrdersDesc(list.map(mapFirestoreOrder)));
        });

        return () => {
            unsubscribeActive?.();
            unsubscribeReminders?.();
        };
    }, [loadPastOrders, restaurantId]);

    const getOrderActionErrorMessage = useCallback(
        (error: any) => {
            const code = String(error?.code || "").toLowerCase();
            const rawMessage = String(error?.message || "").toLowerCase();
            const permissionDenied =
                code.includes("permission-denied") ||
                rawMessage.includes("insufficient permissions") ||
                rawMessage.includes("missing or insufficient permissions");

            if (permissionDenied) {
                if (__DEV__) {
                    return "Siparis guncellenemedi: restaurant panel update izni yok. firestore.rules icin owner/staff izinlerini deploy edin.";
                }
                return locale === "tr"
                    ? "Siparis guncellenemedi. Lutfen oturumu yenileyip tekrar deneyin."
                    : "Could not update order. Please refresh your session and try again.";
            }

            return error?.message || t("common.tryAgain");
        },
        [locale, t],
    );

    const updateOrderStatus = useCallback(
        async (orderId: string, status: "pending" | "accepted" | "out_for_delivery" | "canceled" | "rejected" | "delivered") => {
            const previousOrder = orders.find((order) => order.id === orderId);
            const previousStatus = previousOrder?.status;
            setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status } : order)));
            try {
                await transitionOrder(orderId, status);
                if (restaurantId && (status === "delivered" || status === "canceled" || status === "rejected")) {
                    void loadPastOrders(restaurantId);
                }
            } catch (error: any) {
                if (previousStatus) {
                    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status: previousStatus } : order)));
                }
                Alert.alert(t("orders.updateFailedTitle"), getOrderActionErrorMessage(error));
            }
        },
        [getOrderActionErrorMessage, loadPastOrders, orders, restaurantId, t],
    );

    const handleOrderAction = useCallback(
        async (orderId: string, status: "pending" | "accepted" | "out_for_delivery" | "canceled" | "rejected" | "delivered") => {
            setActionLoadingByOrder((prev) => ({ ...prev, [orderId]: status }));
            try {
                await updateOrderStatus(orderId, status);
            } finally {
                setActionLoadingByOrder((prev) => ({ ...prev, [orderId]: undefined }));
            }
        },
        [updateOrderStatus],
    );

    const metrics = useMemo(() => {
        const todayOrders = [...orders, ...pastOrders].filter((order) => isSameDay(order.createdAtMs || 0, Date.now()));
        const pendingToday = todayOrders.filter((order) => normalizePanelOrderStatus(order.status) === "pending").length;
        const acceptedToday = todayOrders.filter((order) => {
            const status = normalizePanelOrderStatus(order.status);
            return status === "accepted" || status === "out_for_delivery";
        }).length;
        const deliveredToday = todayOrders.filter((order) => normalizePanelOrderStatus(order.status) === "delivered").length;
        const today = todayOrders.length;
        return { pendingToday, acceptedToday, deliveredToday, today };
    }, [orders, pastOrders]);

    const filterCounts = useMemo(() => {
        let pending = 0;
        let accepted = 0;
        for (const order of orders) {
            const status = normalizePanelOrderStatus(order.status);
            if (status === "pending") pending += 1;
            else if (status === "accepted" || status === "out_for_delivery") accepted += 1;
        }
        const delivered = pastOrders.filter((order) => normalizePanelOrderStatus(order.status) === "delivered").length;
        const canceled = pastOrders.filter((order) => {
            const status = normalizePanelOrderStatus(order.status);
            return status === "canceled" || status === "rejected";
        }).length;
        return {
            all: orders.length,
            pending,
            accepted,
            delivered,
            canceled,
        };
    }, [orders, pastOrders]);

    // Active feed only contains pending/accepted; cancelled orders are sourced from history.
    const canceledOrdersFromHistory = useMemo(
        () =>
            sortOrdersDesc(
                pastOrders.filter((order) => {
                    const status = normalizePanelOrderStatus(order.status);
                    return status === "canceled" || status === "rejected";
                }),
            ),
        [pastOrders],
    );

    const deliveredOrdersFromHistory = useMemo(
        () =>
            sortOrdersDesc(
                pastOrders.filter((order) => normalizePanelOrderStatus(order.status) === "delivered"),
            ),
        [pastOrders],
    );

    const ordersForCurrentFilter =
        statusFilter === "canceled"
            ? canceledOrdersFromHistory
            : statusFilter === "delivered"
                ? deliveredOrdersFromHistory
                : orders;

    const handleGoToActiveOrders = useCallback(() => {
        setStatusFilter("all");
        scrollRef.current?.scrollTo({ y: Math.max(ordersSectionY - 8, 0), animated: true });
    }, [ordersSectionY]);

    const handleToggleOrder = useCallback((orderId: string) => {
        setExpandedOrderId((current) => (current === orderId ? null : orderId));
    }, []);
    const reviewsLabel = locale === "tr" ? "Yorumlar" : "Reviews";
    const reviewsAccessibilityLabel = locale === "tr" ? "Yorum moderasyonunu ac" : "Open review moderation";

    const quickLinks = useMemo(
        () => [
            {
                id: "active",
                label: t("section.orders"),
                iconName: "shopping-bag" as const,
                onPress: handleGoToActiveOrders,
                accessibilityLabel: t("a11y.openActiveOrders"),
            },
            {
                id: "past",
                label: t("section.pastOrders"),
                iconName: "clock" as const,
                onPress: () => router.push("/restaurantpanel/history"),
                accessibilityLabel: t("a11y.openPastOrders"),
            },
            {
                id: "menu",
                label: t("button.manageMenu"),
                iconName: "grid" as const,
                onPress: () => router.push("/restaurantpanel/menu"),
                accessibilityLabel: t("a11y.manageMenu"),
            },
            {
                id: "settings",
                label: t("button.editDetails"),
                iconName: "settings" as const,
                onPress: () => router.push("/restaurantpanel/details"),
                accessibilityLabel: t("a11y.editRestaurantDetails"),
            },
            {
                id: "reviews",
                label: reviewsLabel,
                iconName: "message-square" as const,
                onPress: () => router.push("/restaurantpanel/reviews"),
                accessibilityLabel: reviewsAccessibilityLabel,
            },
        ],
        [handleGoToActiveOrders, reviewsAccessibilityLabel, reviewsLabel, router, t],
    );

    const sessionIdentity = user?.email || user?.name || t("common.na");
    const systemMessage = notificationsEnabled ? t("notifications.systemMessagesEnabled") : t("notifications.systemMessagesDisabled");
    const handleSignOut = useCallback(async () => {
        try {
            await logout();
        } catch {
            // Best effort; still clear local auth state below.
        } finally {
            setOrders([]);
            setPastOrders([]);
            setReminderOrders([]);
            setRestaurantId(null);
            setRestaurantName(null);
            setAuthorized(false);
            setRedirectTo("/sign-in");
            setStatusFilter("all");
            setSearchTerm("");
            setExpandedOrderId(null);
            setActionLoadingByOrder({});
            resetAuthState();
            router.replace("/sign-in");
        }
    }, [resetAuthState, router]);

    const reminderFeed = useMemo(
        () => reminderOrders.filter((order) => order.reminderPending).slice(0, 5),
        [reminderOrders],
    );

    const formatReminderAgo = useCallback(
        (value?: number) => {
            const now = Date.now();
            const ms = Number(value || 0);
            if (!ms) return t("reminders.justNow");
            const diffMin = Math.max(0, Math.floor((now - ms) / 60000));
            if (diffMin <= 0) return t("reminders.justNow");
            return t("reminders.minutesAgo", { count: diffMin });
        },
        [t],
    );

    if (redirectTo) {
        return <Redirect href={redirectTo} />;
    }

    if (loading || !localeReady) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.container}>
                    <PageHeader title={t("loading.panelTitle")} subtitle={t("loading.panelDescription")} />
                    <LoadingSkeleton />
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (!authorized) return null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <OrderNotificationToast
                visible={toast.visible}
                title={t("toast.newOrderTitle")}
                dismissHint={t("toast.tapToDismiss")}
                dismissAccessibilityLabel={t("a11y.dismissNotification")}
                message={toast.message}
                onClose={dismissToast}
            />
            <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <PageHeader
                    title={t("header.welcome", { name: restaurantName || t("header.restaurantFallback") })}
                    subtitle={t("header.subtitle")}
                    right={
                        <View style={[styles.headerRightWrap, isPhone ? styles.headerRightWrapMobile : null]}>
                            <View style={[styles.headerControls, isPhone ? styles.headerControlsMobile : null]}>
                                <LanguageSwitch
                                    locale={locale}
                                    onChange={(next) => void setLocale(next)}
                                    getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })}
                                />
                                <TouchableOpacity
                                    onPress={() => {
                                        void toggleSound();
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t("a11y.toggleSound")}
                                    activeOpacity={0.82}
                                    style={[styles.headerLocalButton, isPhone ? styles.headerLocalButtonMobile : styles.headerLocalButtonDesktop]}
                                >
                                    <View style={styles.headerLocalButtonContent}>
                                        <View style={styles.headerLocalButtonIconWrap}>
                                            <Feather name={soundEnabled ? "volume-2" : "volume-x"} size={15} color="#B94900" />
                                        </View>
                                        <Text style={styles.headerLocalButtonLabel}>
                                            {t("button.toggleSound", { value: soundEnabled ? t("language.soundOn") : t("language.soundOff") })}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                {!soundEnabled ? (
                                    <PanelButton
                                        label={t("button.enableSound")}
                                        variant="secondary"
                                        iconName="bell"
                                        style={isPhone ? styles.headerActionButtonMobile : styles.headerActionButton}
                                        onPress={() => {
                                            void enableSound();
                                        }}
                                        accessibilityLabel={t("a11y.enableSound")}
                                    />
                                ) : null}
                            </View>
                        </View>
                    }
                />

                <DashboardSummary
                    title={t("dashboard.summaryTitle")}
                    metrics={[
                        { id: "pending", label: t("stats.pending"), value: metrics.pendingToday, tone: "warning" },
                        { id: "accepted", label: t("stats.accepted"), value: metrics.acceptedToday, tone: "success" },
                        { id: "delivered", label: t("stats.delivered"), value: metrics.deliveredToday, tone: "info" },
                    ]}
                    links={quickLinks}
                />

                <View style={[styles.grid, isDesktop ? styles.gridDesktop : null]}>
                    <View style={styles.leftColumn}>
                        <View onLayout={(event) => setOrdersSectionY(event.nativeEvent.layout.y)}>
                            <SectionCard
                                title={t("section.orders")}
                                subtitle={t("section.ordersSubtitle")}
                                titleIcon={<Feather name="shopping-bag" size={14} color="#B94900" />}
                                right={
                                    <TouchableOpacity
                                        onPress={() => router.push("/restaurantpanel/history")}
                                        accessibilityRole="button"
                                        accessibilityLabel={t("a11y.openPastOrders")}
                                        activeOpacity={0.82}
                                        style={[styles.sectionTopLocalButton, isPhone ? styles.sectionTopLocalButtonMobile : styles.sectionTopLocalButtonDesktop]}
                                    >
                                        <View style={styles.sectionTopLocalButtonContent}>
                                            <View style={styles.sectionTopLocalButtonIconWrap}>
                                                <Feather name="clock" size={15} color="#B94900" />
                                            </View>
                                            <Text style={styles.sectionTopLocalButtonLabel}>{t("section.pastOrders")}</Text>
                                        </View>
                                    </TouchableOpacity>
                                }
                            >
                                <OrderFilters
                                    locale={locale}
                                    statusFilter={statusFilter}
                                    onStatusFilterChange={setStatusFilter}
                                    onSearchDebounced={setSearchTerm}
                                    searchPlaceholder={t("orders.search")}
                                    getFilterLabel={(status) => t(`orders.filter.${status}`)}
                                    getFilterCount={(status) => {
                                        if (status === "all") return filterCounts.all;
                                        if (status === "pending") return filterCounts.pending;
                                        if (status === "accepted") return filterCounts.accepted;
                                        if (status === "canceled") return filterCounts.canceled;
                                        if (status === "delivered") return filterCounts.delivered;
                                        return 0;
                                    }}
                                    getFilterAccessibilityLabel={(status) => t("a11y.filterByStatus", { value: t(`orders.filter.${status}`) })}
                                />

                                <View style={[styles.ordersListWrap, !isDesktop ? styles.ordersListWrapMobile : null]}>
                                    <OrdersList
                                        locale={locale}
                                        t={t}
                                        formatCurrency={formatCurrency}
                                        formatDate={formatDate}
                                        formatPhone={formatPhone}
                                        formatAddress={formatAddress}
                                        orders={ordersForCurrentFilter}
                                        statusFilter={statusFilter}
                                        searchTerm={searchTerm}
                                        expandedOrderId={expandedOrderId}
                                        actionLoadingByOrder={actionLoadingByOrder}
                                        newOrderIds={highlightedOrderIds}
                                        onToggleOrder={handleToggleOrder}
                                        onStatusChange={handleOrderAction}
                                    />
                                </View>
                            </SectionCard>
                            </View>
                        </View>

                    <View style={[styles.rightColumn, isPhone ? styles.rightColumnMobile : null]}>
                        {reminderFeed.length ? (
                            <SectionCard
                                title={t("section.remindedOrders")}
                                subtitle={t("section.remindedOrdersSubtitle")}
                                titleIcon={<Feather name="message-square" size={14} color="#B94900" />}
                            >
                                <View style={styles.reminderList}>
                                    {reminderFeed.map((order) => (
                                        <View key={`rem-${order.id}`} style={styles.reminderRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.reminderTitle}>
                                                    {order.customer} - {formatReminderAgo(order.reminderRequestedAtMs)}
                                                </Text>
                                                <Text style={styles.reminderMeta} numberOfLines={1}>
                                                    #{order.id}
                                                </Text>
                                            </View>
                                            <PanelButton
                                                label={t("reminders.openOrder")}
                                                variant="secondary"
                                                style={styles.reminderActionButton}
                                                onPress={() => {
                                                    setStatusFilter("all");
                                                    setExpandedOrderId(order.id);
                                                    scrollRef.current?.scrollTo({ y: Math.max(ordersSectionY - 8, 0), animated: true });
                                                }}
                                            />
                                        </View>
                                    ))}
                                </View>
                            </SectionCard>
                        ) : null}

                        <SectionCard
                            title={t("section.notifications")}
                            subtitle={t("section.notificationsSubtitle")}
                            titleIcon={<Feather name="bell" size={14} color="#B94900" />}
                        >
                            <View style={styles.panelActionGroup}>
                                <View style={styles.panelActionBox}>
                                    <PanelButton
                                        label={t("button.enableNotifications", {
                                            value: notificationsEnabled ? t("language.soundOn") : t("language.soundOff"),
                                        })}
                                        variant={notificationsEnabled ? "primary" : "secondary"}
                                        iconName={notificationsEnabled ? "bell" : "bell-off"}
                                        style={isPhone ? styles.compactActionButton : styles.fullWidthButton}
                                        onPress={() => {
                                            void toggleNotifications();
                                        }}
                                        accessibilityLabel={t("a11y.toggleBrowserNotifications")}
                                    />
                                </View>
                                <View style={styles.panelActionBox}>
                                    <PanelButton
                                        label={t("button.testNotification")}
                                        variant="secondary"
                                        iconName="zap"
                                        style={isPhone ? styles.compactActionButton : styles.fullWidthButton}
                                        onPress={testNotification}
                                        accessibilityLabel={t("a11y.testNotification")}
                                    />
                                </View>
                            </View>
                            <View style={styles.systemMessageChip}>
                                <Feather name="message-circle" size={13} color="#627189" />
                                <Text style={styles.systemMessageText}>{systemMessage}</Text>
                            </View>
                        </SectionCard>

                        <SectionCard
                            title={t("section.restaurantActions")}
                            subtitle={t("section.restaurantActionsSubtitle")}
                            titleIcon={<Feather name="settings" size={14} color="#B94900" />}
                        >
                            <View style={styles.panelActionGroup}>
                                <View style={styles.panelActionBox}>
                                    <PanelButton
                                        label={t("button.manageMenu")}
                                        variant="secondary"
                                        iconName="grid"
                                        style={isPhone ? styles.compactActionButton : styles.fullWidthButton}
                                        onPress={() => router.push("/restaurantpanel/menu")}
                                        accessibilityLabel={t("a11y.manageMenu")}
                                    />
                                </View>
                                <View style={styles.panelActionBox}>
                                    <PanelButton
                                        label={t("button.editDetails")}
                                        variant="secondary"
                                        iconName="edit-2"
                                        style={isPhone ? styles.compactActionButton : styles.fullWidthButton}
                                        onPress={() => router.push("/restaurantpanel/details")}
                                        accessibilityLabel={t("a11y.editRestaurantDetails")}
                                    />
                                </View>
                                <View style={styles.panelActionBox}>
                                    <PanelButton
                                        label={reviewsLabel}
                                        variant="secondary"
                                        iconName="message-square"
                                        style={isPhone ? styles.compactActionButton : styles.fullWidthButton}
                                        onPress={() => router.push("/restaurantpanel/reviews")}
                                        accessibilityLabel={reviewsAccessibilityLabel}
                                    />
                                </View>
                            </View>
                        </SectionCard>

                        <SectionCard title={t("section.session")} titleIcon={<Feather name="log-out" size={14} color="#C03855" />}>
                            <View style={styles.sessionChip}>
                                <Feather name="user" size={13} color="#627189" />
                                <Text numberOfLines={1} style={styles.sessionText}>
                                    {t("session.currentUser", { value: sessionIdentity })}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => {
                                    void handleSignOut();
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={t("a11y.signOut")}
                                activeOpacity={0.82}
                                style={styles.signOutButton}
                            >
                                <View style={styles.signOutButtonContent}>
                                    <View style={styles.signOutButtonIconWrap}>
                                        <Feather name="log-out" size={15} color="#B62B4D" />
                                    </View>
                                    <Text style={styles.signOutButtonLabel}>{t("button.signOut")}</Text>
                                </View>
                            </TouchableOpacity>
                        </SectionCard>
                    </View>
                </View>
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
        padding: 12,
        gap: 12,
        paddingBottom: 28,
    },
    grid: {
        gap: 12,
    },
    gridDesktop: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
    },
    leftColumn: {
        flex: 2,
        gap: 12,
    },
    rightColumn: {
        flex: 1,
        gap: 12,
    },
    rightColumnMobile: {
        gap: 10,
    },
    ordersListWrap: {
        minHeight: 240,
        maxHeight: 600,
    },
    ordersListWrapMobile: {
        minHeight: 180,
        maxHeight: undefined,
    },
    headerRightWrap: {
        gap: 8,
        alignItems: "flex-end",
    },
    headerRightWrapMobile: {
        alignItems: "stretch",
    },
    headerStats: {
        flexDirection: "row",
        gap: 8,
    },
    headerControls: {
        flexDirection: "row",
        gap: 8,
        flexWrap: "wrap",
        justifyContent: "flex-end",
    },
    headerControlsMobile: {
        width: "100%",
        justifyContent: "flex-start",
        flexDirection: "column",
        alignItems: "stretch",
    },
    headerActionButton: {
        minWidth: 130,
    },
    headerActionButtonMobile: {
        width: "100%",
        minWidth: 0,
    },
    headerLocalButton: {
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
    headerLocalButtonDesktop: {
        minWidth: 130,
    },
    headerLocalButtonMobile: {
        width: "100%",
        minWidth: 0,
    },
    headerLocalButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    headerLocalButtonIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    headerLocalButtonLabel: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B94900",
        fontWeight: "600",
    },
    sectionTopButton: {
        minWidth: 148,
    },
    sectionTopButtonMobile: {
        minWidth: 110,
        minHeight: 38,
    },
    sectionTopLocalButton: {
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
    sectionTopLocalButtonDesktop: {
        minWidth: 148,
    },
    sectionTopLocalButtonMobile: {
        minWidth: 110,
        minHeight: 38,
    },
    sectionTopLocalButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    sectionTopLocalButtonIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    sectionTopLocalButtonLabel: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B94900",
        fontWeight: "600",
    },
    fullWidthButton: {
        width: "100%",
    },
    compactActionButton: {
        width: "100%",
        minHeight: 42,
    },
    signOutButton: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E3A3B2",
        backgroundColor: "#FFF1F4",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    signOutButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    signOutButtonIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    signOutButtonLabel: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B62B4D",
        fontWeight: "600",
    },
    panelActionGroup: {
        gap: 8,
    },
    panelActionBox: {
        borderWidth: 1,
        borderColor: "#E7DCCF",
        borderRadius: 14,
        backgroundColor: "#FFF9F2",
        padding: 8,
    },
    reminderList: {
        gap: 8,
    },
    reminderRow: {
        borderWidth: 1,
        borderColor: "#E7DCCF",
        borderRadius: 12,
        backgroundColor: "#FFF9F2",
        paddingHorizontal: 10,
        paddingVertical: 8,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
    },
    reminderTitle: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#1E2433",
    },
    reminderMeta: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#627189",
    },
    reminderActionButton: {
        minWidth: 96,
        minHeight: 34,
    },
    systemMessageChip: {
        minHeight: 34,
        borderWidth: 1,
        borderColor: "#E7DCCF",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: "#FFF9F2",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    systemMessageText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#627189",
        flex: 1,
    },
    sessionChip: {
        minHeight: 34,
        borderWidth: 1,
        borderColor: "#E7DCCF",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        backgroundColor: "#FFF9F2",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    sessionText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#627189",
        flex: 1,
    },
    skeletonWrap: {
        gap: 10,
    },
    skeletonLineLg: {
        height: 18,
        width: "58%",
        borderRadius: 8,
        backgroundColor: "#EEE5DA",
    },
    skeletonLineMd: {
        height: 14,
        width: "82%",
        borderRadius: 8,
        backgroundColor: "#F4ECE2",
    },
    skeletonLineSm: {
        height: 12,
        width: "40%",
        borderRadius: 8,
        backgroundColor: "#F4ECE2",
    },
});

export default RestaurantPanel;

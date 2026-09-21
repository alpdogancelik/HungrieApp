import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    AccessibilityInfo, ActivityIndicator, AppState,
    Alert,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchUserOrdersPage } from "@/src/data/orderRepository";
import { classifyReviewRepositoryError } from "@/src/data/reviewV2Repository";
import type { OrderCursor } from "@/src/data/contracts";
import type { ReviewItemSnapshot } from "@hungrie/domain";
import type { OrderStatus, RestaurantOrder } from "@/type";
import { ProtectedRoute } from "@/src/features/auth/routeGuards";
import { ReorderError, resolveOrderForReorder } from "@/src/features/orders/reorder";
import { getCancellationReasonText } from "@/src/features/orders/cancellationReason";
import { isCancelledStatus, isReviewableStatus } from "@/src/features/reviews/reviewUtils";
import OrderReviewSheet, { OrderReviewSheetValue } from "@/src/features/reviews/OrderReviewSheet";
import { getCustomerReviewCopy, groupReviewItems } from "@/src/features/reviews/customerReviewUiModel";
import { clearCustomerReviewOperation, submitCustomerReviewWithDurableOperation } from "@/src/features/reviews/customerReviewOperation";
import { markCustomerReviewAsReviewed, markCustomerReviewStatesChecking, refreshCustomerReviewState, refreshCustomerReviewStates, setCustomerReviewAvailabilityProfile, useCustomerReviewAvailability } from "@/src/features/reviews/customerReviewAvailability";
import { useTheme } from "@/src/theme/themeContext";
import { formatCurrency } from "@/lib/cart.utils";
import useAuthStore from "@/store/auth.store";
import { normalizeCartRestaurantKey, useCartStore } from "@/store/cart.store";

type FilterId = "all" | "active" | "delivered" | "canceled";

type OrderItemPreview = {
    itemId?: string;
    name: string;
    quantity: number;
};

type StatusPresentation = {
    background: string;
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
};
type ReviewContext = { orderId: string; restaurantId: string; restaurantName: string; items: ReviewItemSnapshot[] };

const PAGE_SIZE = 20;
const ORANGE = "#FF5A00";
const ORANGE_PRESSED = "#E94F00";
const ACTIVE_STATUSES = new Set<OrderStatus>(["pending", "accepted", "preparing", "ready", "out_for_delivery"]);

const normalizeId = (value: unknown) => (value === null || value === undefined ? "" : String(value));

const resolveRestaurantName = (order: any) =>
    String(
        order?.restaurant?.name ||
        order?.restaurantName ||
        "Restaurant",
    );

const normalizeStatus = (status?: string): OrderStatus => {
    const raw = String(status || "").trim().toLowerCase();
    if (isCancelledStatus(raw) || raw === "rejected") return "canceled";
    if (isReviewableStatus(raw) || raw === "completed") return "delivered";
    if (["accepted", "restaurant_accepted"].includes(raw)) return "accepted";
    if (["hazir", "hazirlandi", "hazirlandı", "hazırlandı", "hazır", "ready_for_pickup"].includes(raw)) return "ready";
    if (["on_the_way", "picked_up", "delivering"].includes(raw)) return "out_for_delivery";
    if (["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(raw)) {
        return raw as OrderStatus;
    }
    return "pending";
};

const filterGroupForStatus = (status?: string): Exclude<FilterId, "all"> => {
    const normalized = normalizeStatus(status);
    if (normalized === "delivered") return "delivered";
    if (normalized === "canceled" || normalized === "rejected") return "canceled";
    return "active";
};

const resolveItems = (order: any): OrderItemPreview[] => {
    const raw = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
    return raw.map((item: any) => ({
        itemId: String(item?.menuItemId ?? item?.itemId ?? item?.id ?? "").trim() || undefined,
        name: String(item?.name || "-").trim() || "-",
        quantity: Math.max(1, Number(item?.quantity ?? 1) || 1),
    }));
};

const getMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (typeof value === "object" && typeof value.seconds === "number") {
        return value.seconds * 1000 + Number(value.nanoseconds || 0) / 1_000_000;
    }
    const millis = new Date(value).getTime();
    return Number.isNaN(millis) ? 0 : millis;
};

const formatOrderDate = (value: unknown, locale: string, todayLabel: string, yesterdayLabel: string) => {
    const millis = getMillis(value);
    if (!millis) return "";

    const date = new Date(millis);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOrderDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDifference = Math.round((startToday - startOrderDay) / 86_400_000);
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

    if (dayDifference === 0) return `${todayLabel} · ${time}`;
    if (dayDifference === 1) return `${yesterdayLabel} · ${time}`;

    const dayAndMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date).replace(/\.$/, "");
    return `${dayAndMonth} · ${time}`;
};

const confirmAction = (title: string, message: string, cancelLabel: string, confirmLabel: string) => {
    if (Platform.OS === "web") {
        const browserConfirm = (globalThis as { confirm?: (copy?: string) => boolean }).confirm;
        return Promise.resolve(browserConfirm ? browserConfirm(`${title}\n\n${message}`) : false);
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        Alert.alert(title, message, [
            { text: cancelLabel, style: "cancel", onPress: () => finish(false) },
            { text: confirmLabel, onPress: () => finish(true) },
        ], { cancelable: true, onDismiss: () => finish(false) });
    });
};

const OrderHistoryScreen = () => {
    const { variant } = useTheme();
    const isDark = variant === "dark";
    const colors = useMemo(() => ({
        page: isDark ? "#0F1115" : Platform.OS === "web" ? "#FAFBFC" : "#FAFAFA",
        surface: isDark ? "#171A20" : "#FFFFFF",
        pressed: isDark ? "#1E222A" : "#F9FAFB",
        primary: isDark ? "#F5F7FA" : "#111318",
        secondary: isDark ? "#AAB2C0" : "#667085",
        tertiary: isDark ? "#7F8999" : "#98A2B3",
        border: isDark ? "#2A2E35" : "#EAECF0",
        cardBorder: isDark ? "#343A45" : "#DDE3EA",
        cardShadow: isDark ? "#000000" : "#101828",
        skeleton: isDark ? "#23272E" : "#F0F2F5",
    }), [isDark]);
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ highlight?: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const { t, i18n } = useTranslation();
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const locale = isTurkish ? "tr-TR" : "en-US";
    const userId = String(user?.accountId ?? user?.id ?? user?.$id ?? "").trim();

    const [orders, setOrders] = useState<RestaurantOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filter, setFilter] = useState<FilterId>("all");
    const [search, setSearch] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [reorderLoadingId, setReorderLoadingId] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<OrderCursor | null>(null);
    const [hasMoreOrders, setHasMoreOrders] = useState(false);
    const [selectedReview, setSelectedReview] = useState<ReviewContext | null>(null);
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState<string | null>(null);

    const copy = useMemo(() => ({
        title: isTurkish ? "Siparişler" : "Orders",
        back: isTurkish ? "Geri" : "Back",
        subtitle: isTurkish ? "Aktif ve geçmiş siparişlerini görüntüle." : "Track current and past orders.",
        search: isTurkish ? "Siparişlerde ara" : "Search orders",
        filters: {
            all: isTurkish ? "Tümü" : "All",
            active: isTurkish ? "Aktif" : "Active",
            delivered: isTurkish ? "Teslim edildi" : "Delivered",
            canceled: isTurkish ? "İptal edildi" : "Canceled",
        } satisfies Record<FilterId, string>,
        today: isTurkish ? "Bugün" : "Today",
        yesterday: isTurkish ? "Dün" : "Yesterday",
        items: (count: number) => isTurkish ? `${count} ürün` : `${count} ${count === 1 ? "item" : "items"}`,
        moreItems: (count: number) => isTurkish ? `+${count} ürün daha` : `+${count} more ${count === 1 ? "item" : "items"}`,
        track: isTurkish ? "Siparişi takip et" : "Track order",
        reorder: isTurkish ? "Tekrarla" : "Reorder",
        reorderA11y: isTurkish ? "Siparişi tekrarla" : "Reorder this order",
        adding: isTurkish ? "Ekleniyor..." : "Adding...",
        cancel: isTurkish ? "Vazgeç" : "Cancel",
        partialTitle: isTurkish ? "Bazı ürünler değişti" : "Some items have changed",
        partialBody: (count: number) => isTurkish
            ? `${count} ürün artık kullanılamıyor. Kalan ürünleri sepetine ekleyebilirsin.`
            : `${count} ${count === 1 ? "item is" : "items are"} no longer available. You can add the remaining items to your cart.`,
        addAvailable: isTurkish ? "Uygun ürünleri ekle" : "Add available items",
        noneTitle: isTurkish ? "Tekrar sipariş verilemiyor" : "Unable to reorder",
        noneBody: isTurkish ? "Bu siparişteki ürünler şu anda tekrar sipariş edilemiyor." : "Items from this order are currently unavailable.",
        restaurantBody: isTurkish ? "Bu restoran şu anda sipariş kabul etmiyor." : "This restaurant is not accepting orders right now.",
        errorBody: isTurkish ? "Menü yüklenemedi. Lütfen tekrar dene." : "The menu could not be loaded. Please try again.",
        conflictTitle: isTurkish ? "Yeni bir sepet başlatılsın mı?" : "Start a new cart?",
        conflictBody: isTurkish
            ? "Sepetinde başka bir restorandan ürünler var. Bu ürünleri kaldırıp bu siparişi tekrar eklemek ister misin?"
            : "Your cart contains items from another restaurant. Remove them and add this order instead?",
        replaceCart: isTurkish ? "Yeni sepet başlat" : "Start new cart",
        noOrders: isTurkish ? "Henüz sipariş yok" : "No orders yet",
        noOrdersBody: isTurkish ? "Siparişlerin burada görünecek." : "Your orders will appear here.",
        noMatches: isTurkish ? "Sipariş bulunamadı" : "No matching orders",
        noMatchesBody: isTurkish ? "Farklı bir arama deneyin." : "Try another search.",
        noActive: isTurkish ? "Aktif sipariş yok" : "No active orders",
        noActiveBody: isTurkish ? "Aktif siparişlerin burada görünecek." : "Your active orders will appear here.",
        noDelivered: isTurkish ? "Teslim edilmiş sipariş yok" : "No delivered orders",
        noCanceled: isTurkish ? "İptal edilmiş sipariş yok" : "No canceled orders",
        cancellationReason: isTurkish ? "İptal nedeni" : "Cancellation reason",
        browse: isTurkish ? "Restoranlara göz at" : "Browse restaurants",
        status: {
            pending: isTurkish ? "Bekliyor" : "Pending",
            accepted: isTurkish ? "Hazırlanıyor" : "Preparing",
            preparing: isTurkish ? "Hazırlanıyor" : "Preparing",
            ready: isTurkish ? "Hazır" : "Ready",
            out_for_delivery: isTurkish ? "Yolda" : "On the way",
            delivered: isTurkish ? "Teslim edildi" : "Delivered",
            canceled: isTurkish ? "İptal edildi" : "Canceled",
            rejected: isTurkish ? "İptal edildi" : "Canceled",
        } satisfies Record<OrderStatus, string>,
    }), [isTurkish]);
    const reviewCopy = useMemo(() => getCustomerReviewCopy(isTurkish), [isTurkish]);

    const loadOrders = useCallback(async () => {
        if (!userId) {
            setOrders([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const page = await fetchUserOrdersPage(userId, { limit: PAGE_SIZE });
            setOrders((page.items as RestaurantOrder[]) || []);
            setNextCursor(page.nextCursor);
            setHasMoreOrders(page.hasMore);
            const deliveredIds = (page.items as RestaurantOrder[]).filter((entry) => isReviewableStatus(entry.status)).map((entry) => String(entry.id ?? entry.$id ?? "")).filter(Boolean);
            setCustomerReviewAvailabilityProfile(userId);
            await refreshCustomerReviewStates(userId, deliveredIds, true);
        } catch {
            setOrders([]);
            setNextCursor(null);
            setHasMoreOrders(false);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useFocusEffect(useCallback(() => { void loadOrders(); }, [loadOrders]));
    useEffect(() => {
        if (!userId) return;
        setCustomerReviewAvailabilityProfile(userId);
        const subscription = AppState.addEventListener("change", (state) => {
            if (state !== "active") return;
            markCustomerReviewStatesChecking(userId);
            void loadOrders();
        });
        return () => subscription.remove();
    }, [loadOrders, userId]);

    const refreshOrders = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadOrders();
        } finally {
            setRefreshing(false);
        }
    }, [loadOrders]);

    const visibleOrders = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(locale);
        const normalizedQuery = query.replace(/^#/, "");

        return orders
            .filter((order) => {
                if (filter !== "all" && filterGroupForStatus(order.status) !== filter) return false;
                if (!query) return true;

                const restaurant = resolveRestaurantName(order).toLocaleLowerCase(locale);
                const orderId = String(order.id ?? order.$id ?? "").toLocaleLowerCase(locale);
                const itemNames = resolveItems(order).map((item) => item.name.toLocaleLowerCase(locale)).join(" ");
                return restaurant.includes(query) || orderId.includes(query) || orderId.replace(/^#/, "").includes(normalizedQuery) || itemNames.includes(query);
            })
            .sort((left, right) => getMillis(right.updatedAt || right.createdAt) - getMillis(left.updatedAt || left.createdAt));
    }, [filter, locale, orders, search]);

    const handleLoadMore = useCallback(async () => {
        if (!userId || !hasMoreOrders || !nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const page = await fetchUserOrdersPage(userId, { cursor: nextCursor, limit: PAGE_SIZE });
            setOrders((current) => {
                const byId = new Map(current.map((order) => [String(order.id ?? order.$id), order]));
                for (const order of page.items as RestaurantOrder[]) byId.set(String(order.id ?? order.$id), order);
                return [...byId.values()];
            });
            setNextCursor(page.nextCursor);
            setHasMoreOrders(page.hasMore);
            const deliveredIds = (page.items as RestaurantOrder[]).filter((entry) => isReviewableStatus(entry.status)).map((entry) => String(entry.id ?? entry.$id ?? "")).filter(Boolean);
            await refreshCustomerReviewStates(userId, deliveredIds);
        } finally {
            setLoadingMore(false);
        }
    }, [hasMoreOrders, loadingMore, nextCursor, userId]);

    const contextFromOrder = useCallback((order: RestaurantOrder): ReviewContext | null => {
        const orderId = String(order.id ?? order.$id ?? "").trim();
        const restaurantId = String((order as any).restaurantId || (order as any).restaurant?.id || "").trim();
        if (!orderId || !restaurantId) return null;
        return { orderId, restaurantId, restaurantName: resolveRestaurantName(order), items: groupReviewItems(resolveItems(order).map((item) => ({ menuItemId: item.itemId, name: item.name, quantity: item.quantity }))) };
    }, []);

    const openReview = useCallback(async (context: ReviewContext) => {
        if (!userId || reviewSubmitting) return;
        const current = await refreshCustomerReviewState(userId, context.orderId, true);
        if (current.status === "eligible") { setReviewError(null); setSelectedReview(context); }
    }, [reviewSubmitting, userId]);

    const submitReview = useCallback(async (value: OrderReviewSheetValue) => {
        if (!selectedReview || !userId || reviewSubmitting) return;
        setReviewSubmitting(true); setReviewError(null);
        try {
            const current = await refreshCustomerReviewState(userId, selectedReview.orderId, true);
            if (current.status !== "eligible") { setSelectedReview(null); return; }
            await submitCustomerReviewWithDurableOperation(userId, { ...value, orderId: selectedReview.orderId, restaurantId: selectedReview.restaurantId });
            markCustomerReviewAsReviewed(userId, selectedReview.orderId);
            setSelectedReview(null);
            AccessibilityInfo.announceForAccessibility(reviewCopy.completed);
        } catch (error) {
            const classified = classifyReviewRepositoryError(error);
            if (classified.code === "already_reviewed" || classified.code === "review_expired") {
                await refreshCustomerReviewState(userId, selectedReview.orderId, true);
                setSelectedReview(null);
            } else setReviewError(reviewCopy.errors[classified.code]);
        } finally { setReviewSubmitting(false); }
    }, [reviewCopy, reviewSubmitting, selectedReview, userId]);

    const openOrderDetails = useCallback((order: RestaurantOrder) => {
        const orderId = String(order.id ?? order.$id ?? "").trim();
        if (!orderId) return;
        router.push({ pathname: "/orders/[id]", params: { id: orderId } });
    }, [router]);

    const trackOrder = useCallback((order: RestaurantOrder) => {
        const orderId = String(order.id ?? order.$id ?? "").trim();
        if (!orderId) return;
        router.push({
            pathname: "/order/pending",
            params: {
                orderId,
                restaurantName: resolveRestaurantName(order),
                eta: String((order as any).eta ?? (order as any).etaMinutes ?? 120),
            },
        });
    }, [router]);

    const handleReorder = useCallback(async (order: RestaurantOrder) => {
        const orderId = String(order.id ?? order.$id ?? "").trim();
        if (!orderId || reorderLoadingId) return;
        setReorderLoadingId(orderId);

        try {
            const resolution = await resolveOrderForReorder(order);
            if (!resolution.cartItems.length) {
                Alert.alert(copy.noneTitle, copy.noneBody);
                return;
            }

            if (resolution.unavailableItems.length) {
                const continuePartial = await confirmAction(
                    copy.partialTitle,
                    copy.partialBody(resolution.unavailableItems.length),
                    copy.cancel,
                    copy.addAvailable,
                );
                if (!continuePartial) return;
            }

            const cart = useCartStore.getState();
            const targetRestaurant = normalizeCartRestaurantKey(resolution.restaurantId);
            const existingRestaurant = normalizeCartRestaurantKey(cart.restaurantId);
            const hasConflict = cart.items.length > 0 && (!targetRestaurant || existingRestaurant !== targetRestaurant);
            let replaceExisting = false;

            if (hasConflict) {
                replaceExisting = await confirmAction(
                    copy.conflictTitle,
                    copy.conflictBody,
                    copy.cancel,
                    copy.replaceCart,
                );
                if (!replaceExisting) return;
            }

            const committed = useCartStore.getState().addItems(resolution.cartItems, { replaceExisting });
            if (!committed) {
                Alert.alert(copy.noneTitle, copy.errorBody);
                return;
            }
            router.push("/(tabs)/cart");
        } catch (error) {
            Alert.alert(
                copy.noneTitle,
                error instanceof ReorderError && error.code === "restaurant_unavailable" ? copy.restaurantBody : copy.errorBody,
            );
        } finally {
            setReorderLoadingId(null);
        }
    }, [copy, reorderLoadingId, router]);

    const statusPresentation = useCallback((status: OrderStatus): StatusPresentation => {
        if (status === "delivered") return { background: isDark ? "#173526" : "#EBF9F1", color: isDark ? "#62D99A" : "#3DBD78", icon: "checkmark-circle-outline", label: copy.status.delivered };
        if (status === "canceled" || status === "rejected") return { background: isDark ? "#3A2021" : "#FFF1F1", color: isDark ? "#FF8B83" : "#D92D20", icon: "close-circle-outline", label: copy.status[status] };
        if (status === "ready") return { background: isDark ? "#173526" : "#EEF8F1", color: isDark ? "#62D99A" : "#138A45", icon: "checkmark-circle-outline", label: copy.status.ready };
        return { background: isDark ? "#382C19" : "#FFF4E5", color: isDark ? "#FFB44D" : "#F79009", icon: "time-outline", label: copy.status[status] };
    }, [copy.status, isDark]);

    const renderHeader = () => (
        <View style={styles.header}>
            <View style={styles.headerTop}>
                <Pressable
                    accessibilityLabel={copy.back}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/home")}
                    style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
                >
                    <Ionicons color={colors.primary} name="chevron-back" size={20} />
                </Pressable>
                <Text style={styles.title}>{copy.title}</Text>
                <View style={styles.headerSpacer} />
            </View>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>
            {params.highlight ? <Text style={styles.highlight}>{isTurkish ? `Sipariş #${params.highlight} onaylandı.` : `Order #${params.highlight} was confirmed.`}</Text> : null}
            <View style={[styles.searchField, searchFocused && styles.searchFieldFocused]}>
                <Ionicons name="search-outline" size={18} color={colors.secondary} />
                <TextInput
                    accessibilityLabel={copy.search}
                    onBlur={() => setSearchFocused(false)}
                    onChangeText={setSearch}
                    onFocus={() => setSearchFocused(true)}
                    placeholder={copy.search}
                    placeholderTextColor={colors.tertiary}
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={search}
                />
                {search ? (
                    <Pressable accessibilityLabel={isTurkish ? "Aramayı temizle" : "Clear search"} accessibilityRole="button" hitSlop={12} onPress={() => setSearch("")} style={styles.clearSearch}>
                        <Ionicons name="close-circle" size={18} color={colors.tertiary} />
                    </Pressable>
                ) : null}
            </View>

            <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
                {(Object.keys(copy.filters) as FilterId[]).map((id) => {
                    const active = filter === id;
                    return (
                        <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={id} onPress={() => setFilter(id)} style={styles.filterTab}>
                            <Text style={[styles.filterText, active && styles.filterTextActive]}>{copy.filters[id]}</Text>
                            <View style={[styles.filterUnderline, active && styles.filterUnderlineActive]} />
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );

    const renderOrder = ({ item }: { item: RestaurantOrder }) => {
        const status = normalizeStatus(item.status);
        const statusUi = statusPresentation(status);
        const items = resolveItems(item);
        const shownItems = items.slice(0, 2);
        const hiddenCount = Math.max(0, items.length - shownItems.length);
        const itemCount = items.reduce((sum, orderItem) => sum + orderItem.quantity, 0);
        const restaurantName = resolveRestaurantName(item);
        const orderDate = formatOrderDate(item.updatedAt || item.createdAt, locale, copy.today, copy.yesterday);
        const isActive = ACTIVE_STATUSES.has(status);
        const canReorder = status === "delivered";
        const reordering = reorderLoadingId === String(item.id ?? item.$id ?? "");
        const reviewContext = canReorder ? contextFromOrder(item) : null;
        const cancellationReason = status === "canceled"
            ? getCancellationReasonText(item.cancellationReasonCode, Boolean(isTurkish))
            : "";

        return (
            <View style={styles.orderCard}>
            <Pressable
                accessibilityHint={isActive ? copy.track : undefined}
                accessibilityLabel={`${restaurantName}, ${statusUi.label}, ${orderDate}, ${copy.items(itemCount)}, ${formatCurrency(Number(item.total || 0))}`}
                accessibilityRole="button"
                onPress={() => openOrderDetails(item)}
                style={({ pressed }) => pressed && styles.orderCardPressed}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.cardHeadingCopy}>
                        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.restaurantName}>{restaurantName}</Text>
                        {orderDate ? <Text numberOfLines={1} style={styles.orderDate}>{orderDate}</Text> : null}
                    </View>
                    <View style={styles.statusAndChevron}>
                        <View style={[styles.statusBadge, { backgroundColor: statusUi.background }]}>
                            <Ionicons color={statusUi.color} name={statusUi.icon} size={15} />
                            <Text numberOfLines={1} style={[styles.statusText, { color: statusUi.color }]}>{statusUi.label}</Text>
                        </View>
                        <Ionicons color={colors.tertiary} name="chevron-forward" size={16} />
                    </View>
                </View>

                <View style={styles.itemsPreview}>
                    {shownItems.length ? shownItems.map((orderItem, index) => (
                        <Text ellipsizeMode="tail" key={`${String(item.id ?? item.$id)}-${orderItem.itemId || orderItem.name}-${index}`} numberOfLines={1} style={styles.productLine}>
                            {orderItem.quantity}× {orderItem.name}
                        </Text>
                    )) : <Text style={styles.productLine}>{isTurkish ? "Ürün bilgisi bulunmuyor" : "Item details unavailable"}</Text>}
                    {hiddenCount > 0 ? <Text style={styles.moreItems}>{copy.moreItems(hiddenCount)}</Text> : null}
                </View>

                {cancellationReason ? <View style={styles.cancellationRow}><Ionicons color="#D92D20" name="information-circle-outline" size={16} /><Text numberOfLines={2} style={styles.cancellationText}><Text style={styles.cancellationLabel}>{copy.cancellationReason}: </Text>{cancellationReason}</Text></View> : null}

                <View style={styles.cardFooter}>
                    <Text numberOfLines={1} style={styles.footerMeta}>
                        {copy.items(itemCount)} · <Text style={styles.price}>{formatCurrency(Number(item.total || 0))}</Text>
                    </Text>
                    {isActive ? (
                        <Pressable
                            accessibilityLabel={copy.track}
                            accessibilityRole="button"
                            hitSlop={10}
                            onPress={(event) => {
                                event.stopPropagation();
                                trackOrder(item);
                            }}
                            style={({ pressed }) => styles.contextAction}
                        >
                            {({ pressed }) => (
                                <>
                                    <Text numberOfLines={1} style={[styles.contextActionText, pressed && { color: ORANGE_PRESSED }]}>{copy.track}</Text>
                                    <Ionicons color={pressed ? ORANGE_PRESSED : ORANGE} name="arrow-forward" size={16} />
                                </>
                            )}
                        </Pressable>
                    ) : canReorder ? (
                        <Pressable
                            accessibilityLabel={copy.reorderA11y}
                            accessibilityRole="button"
                            disabled={Boolean(reorderLoadingId)}
                            hitSlop={10}
                            onPress={(event) => {
                                event.stopPropagation();
                                void handleReorder(item);
                            }}
                            style={styles.contextAction}
                        >
                            {reordering ? (
                                <><ActivityIndicator color={ORANGE} size={15} /><Text style={styles.contextActionText}>{copy.adding}</Text></>
                            ) : (
                                <><Text style={styles.contextActionText}>{copy.reorder}</Text><Ionicons color={ORANGE} name="arrow-forward" size={16} /></>
                            )}
                        </Pressable>
                    ) : null}
                </View>
                {reviewContext ? <View style={styles.reviewActionRow}><RowReviewAction profileId={userId} context={reviewContext} copy={reviewCopy} mutedColor={colors.secondary} onOpen={openReview} /></View> : null}
            </Pressable>
            </View>
        );
    };

    const emptyCopy = search.trim()
        ? { title: copy.noMatches, body: copy.noMatchesBody, browse: false }
        : filter === "active"
          ? { title: copy.noActive, body: copy.noActiveBody, browse: false }
          : filter === "delivered"
            ? { title: copy.noDelivered, body: copy.noOrdersBody, browse: false }
            : filter === "canceled"
              ? { title: copy.noCanceled, body: copy.noOrdersBody, browse: false }
              : { title: copy.noOrders, body: copy.noOrdersBody, browse: true };

    const renderEmpty = () => {
        if (loading && !orders.length) {
            return <View style={styles.skeletonList}>{[0, 1, 2].map((index) => <OrderSkeleton key={index} styles={styles} />)}</View>;
        }

        return (
            <View style={styles.emptyState}>
                <View style={styles.emptyIcon}><Ionicons color={ORANGE} name="receipt-outline" size={29} /></View>
                <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
                <Text style={styles.emptyBody}>{emptyCopy.body}</Text>
                {emptyCopy.browse ? (
                    <Pressable accessibilityRole="button" onPress={() => router.push("/search")} style={styles.browseAction}>
                        <Text style={styles.browseText}>{copy.browse}</Text><Ionicons color={ORANGE} name="arrow-forward" size={16} />
                    </Pressable>
                ) : null}
            </View>
        );
    };

    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
            <FlatList
                contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 18) + 22 }]}
                data={visibleOrders}
                ItemSeparatorComponent={() => <View style={styles.cardGap} />}
                keyExtractor={(item) => String(item.id ?? item.$id)}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={renderEmpty}
                ListFooterComponent={loadingMore ? <ActivityIndicator color={ORANGE} style={styles.loader} /> : null}
                ListHeaderComponent={renderHeader}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.4}
                refreshControl={<RefreshControl onRefresh={() => void refreshOrders()} refreshing={refreshing} tintColor={ORANGE} />}
                renderItem={renderOrder}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={[0]}
            />
            <OrderReviewSheet visible={Boolean(selectedReview)} restaurantName={selectedReview?.restaurantName || ""} items={selectedReview?.items || []} submitting={reviewSubmitting} errorText={reviewError} onClose={() => setSelectedReview(null)} onDiscard={async () => { if (selectedReview) await clearCustomerReviewOperation(userId, selectedReview.orderId); }} onSubmit={submitReview} />
        </SafeAreaView>
    );
};

const RowReviewAction = ({ profileId, context, copy, mutedColor, onOpen }: { profileId: string; context: ReviewContext; copy: ReturnType<typeof getCustomerReviewCopy>; mutedColor: string; onOpen: (context: ReviewContext) => Promise<void> }) => {
    const state = useCustomerReviewAvailability(profileId, context.orderId);
    if (state.status === "checking") return <ActivityIndicator color={ORANGE} size={15} />;
    if (state.status === "reviewed") return <View style={stylesStatic.reviewed}><Ionicons color={mutedColor} name="checkmark" size={15} /><Text style={[stylesStatic.reviewedText, { color: mutedColor }]}>{copy.completed}</Text></View>;
    if (state.status !== "eligible") return null;
    return <Pressable accessibilityRole="button" accessibilityLabel={copy.entry} onPress={(event) => { event.stopPropagation(); void onOpen(context); }} style={stylesStatic.rowReview}><Ionicons color={ORANGE} name="star-outline" size={16} /><Text style={stylesStatic.rowReviewText}>{copy.entry}</Text></Pressable>;
};

const stylesStatic = StyleSheet.create({
    rowReview: { minHeight: 38, borderRadius: 11, borderWidth: 1, borderColor: ORANGE, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, rowReviewText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, fontWeight: "700" },
    reviewed: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 4 }, reviewedText: { fontFamily: "ChairoSans", fontSize: 13, fontWeight: "600" },
});

const OrderSkeleton = ({ styles }: { styles: ReturnType<typeof createStyles> }) => (
    <View style={styles.skeletonCard}>
        <View style={styles.skeletonHeader}><View style={styles.skeletonTitle} /><View style={styles.skeletonBadge} /></View>
        <View style={styles.skeletonDate} />
        <View style={styles.skeletonLine} /><View style={styles.skeletonLineShort} />
        <View style={styles.skeletonFooter} />
    </View>
);

type Colors = {
    page: string;
    surface: string;
    pressed: string;
    primary: string;
    secondary: string;
    tertiary: string;
    border: string;
    cardBorder: string;
    cardShadow: string;
    skeleton: string;
};

const createStyles = (colors: Colors) => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.page },
    listContent: { flexGrow: 1, paddingHorizontal: Platform.OS === "web" ? 22 : 14 },
    header: {
        marginHorizontal: Platform.OS === "web" ? -22 : -14,
        paddingHorizontal: Platform.OS === "web" ? 22 : 14,
        paddingBottom: 16,
        backgroundColor: colors.page,
        zIndex: 3,
        ...Platform.select({
            android: { elevation: 3, shadowColor: "transparent" },
            default: {},
        }),
    },
    headerTop: { width: "100%", height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    backButton: { width: 44, height: 44, marginLeft: -10, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    backButtonPressed: { backgroundColor: colors.pressed },
    headerSpacer: { width: 34, height: 44 },
    title: { color: colors.primary, fontFamily: "ChairoSans", fontSize: 21, lineHeight: 26, fontWeight: "700" },
    subtitle: { color: colors.secondary, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, marginTop: 2, textAlign: "center" },
    highlight: { color: "#138A45", fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, marginTop: 7 },
    searchField: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 16, paddingLeft: 14, paddingRight: 5, flexDirection: "row", alignItems: "center", gap: 10 },
    searchFieldFocused: { borderColor: ORANGE },
    searchInput: { flex: 1, height: "100%", paddingVertical: 0, color: colors.primary, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19 },
    clearSearch: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
    filters: { minWidth: "100%", height: 44, flexDirection: "row", alignItems: "stretch", gap: 25 },
    filterTab: { minHeight: 44, flexShrink: 0, justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 1 },
    filterText: { color: colors.secondary, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, fontWeight: "500", paddingBottom: 9 },
    filterTextActive: { color: ORANGE, fontWeight: "600" },
    filterUnderline: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
    filterUnderlineActive: { backgroundColor: ORANGE },
    cardGap: { height: 14 },
    orderCard: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: 18,
        padding: 15,
        ...Platform.select({
            ios: {
                shadowColor: colors.cardShadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.14,
                shadowRadius: 9,
            },
            android: { elevation: 2 },
            web: { boxShadow: `0 3px 12px ${colors.cardShadow}14` },
            default: {},
        }),
    },
    orderCardPressed: { opacity: 0.8 },
    cardHeader: { minHeight: 39, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
    cardHeadingCopy: { flex: 1, minWidth: 0 },
    restaurantName: { color: colors.primary, fontFamily: "ChairoSans", fontSize: 16, lineHeight: 21, fontWeight: "700" },
    orderDate: { color: colors.secondary, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 17, marginTop: 2 },
    statusAndChevron: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 7 },
    statusBadge: { height: 28, borderRadius: 999, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
    statusText: { fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 16, fontWeight: "600" },
    itemsPreview: { gap: 3, marginTop: 12 },
    productLine: { color: colors.secondary, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 18, fontWeight: "500" },
    moreItems: { color: colors.tertiary, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 17, fontWeight: "500" },
    cancellationRow: { marginTop: 9, borderRadius: 11, backgroundColor: colors.pressed, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "flex-start", gap: 7 }, cancellationText: { flex: 1, color: colors.secondary, fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 17 }, cancellationLabel: { color: colors.primary, fontWeight: "700" },
    cardFooter: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 14 },
    reviewActionRow: { minHeight: 38, marginTop: 7, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
    footerMeta: { flex: 1, minWidth: 0, color: colors.secondary, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 20 },
    price: { color: colors.primary, fontSize: 16, fontWeight: "700" },
    contextAction: { minHeight: 44, marginVertical: -8, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    contextActionText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 18, fontWeight: "600" },
    emptyState: { paddingTop: 48, paddingHorizontal: 20, alignItems: "center" },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.pressed, alignItems: "center", justifyContent: "center" },
    emptyTitle: { color: colors.primary, fontFamily: "ChairoSans", fontSize: 16, lineHeight: 21, fontWeight: "600", marginTop: 12 },
    emptyBody: { color: colors.secondary, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, textAlign: "center", marginTop: 3 },
    browseAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
    browseText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, fontWeight: "600" },
    loader: { marginVertical: 18 },
    skeletonList: { gap: 14 },
    skeletonCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 18, padding: 15 },
    skeletonHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    skeletonTitle: { width: "42%", height: 18, borderRadius: 5, backgroundColor: colors.skeleton },
    skeletonBadge: { width: 86, height: 28, borderRadius: 14, backgroundColor: colors.skeleton },
    skeletonDate: { width: 84, height: 12, borderRadius: 4, backgroundColor: colors.skeleton, marginTop: 7 },
    skeletonLine: { width: "72%", height: 13, borderRadius: 4, backgroundColor: colors.skeleton, marginTop: 14 },
    skeletonLineShort: { width: "55%", height: 13, borderRadius: 4, backgroundColor: colors.skeleton, marginTop: 6 },
    skeletonFooter: { width: "35%", height: 18, borderRadius: 4, backgroundColor: colors.skeleton, marginTop: 14 },
});

export default function OrderHistoryRoute() {
    return <ProtectedRoute><OrderHistoryScreen /></ProtectedRoute>;
}

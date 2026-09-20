import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, Clipboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { formatCurrency } from "@/lib/cart.utils";
import { fetchAuthorizedOrder, subscribeOrder } from "@/src/data/orderRepository";
import { classifyReviewRepositoryError } from "@/src/data/reviewV2Repository";
import { ReorderError, resolveOrderForReorder } from "@/src/features/orders/reorder";
import { getCancellationReasonText } from "@/src/features/orders/cancellationReason";
import OrderReviewSheet, { OrderReviewSheetValue } from "@/src/features/reviews/OrderReviewSheet";
import { getCustomerReviewCopy, groupReviewItems } from "@/src/features/reviews/customerReviewUiModel";
import { clearCustomerReviewOperation, submitCustomerReviewWithDurableOperation } from "@/src/features/reviews/customerReviewOperation";
import { markCustomerReviewAsReviewed, refreshCustomerReviewState, setCustomerReviewAvailabilityProfile, useCustomerReviewAvailability } from "@/src/features/reviews/customerReviewAvailability";
import { isReviewableStatus } from "@/src/features/reviews/reviewUtils";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useTheme } from "@/src/theme/themeContext";
import { normalizeCartRestaurantKey, useCartStore } from "@/store/cart.store";
import useAuthStore from "@/store/auth.store";

type Props = { orderId: string };
const ORANGE = "#FF5A00";
const ORANGE_PRESSED = "#E94F00";

const getMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (typeof value === "object" && typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizedStatus = (value: unknown) => {
    const status = String(value || "").trim().toLowerCase();
    if (["delivered", "completed"].includes(status)) return "delivered";
    if (["canceled", "cancelled", "rejected"].includes(status)) return "canceled";
    if (["ready", "ready_for_pickup"].includes(status)) return "ready";
    if (["out_for_delivery", "on_the_way", "picked_up", "delivering"].includes(status)) return "out_for_delivery";
    return status === "pending" ? "pending" : "preparing";
};

const historicalModifierText = (item: any) => {
    const values = [item?.customizations, item?.modifiers, item?.options, item?.selectedOptions]
        .filter(Array.isArray)
        .flat()
        .map((entry: any) => String(typeof entry === "string" ? entry : entry?.name || entry?.label || entry?.value || "").trim())
        .filter(Boolean);
    const itemNote = String(item?.note || item?.itemNote || "").trim();
    if (itemNote) values.push(itemNote);
    return [...new Set(values)].join(" · ");
};

const resolveItems = (order: any, fallbackName: string) =>
    (Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : []).map((item: any) => ({
        ...item,
        itemId: String(item?.menuItemId ?? item?.itemId ?? item?.id ?? "").trim(),
        name: String(item?.name || fallbackName),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        customizations: Array.isArray(item?.customizations) ? item.customizations : [],
        modifierText: historicalModifierText(item),
    }));

const restaurantName = (order: any, fallbackName: string) => {
    const direct = order?.restaurantName || order?.restaurant?.name;
    if (direct) return String(direct);
    return String(fallbackName);
};

const formatFullOrderDate = (value: unknown, locale: string, use24HourClock: boolean) => {
    const millis = getMillis(value);
    if (!millis) return "";

    const orderDate = new Date(millis);
    const date = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(orderDate);
    const time = new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        hour12: !use24HourClock,
    }).format(orderDate);
    return `${date} · ${time}`;
};

const customerOrderNumber = (order: any) => {
    const preferred = order?.orderNumber ?? order?.displayId ?? order?.referenceNumber ?? order?.reference ?? order?.number;
    if (preferred) return String(preferred).startsWith("#") ? String(preferred) : `#${preferred}`;
    const id = String(order?.id || order?.$id || "");
    const compact = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id.slice(-8).toUpperCase() : id;
    return compact ? `#${compact}` : "—";
};

const confirmAction = (title: string, message: string, cancel: string, confirm: string) => {
    if (Platform.OS === "web") return Promise.resolve((globalThis as any).confirm?.(`${title}\n\n${message}`) ?? false);
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (result: boolean) => { if (!settled) { settled = true; resolve(result); } };
        Alert.alert(title, message, [
            { text: cancel, style: "cancel", onPress: () => finish(false) },
            { text: confirm, onPress: () => finish(true) },
        ], { cancelable: true, onDismiss: () => finish(false) });
    });
};

export default function OrderDetailsScreen({ orderId }: Props) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { variant } = useTheme();
    const { i18n } = useTranslation();
    const user = useAuthStore((state) => state.user);
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const locale = isTurkish ? "tr-TR" : "en-US";
    const userId = String(user?.accountId ?? user?.id ?? user?.$id ?? "");
    const dark = variant === "dark";
    const colors = useMemo(() => ({
        page: dark ? "#0F1115" : "#FAFBFC", surface: dark ? "#171A20" : "#FFFFFF",
        primary: dark ? "#F5F7FA" : "#111318", secondary: dark ? "#A8B0BF" : "#667085",
        tertiary: dark ? "#7F8999" : "#98A2B3", border: dark ? "#2A2E35" : "#EAECF0",
        pressed: dark ? "#22262E" : "#F5F6F8", softOrange: dark ? "#38261D" : "#FFF1E7",
        skeleton: dark ? "#252930" : "#EFF1F4",
    }), [dark]);
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const copy = useMemo(() => ({
        title: isTurkish ? "Sipariş detayı" : "Order details", back: isTurkish ? "Geri" : "Back",
        summary: isTurkish ? "Sipariş özeti" : "Order summary", orderNumber: isTurkish ? "Sipariş No" : "Order number",
        copy: isTurkish ? "Sipariş numarasını kopyala" : "Copy order number", copied: isTurkish ? "Sipariş numarası kopyalandı." : "Order number copied.",
        total: isTurkish ? "Toplam" : "Total", address: isTurkish ? "Teslimat adresi" : "Delivery address",
        orderNote: isTurkish ? "Restorana not" : "Note to restaurant", review: isTurkish ? "Siparişi değerlendir" : "Review order",
        reviewed: isTurkish ? "Değerlendirildi" : "Reviewed", reorder: isTurkish ? "Siparişi tekrarla" : "Reorder",
        adding: isTurkish ? "Ekleniyor..." : "Adding...", notFound: isTurkish ? "Sipariş bulunamadı." : "Order not found.",
        retry: isTurkish ? "Tekrar dene" : "Try again", noAddress: isTurkish ? "Adres bilgisi bulunmuyor." : "Address information unavailable.",
        restaurantFallback: isTurkish ? "Restoran" : "Restaurant", itemFallback: isTurkish ? "Menü ürünü" : "Menu item",
        status: { delivered: isTurkish ? "Teslim edildi" : "Delivered", canceled: isTurkish ? "İptal edildi" : "Canceled", ready: isTurkish ? "Hazır" : "Ready", out_for_delivery: isTurkish ? "Yolda" : "On the way", preparing: isTurkish ? "Hazırlanıyor" : "Preparing", pending: isTurkish ? "Bekliyor" : "Pending" },
        partialTitle: isTurkish ? "Bazı ürünler değişti" : "Some items have changed", cancel: isTurkish ? "Vazgeç" : "Cancel",
        partial: (count: number) => isTurkish ? `${count} ürün artık kullanılamıyor. Kalan ürünler eklensin mi?` : `${count} ${count === 1 ? "item is" : "items are"} unavailable. Add the remaining items?`,
        addAvailable: isTurkish ? "Uygun ürünleri ekle" : "Add available items", unavailable: isTurkish ? "Bu sipariş şu anda tekrarlanamıyor." : "This order cannot be reordered right now.",
        cartTitle: isTurkish ? "Yeni bir sepet başlatılsın mı?" : "Start a new cart?", cartBody: isTurkish ? "Sepetinde başka bir restorandan ürünler var. Mevcut sepet değiştirilsin mi?" : "Your cart contains items from another restaurant. Replace the current cart?",
        replace: isTurkish ? "Yeni sepet başlat" : "Start new cart", reviewSaved: isTurkish ? "Değerlendirmen kaydedildi." : "Your review was saved.",
        cancellationReason: isTurkish ? "İptal nedeni" : "Cancellation reason",
        restaurantMessage: isTurkish ? "Restoranın mesajı" : "Restaurant message",
    }), [isTurkish]);
    const reviewCopy = useMemo(() => getCustomerReviewCopy(Boolean(isTurkish)), [isTurkish]);

    const [order, setOrder] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [reviewVisible, setReviewVisible] = useState(false);
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState<string | null>(null);
    const [reordering, setReordering] = useState(false);

    const load = useCallback(async () => {
        if (!orderId) { setFailed(true); setLoading(false); return; }
        setLoading(true); setFailed(false);
        try { setOrder(await fetchAuthorizedOrder(orderId)); } catch { setOrder(null); setFailed(true); }
        finally { setLoading(false); }
    }, [orderId]);

    useEffect(() => { void load(); const unsubscribe = orderId ? subscribeOrder(orderId, (next) => { if (next) setOrder(next); }) : undefined; return () => unsubscribe?.(); }, [load, orderId]);
    useEffect(() => { if (userId) { setCustomerReviewAvailabilityProfile(userId); void refreshCustomerReviewState(userId, orderId, true); } }, [orderId, userId]);
    useEffect(() => {
        if (!userId || !orderId) return;
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") void refreshCustomerReviewState(userId, orderId, true);
        });
        return () => subscription.remove();
    }, [orderId, userId]);
    const reviewAvailability = useCustomerReviewAvailability(userId, orderId);

    const items = useMemo(() => resolveItems(order, copy.itemFallback), [copy.itemFallback, order]);
    const reviewItems = useMemo(() => groupReviewItems(items.map((item: any) => ({ menuItemId: item.itemId, name: item.name, quantity: item.quantity }))), [items]);
    const status = normalizedStatus(order?.status) as keyof typeof copy.status;
    const delivered = status === "delivered" && isReviewableStatus(order?.status);
    const statusUi = status === "delivered" ? { bg: dark ? "#173526" : "#EBF9F1", color: dark ? "#62D99A" : "#3DBD78", icon: "checkmark-circle-outline" as const } : status === "canceled" ? { bg: dark ? "#3A2021" : "#FFF1F1", color: dark ? "#FF8B83" : "#D92D20", icon: "close-circle-outline" as const } : { bg: dark ? "#382C19" : "#FFF4E5", color: dark ? "#FFB44D" : "#F79009", icon: "time-outline" as const };

    const date = useMemo(
        () => formatFullOrderDate(order?.createdAt || order?.createdAtMs, locale, Boolean(isTurkish)),
        [isTurkish, locale, order?.createdAt, order?.createdAtMs],
    );
    const address = order?.deliveryAddress || order?.delivery_address_snapshot || order?.addressSnapshot;
    const addressObject = address && typeof address === "object" ? address : null;
    const addressPrimary = addressObject ? [addressObject.line1, addressObject.city, addressObject.country].filter(Boolean).join(", ") : String(order?.deliveryAddressText || order?.address || "");
    const addressMeta = addressObject ? [addressObject.buildingNumber || addressObject.block, addressObject.floor, addressObject.apartment || addressObject.room].filter(Boolean).join(" · ") : "";
    const note = String(order?.notes || order?.courierNote || order?.deliveryInstructions || "").trim();
    const cancellationReason = status === "canceled"
        ? getCancellationReasonText(order?.cancellationReasonCode, Boolean(isTurkish))
        : "";
    const restaurantCancellationNote = status === "canceled" ? String(order?.restaurantCancellationNote || "").trim() : "";

    const openReview = useCallback(async () => {
        if (!userId || reviewSubmitting) return;
        const current = await refreshCustomerReviewState(userId, orderId, true);
        if (current.status === "eligible") { setReviewError(null); setReviewVisible(true); }
    }, [orderId, reviewSubmitting, userId]);

    const submitReview = useCallback(async (value: OrderReviewSheetValue) => {
        if (!userId || !order || reviewSubmitting) return;
        setReviewSubmitting(true);
        setReviewError(null);
        try {
            const current = await refreshCustomerReviewState(userId, orderId, true);
            if (current.status !== "eligible") { setReviewVisible(false); return; }
            const result = await submitCustomerReviewWithDurableOperation(userId, { orderId, restaurantId: String(order.restaurantId || ""), ...value });
            markCustomerReviewAsReviewed(userId, orderId);
            setReviewVisible(false);
            AccessibilityInfo.announceForAccessibility(reviewCopy.completed);
            showUserMessage(copy.reviewSaved + (result.replayed ? ` ${reviewCopy.completed}.` : ""));
        } catch (error) {
            const classified = classifyReviewRepositoryError(error);
            if (classified.code === "already_reviewed" || classified.code === "review_expired") {
                await refreshCustomerReviewState(userId, orderId, true);
                setReviewVisible(false);
            } else setReviewError(reviewCopy.errors[classified.code]);
        }
        finally { setReviewSubmitting(false); }
    }, [copy.reviewSaved, order, orderId, reviewCopy, reviewSubmitting, userId]);

    const reorder = useCallback(async () => {
        if (!order || reordering) return; setReordering(true);
        try {
            const result = await resolveOrderForReorder(order);
            if (!result.cartItems.length) { Alert.alert(copy.title, copy.unavailable); return; }
            if (result.unavailableItems.length && !await confirmAction(copy.partialTitle, copy.partial(result.unavailableItems.length), copy.cancel, copy.addAvailable)) return;
            const cart = useCartStore.getState();
            const conflict = cart.items.length > 0 && normalizeCartRestaurantKey(cart.restaurantId) !== normalizeCartRestaurantKey(result.restaurantId);
            const replaceExisting = conflict ? await confirmAction(copy.cartTitle, copy.cartBody, copy.cancel, copy.replace) : false;
            if (conflict && !replaceExisting) return;
            if (!useCartStore.getState().addItems(result.cartItems, { replaceExisting })) { Alert.alert(copy.title, copy.unavailable); return; }
            router.push("/(tabs)/cart");
        } catch (error) { Alert.alert(copy.title, error instanceof ReorderError ? copy.unavailable : copy.retry); }
        finally { setReordering(false); }
    }, [copy, order, reordering, router]);

    if (loading && !order) return <SafeAreaView style={styles.safe}><Header copy={copy} colors={colors} router={router} styles={styles} /><ScrollView contentContainerStyle={styles.content}><Skeleton styles={styles} /></ScrollView></SafeAreaView>;
    if (failed || !order) return <SafeAreaView style={styles.safe}><Header copy={copy} colors={colors} router={router} styles={styles} /><View style={styles.error}><Text style={styles.errorTitle}>{copy.notFound}</Text><Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>{copy.retry}</Text></Pressable></View></SafeAreaView>;

    return <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <Header copy={copy} colors={colors} router={router} styles={styles} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]} showsVerticalScrollIndicator={false}>
            <View style={[styles.status, { backgroundColor: statusUi.bg }]}><Ionicons color={statusUi.color} name={statusUi.icon} size={15} /><Text style={[styles.statusText, { color: statusUi.color }]}>{copy.status[status]}</Text></View>
            {cancellationReason ? <View style={styles.cancellationCard}><View style={styles.cancellationIcon}><Ionicons color={statusUi.color} name="information-circle-outline" size={20} /></View><View style={styles.cancellationCopy}><Text style={styles.cancellationTitle}>{copy.cancellationReason}</Text><Text style={styles.cancellationBody}>{cancellationReason}</Text>{restaurantCancellationNote ? <><Text style={[styles.cancellationTitle, { marginTop: 10 }]}>{copy.restaurantMessage}</Text><Text style={styles.cancellationBody}>{restaurantCancellationNote}</Text></> : null}</View></View> : null}
            <Text style={styles.date}>{date}</Text><Text numberOfLines={2} style={styles.restaurant}>{restaurantName(order, copy.restaurantFallback)}</Text>
            <View style={styles.numberCard}><Text style={styles.numberLabel}>{copy.orderNumber}</Text><View style={styles.numberRight}><Text style={styles.numberValue}>{customerOrderNumber(order)}</Text><Pressable accessibilityLabel={copy.copy} hitSlop={8} onPress={() => { Clipboard.setString(customerOrderNumber(order)); showUserMessage(copy.copied); }} style={styles.copyButton}><Ionicons color={colors.primary} name="copy-outline" size={18} /></Pressable></View></View>
            <Text style={styles.sectionTitle}>{copy.summary}</Text><View style={styles.sectionDivider} />
            {items.map((item: any, index: number) => <View key={`${item.itemId || item.name}-${index}`}><View style={styles.itemRow}><Text style={styles.quantity}>{item.quantity}×</Text><View style={styles.itemCopy}><Text style={styles.itemName}>{item.name}</Text>{item.modifierText ? <Text style={styles.modifiers}>{item.modifierText}</Text> : null}</View></View>{index < items.length - 1 ? <View style={styles.itemDivider} /> : null}</View>)}
            <View style={styles.totalDivider} /><View style={styles.totalRow}><Text style={styles.totalLabel}>{copy.total}</Text><Text style={styles.totalValue}>{formatCurrency(Number(order.total ?? order.totalPrice ?? 0))}</Text></View>
            {delivered ? <View style={styles.reviewActionWrap}>{reviewAvailability.status === "checking" ? <ActivityIndicator color={ORANGE} /> : reviewAvailability.status === "reviewed" ? <View accessibilityLabel={copy.reviewed} style={styles.reviewedOrder}><Ionicons color={colors.secondary} name="checkmark-circle" size={20} /><Text style={styles.reviewedOrderText}>{copy.reviewed}</Text></View> : reviewAvailability.status === "eligible" ? <Pressable accessibilityRole="button" accessibilityLabel={copy.review} onPress={() => void openReview()} style={styles.reviewOrderButton}><Ionicons color="#FFFFFF" name="star-outline" size={19} /><Text style={styles.reviewOrderText}>{copy.review}</Text></Pressable> : reviewAvailability.status === "unavailable" ? <Pressable accessibilityRole="button" onPress={() => void refreshCustomerReviewState(userId, orderId, true)} style={styles.reviewRetry}><Text style={styles.reviewRetryText}>{copy.retry}</Text></Pressable> : null}</View> : null}
            <Text style={styles.addressTitle}>{copy.address}</Text><View style={styles.addressCard}><View style={styles.addressTop}><View style={styles.pin}><Ionicons color={ORANGE} name="location-outline" size={19} /></View><View style={styles.addressCopy}><Text style={styles.addressLabel}>{String(addressObject?.label || (isTurkish ? "Adres" : "Address"))}</Text><Text style={styles.addressBody}>{addressPrimary || copy.noAddress}</Text>{addressMeta ? <Text style={styles.addressMeta}>{addressMeta}</Text> : null}</View></View>{note ? <><View style={styles.noteDivider} /><Text style={styles.noteLabel}>{copy.orderNote}</Text><Text style={styles.noteBody}>{note}</Text></> : null}</View>
            {delivered ? <Pressable accessibilityLabel={copy.reorder} disabled={reordering} onPress={() => void reorder()} style={({ pressed }) => [styles.reorder, pressed && styles.reorderPressed]}>{reordering ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}<Text style={styles.reorderText}>{reordering ? copy.adding : copy.reorder}</Text></Pressable> : null}
        </ScrollView>
        <OrderReviewSheet visible={reviewVisible} restaurantName={restaurantName(order, copy.restaurantFallback)} items={reviewItems} submitting={reviewSubmitting} errorText={reviewError} onClose={() => setReviewVisible(false)} onDiscard={async () => { await clearCustomerReviewOperation(userId, orderId); }} onSubmit={submitReview} />
    </SafeAreaView>;
}

const Header = ({ copy, colors, router, styles }: any) => <View style={styles.header}><Pressable accessibilityLabel={copy.back} hitSlop={8} onPress={() => router.canGoBack() ? router.back() : router.replace("/orders")} style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.pressed }]}><Ionicons color={colors.primary} name="chevron-back" size={20} /></Pressable><Text style={styles.headerTitle}>{copy.title}</Text><View style={styles.headerSpacer} /></View>;
const Skeleton = ({ styles }: any) => <View style={styles.skeleton}><View style={styles.skBadge} /><View style={styles.skDate} /><View style={styles.skRestaurant} /><View style={styles.skCard} /><View style={styles.skHeading} />{[0, 1, 2].map((key) => <View key={key} style={styles.skLine} />)}<View style={styles.skCardLarge} /></View>;

const makeStyles = (c: any) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.page }, header: { height: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10 }, back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 }, headerSpacer: { width: 44 }, headerTitle: { color: c.primary, fontFamily: "ChairoSans", fontSize: 21, lineHeight: 26, fontWeight: "700" },
    content: { paddingHorizontal: 22, paddingTop: 22 }, status: { height: 30, alignSelf: "flex-start", borderRadius: 11, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 5 }, statusText: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 17, fontWeight: "600" }, date: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, marginTop: 9 }, restaurant: { color: c.primary, fontFamily: "ChairoSans", fontSize: 29, lineHeight: 35, fontWeight: "700", letterSpacing: -0.3, marginTop: 28 },
    cancellationCard: { marginTop: 12, borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 11 }, cancellationIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.pressed, alignItems: "center", justifyContent: "center" }, cancellationCopy: { flex: 1, minWidth: 0 }, cancellationTitle: { color: c.primary, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 18, fontWeight: "700" }, cancellationBody: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 19, marginTop: 2 },
    numberCard: { height: 56, marginTop: 18, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingLeft: 14, paddingRight: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, numberLabel: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 18, fontWeight: "500" }, numberRight: { flexDirection: "row", alignItems: "center", gap: 5 }, numberValue: { color: c.primary, fontFamily: "ChairoSans", fontSize: 14.5, lineHeight: 19, fontWeight: "700" }, copyButton: { width: 44, height: 44, borderRadius: 10, backgroundColor: c.pressed, alignItems: "center", justifyContent: "center" },
    sectionTitle: { color: c.primary, fontFamily: "ChairoSans", fontSize: 19, lineHeight: 23, fontWeight: "700", marginTop: 24 }, sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginTop: 12 }, itemRow: { minHeight: 72, paddingVertical: 14, flexDirection: "row", alignItems: "flex-start" }, quantity: { width: 34, color: c.primary, fontFamily: "ChairoSans", fontSize: 14.5, lineHeight: 20, fontWeight: "600" }, itemCopy: { flex: 1, minWidth: 0, paddingRight: 8 }, itemName: { color: c.primary, fontFamily: "ChairoSans", fontSize: 15, lineHeight: 20, fontWeight: "600" }, modifiers: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 17, marginTop: 3 }, itemDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border }, reviewPlaceholder: { width: 84, height: 34, flexShrink: 0 }, reviewButton: { height: 34, borderRadius: 10, borderWidth: 1, borderColor: ORANGE, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 }, reviewText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 17, fontWeight: "600" }, reviewed: { height: 34, flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 0 }, reviewedText: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
    totalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border }, totalRow: { paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, totalLabel: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, fontWeight: "500" }, totalValue: { color: c.primary, fontFamily: "ChairoSans", fontSize: 22, lineHeight: 26, fontWeight: "700" },
    reviewActionWrap: { minHeight: 54, marginTop: 5, justifyContent: "center" }, reviewOrderButton: { minHeight: 54, borderRadius: 14, backgroundColor: ORANGE, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 10 }, reviewOrderText: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 16, lineHeight: 21, fontWeight: "700", textAlign: "center" }, reviewedOrder: { minHeight: 54, borderRadius: 14, backgroundColor: c.pressed, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, padding: 10 }, reviewedOrderText: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 15, fontWeight: "600" }, reviewRetry: { minHeight: 44, alignItems: "center", justifyContent: "center" }, reviewRetryText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 14, fontWeight: "600" },
    addressTitle: { color: c.primary, fontFamily: "ChairoSans", fontSize: 19, lineHeight: 23, fontWeight: "700", marginTop: 9, marginBottom: 13 }, addressCard: { borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface, padding: 14 }, addressTop: { flexDirection: "row", gap: 12 }, pin: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.softOrange, alignItems: "center", justifyContent: "center" }, addressCopy: { flex: 1, minWidth: 0 }, addressLabel: { color: c.primary, fontFamily: "ChairoSans", fontSize: 15, lineHeight: 19, fontWeight: "700" }, addressBody: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 14, lineHeight: 19, marginTop: 2 }, addressMeta: { color: c.secondary, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, marginTop: 2 }, noteDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginTop: 13, marginBottom: 12, marginLeft: 54 }, noteLabel: { color: c.tertiary, fontFamily: "ChairoSans", fontSize: 12.5, lineHeight: 17, fontWeight: "500", marginLeft: 54 }, noteBody: { color: c.primary, fontFamily: "ChairoSans", fontSize: 13.5, lineHeight: 19, marginLeft: 54, marginTop: 2 }, reorder: { minHeight: 54, borderRadius: 14, backgroundColor: ORANGE, marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 10 }, reorderPressed: { backgroundColor: ORANGE_PRESSED }, reorderText: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 16, lineHeight: 20, fontWeight: "600" },
    error: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 }, errorTitle: { color: c.primary, fontFamily: "ChairoSans", fontSize: 17, fontWeight: "600" }, retry: { minHeight: 44, justifyContent: "center", marginTop: 4 }, retryText: { color: ORANGE, fontFamily: "ChairoSans", fontSize: 14, fontWeight: "600" }, skeleton: { gap: 14 }, skBadge: { width: 110, height: 30, borderRadius: 10, backgroundColor: c.skeleton }, skDate: { width: 150, height: 14, borderRadius: 5, backgroundColor: c.skeleton }, skRestaurant: { width: "58%", height: 32, borderRadius: 6, backgroundColor: c.skeleton, marginTop: 12 }, skCard: { height: 56, borderRadius: 14, backgroundColor: c.skeleton }, skHeading: { width: 130, height: 21, borderRadius: 5, backgroundColor: c.skeleton, marginTop: 8 }, skLine: { height: 64, borderRadius: 6, backgroundColor: c.skeleton }, skCardLarge: { height: 130, borderRadius: 14, backgroundColor: c.skeleton, marginTop: 8 },
});

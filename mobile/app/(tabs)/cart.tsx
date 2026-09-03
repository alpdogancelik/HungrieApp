import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
import type { ReactNode } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/store/cart.store";
import { images } from "@/constants/mediaCatalog";
import { useAddresses } from "@/src/features/address/addressFeature";
import useAuthStore from "@/store/auth.store";
import type { CartItemType } from "@/type";
import Icon from "@/components/Icon";
import type { PaymentMethod } from "@/src/domain/types";
import { placeOrder } from "@/src/data/orderRepository";
import { seedMenuByRestaurantId, seedRestaurants, seedMenusAll } from "@/lib/restaurantSeeds";
import AddressSummary from "@/components/cart/AddressSummary";
import CartItemCard from "@/components/cart/CartItemCard";
import CourierNotes from "@/components/cart/CourierNotes";
import PaymentMethodList from "@/components/cart/PaymentMethodList";
import SummaryCard from "@/components/cart/SummaryCard";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";
import { makeShadow } from "@/src/lib/shadowStyle";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useTheme } from "@/src/theme/themeContext";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import { getAdminRestaurantMenu as getRestaurantMenu } from "@/src/data/menuRepository";
import { getRestaurant } from "@/src/data/restaurantRepository";
import { getRestaurantImageSource } from "@/lib/assets";

const CONTAINER_PADDING = { paddingLeft: 24, paddingRight: 14 };
const MAX_NOTES = 200;
const MINIMUM_ORDER_TOTAL = 250;
const TAB_BAR_HEIGHT = 80;
const TAB_BAR_BOTTOM_OFFSET = 40;
const EXTRA_BOTTOM_SPACE = 8;
const styles = createAdaptiveStyleSheet({
    footer: { paddingLeft: 24, paddingRight: 14, paddingTop: 24, paddingBottom: 40, rowGap: 20 },
    footerCheckoutCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#EEE7DE",
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 16,
    },
    footerTotalBlock: { rowGap: 2, flexShrink: 0 },
    footerTotalLabel: { color: "#0F172A", fontSize: 14, fontFamily: "ChairoSans" },
    footerTotalValue: { color: "#0F172A", fontSize: 20, fontFamily: "ChairoSans" },
    checkoutBtn: {
        flex: 1,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        minHeight: 54,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 12,
        paddingHorizontal: 16,
    },
    checkoutText: { color: "#FFFFFF", fontSize: 16, fontFamily: "ChairoSans" },
    emptyRoot: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 24 },
    emptyContent: { alignItems: "center", width: "100%" },
    emptyIconWrap: {
        width: 104,
        height: 104,
        borderRadius: 52,
        backgroundColor: "#FFF3E1",
        borderWidth: 1,
        borderColor: "#FED7AA",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 22,
    },
    emptyTitle: { fontSize: 34, lineHeight: 40, color: "#0F172A", fontFamily: "ChairoSans", textAlign: "center" },
    emptySubtitle: { marginTop: 10, textAlign: "center", fontSize: 16, lineHeight: 22, color: "#475569", fontFamily: "ChairoSans" },
    emptyCta: { marginTop: 24, borderRadius: 999, minHeight: 56, paddingHorizontal: 30, backgroundColor: "#FE8C00", alignItems: "center", justifyContent: "center" },
    topBar: {
        paddingLeft: 24,
        paddingRight: 14,
        paddingTop: 8,
        minHeight: 48,
        justifyContent: "center",
    },
    titleCenter: {
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
    },
    titleCompact: { fontSize: 22, color: "#0F172A", fontFamily: "ChairoSans" },
    restaurantCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#EEE7DE",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        ...makeShadow({ color: "#0F172A", offsetY: 8, blurRadius: 20, opacity: 0.06, elevation: 4 }),
    },
    restaurantBrand: { flexDirection: "row", alignItems: "center", columnGap: 12, flex: 1, minWidth: 0 },
    restaurantLogo: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFF7EA" },
    restaurantInfo: { flex: 1, rowGap: 4, minWidth: 0 },
    restaurantArrowWrap: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#FFF7EA",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
    restaurantName: { color: "#0F172A", fontSize: 16, fontFamily: "ChairoSans" },
    restaurantMetaRow: { flexDirection: "row", alignItems: "center", columnGap: 8 },
    restaurantMetaText: { color: "#64748B", fontSize: 13, fontFamily: "ChairoSans" },
    listSeparator: { height: 16 },
    screenBg: { flex: 1, backgroundColor: "#F8F6F2" },
    drinkSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    drinkSectionTitle: { color: "#0F172A", fontSize: 18, fontFamily: "ChairoSans" },
    drinkSectionAction: { color: "#FE8C00", fontSize: 15, fontFamily: "ChairoSans" },
    drinkCard: {
        width: 212,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#EEE7DE",
        backgroundColor: "#FFFFFF",
        padding: 16,
    },
    drinkLoadingWrap: {
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#F3E4D7",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 20,
        paddingVertical: 16,
        alignItems: "center",
    },
    drinkHeaderSubtitle: { marginTop: 8, color: "#64748B", fontSize: 13, fontFamily: "ChairoSans" },
    drinkListWrap: { flexDirection: "row", columnGap: 12, paddingRight: 14 },
    drinkRowInfo: { rowGap: 2, minWidth: 0 },
    drinkName: { color: "#0F172A", fontSize: 16, fontFamily: "ChairoSans" },
    drinkDesc: { color: "#475569", fontSize: 12, fontFamily: "ChairoSans" },
    drinkPrice: { color: "#FE8C00", fontSize: 16, fontFamily: "ChairoSans" },
    drinkAddBtn: {
        marginTop: 12,
        alignSelf: "flex-start",
        minWidth: 108,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        alignItems: "center",
    },
    drinkAddBtnText: { color: "#FFFFFF", fontSize: 14, fontFamily: "ChairoSans" },
    minimumNotice: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#FED7AA",
        backgroundColor: "#FFF7ED",
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    minimumNoticeText: {
        color: "#9A3412",
        fontSize: 13,
        lineHeight: 18,
        fontFamily: "ChairoSans",
    },
});

const getCartItemKey = (item: CartItemType) => {
    const customizationKey = (item.customizations ?? [])
        .map((c) => c.id)
        .sort()
        .join("_");
    return customizationKey ? `${item.id}-${customizationKey}` : item.id;
};

type CartItemWithRestaurant = CartItemType & { restaurantId?: string };
const DEFAULT_RESTAURANT_ID = "ada-pizza";

const stringifyId = (value: string | number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);

const parseTimeOfDayMinutes = (value: unknown): number | null => {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

const isCurrentTimeWithinOpeningHours = (openingTime: unknown, closingTime: unknown, now = new Date()) => {
    const openMinutes = parseTimeOfDayMinutes(openingTime);
    const closeMinutes = parseTimeOfDayMinutes(closingTime);
    if (openMinutes === null || closeMinutes === null) return null;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (openMinutes === closeMinutes) return true;
    if (openMinutes < closeMinutes) {
        return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
};

const isRestaurantOpenForOrdering = (restaurant: any) => {
    const rawStatus = String(restaurant?.status || "").trim().toLowerCase();
    const isEnabled =
        restaurant?.isActive === false ||
        restaurant?.isOpen === false ||
        ["closed", "kapalı", "kapali", "inactive", "disabled", "offline"].includes(rawStatus)
            ? false
            : true;
    if (!isEnabled) return false;

    const open = restaurant?.openingTime || restaurant?.opening_time;
    const close = restaurant?.closingTime || restaurant?.closing_time;
    return isCurrentTimeWithinOpeningHours(open, close) !== false;
};

const isDrinkCategory = (cat?: string) => {
    if (!cat) return false;
    const lower = cat.toLowerCase();
    return lower.includes("drink") || lower.includes("içecek") || lower.includes("icecek");
};

type DrinkSuggestion = {
    id: string;
    name: string;
    price: number;
    description?: string;
    categories?: string[];
    restaurantId?: string;
    imageUrl?: string;
};

type PaymentOption = { id: PaymentMethod; label: string; description: string; badge?: string; hint?: string };

type SummaryLabels = {
    subtotal: string;
    delivery: string;
    serviceFee: string;
    discount: string;
    total: string;
    footnote: string;
};

type CartFooterProps = {
    disabled: boolean;
    ctaLabel: string;
    placingLabel: string;
    paymentTitle: string;
    notesTitle: string;
    notesPlaceholder: string;
    summaryLabels: SummaryLabels;
    subtotal: string;
    deliveryFee?: string;
    serviceFee?: string;
    serviceNote?: string;
    total: string;
    paymentOptions: PaymentOption[];
    paymentMethod: PaymentMethod | null;
    onSelectPayment: (method: PaymentMethod) => void;
    notes: string;
    maxNotes: number;
    noteSuggestions: string[];
    onChangeNotes: (text: string) => void;
    placingOrder: boolean;
    onPlaceOrder: () => void;
    drinkSuggestions: ReactNode;
    minimumWarning?: string;
};

const CartFooter = ({
    disabled,
    ctaLabel,
    placingLabel,
    paymentTitle,
    notesTitle,
    notesPlaceholder,
    summaryLabels,
    subtotal,
    deliveryFee,
    serviceFee,
    serviceNote,
    total,
    paymentOptions,
    paymentMethod,
    onSelectPayment,
    notes,
    maxNotes,
    noteSuggestions,
    onChangeNotes,
    placingOrder,
    onPlaceOrder,
    drinkSuggestions,
    minimumWarning,
}: CartFooterProps) => (
    <View className="gap-5 pt-6 pb-10" style={styles.footer}>
        {drinkSuggestions}
        <SummaryCard
            subtotal={subtotal}
            deliveryFee={deliveryFee}
            serviceFee={serviceFee}
            serviceNote={serviceNote}
            total={total}
            labels={summaryLabels}
        />

        <PaymentMethodList
            title={paymentTitle}
            options={paymentOptions}
            selected={paymentMethod}
            onSelect={onSelectPayment}
        />

        <CourierNotes
            title={notesTitle}
            placeholder={notesPlaceholder}
            value={notes}
            maxLength={maxNotes}
            suggestions={noteSuggestions}
            onChange={onChangeNotes}
        />

        {minimumWarning ? (
            <View style={styles.minimumNotice}>
                <Text style={styles.minimumNoticeText}>{minimumWarning}</Text>
            </View>
        ) : null}

        <View style={styles.footerCheckoutCard}>
            <View style={styles.footerTotalBlock}>
                <Text style={styles.footerTotalLabel}>{summaryLabels.total}</Text>
                <Text style={styles.footerTotalValue}>{total}</Text>
            </View>
            <TouchableOpacity
                className="custom-btn flex-row items-center justify-center gap-3"
                style={[styles.checkoutBtn, { opacity: disabled ? 0.6 : 1 }]}
                disabled={disabled}
                onPress={onPlaceOrder}
            >
                {placingOrder && <ActivityIndicator color="#fff" />}
                <Text className="paragraph-semibold text-white" style={styles.checkoutText}>
                    {placingOrder ? placingLabel : ctaLabel}
                </Text>
            </TouchableOpacity>
        </View>
    </View>
);

const MENU_ID_TO_RESTAURANT: Record<string, string> = seedMenusAll.reduce((acc, entry) => {
    acc[String(entry.id)] = entry.restaurantId;
    return acc;
}, {} as Record<string, string>);

const normalizeRestaurantKey = (value?: string | null) => {
    if (!value) return null;
    const key = String(value).toLowerCase();
    const compact = key.replace(/\s+/g, "");

    const lookup: Record<string, string> = {
        "adapizza": "ada-pizza",
        "ada-pizza": "ada-pizza",
        "alacarte": "alacarte-cafe",
        "alacartecafe": "alacarte-cafe",
        "alacarte-cafe": "alacarte-cafe",
        "burgerhouse": "burger-house",
        "burger-house": "burger-house",
        "lavish": "lavish",
        "munchies": "munchies",
        "root": "root-kitchen-coffee",
        "rootkitchencoffee": "root-kitchen-coffee",
        "root-kitchen-coffee": "root-kitchen-coffee",
        "lombard": "lombard-kitchen",
        "lombardkitchen": "lombard-kitchen",
        "lombard-kitchen": "lombard-kitchen",
        "voy": "voy",
        "erto": "erto-cafe",
        "ertocafe": "erto-cafe",
        "erto-cafe": "erto-cafe",
    };

    if (lookup[compact]) return lookup[compact];
    const dashy = key.replace(/\s+/g, "-");
    if (lookup[dashy]) return lookup[dashy];
    return compact;
};

const isDrinkName = (value?: string | null) => {
    if (!value) return false;
    const lower = value.toLowerCase();
    return lower.includes("drink") || lower.includes("içecek") || lower.includes("icecek") || lower.includes("cola");
};

const extractDrinkItems = (list: any[], restaurantId?: string | null): DrinkSuggestion[] =>
    list
        .filter((entry) => {
            const categories: string[] = Array.isArray(entry?.categories) ? entry.categories : [];
            if (categories.some((c) => isDrinkCategory(String(c)))) return true;
            return isDrinkName(entry?.name);
        })
        .map((entry) => ({
            id: stringifyId(entry.id),
            name: entry.name,
            price: Number(entry.price || 0),
            description: entry.description,
            categories: Array.isArray(entry?.categories) ? entry.categories : undefined,
            restaurantId: stringifyId(entry.restaurantId || restaurantId || ""),
            imageUrl: entry.imageUrl || entry.image_url || "",
        }));

const Cart = () => {
    const { theme } = useTheme();
    useWebDocumentTitle();
    const insets = useSafeAreaInsets();
    const { items, getTotalPrice, increaseQty, decreaseQty, removeItem, clearCart, addItem } = useCartStore();
    const { user, isAuthenticated } = useAuthStore();
    const { t, i18n } = useTranslation();
    const isTurkish = i18n.language?.startsWith("tr");
    const noteSuggestions: string[] = [];
    const paymentOptions: PaymentOption[] = [
        {
            id: "pos",
            label: t("cart.screen.payment.pos.label"),
            description: t("cart.screen.payment.pos.description"),
            badge: t("cart.screen.payment.pos.badge"),
            hint: t("cart.screen.payment.pos.hint"),
        },
        {
            id: "cash",
            label: t("cart.screen.payment.cash.label"),
            description: t("cart.screen.payment.cash.description"),
            hint: t("cart.screen.payment.cash.hint"),
        },
    ];
    const subtotal = getTotalPrice();
    const isCartEmpty = items.length === 0;
    const deliveryFee = 0;
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>("pos");
    const serviceFee = 0;
    const discount = 0;
    const total = Math.max(subtotal + serviceFee - discount, 0);
    const summaryLabels = {
        subtotal: t("cart.screen.summary.subtotal"),
        delivery: t("cart.screen.summary.delivery"),
        serviceFee: "Hizmet ücreti",
        discount: t("cart.screen.summary.discount"),
        total: t("cart.screen.summary.total"),
        footnote: t("cart.screen.summary.footnote"),
    };

    const { addresses, isLoading: addressesLoading } = useAddresses();
    const addressList = addresses ?? [];
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [notes, setNotes] = useState("");
    const [placingOrder, setPlacingOrder] = useState(false);
    const [drinkItems, setDrinkItems] = useState<DrinkSuggestion[]>([]);
    const [drinkRestaurantId, setDrinkRestaurantId] = useState<string | null>(null);
    const [drinkRestaurantName, setDrinkRestaurantName] = useState<string | null>(null);
    const [drinkLoading, setDrinkLoading] = useState(false);
    const resolvedAddressId = selectedAddress ?? addressList[0]?.id ?? null;
    const isBelowMinimum = subtotal < MINIMUM_ORDER_TOTAL;
    const canCheckout = Boolean(!isCartEmpty && paymentMethod && !isBelowMinimum);
    const selectedAddressId = stringifyId(selectedAddress);
    const handleSelectAddress = (addressId: string | number) => setSelectedAddress(String(addressId));
    const requireSignInForAddresses = useCallback(() => {
        showUserMessage(
            t("authRequired.addressTitle", "Sign in required"),
            t("authRequired.addressBody", "Please sign in or create an account to manage delivery addresses."),
        );
        router.push("/sign-in");
    }, [t]);
    const handleManageAddresses = useCallback(() => {
        if (!isAuthenticated) {
            requireSignInForAddresses();
            return;
        }
        router.push("/ManageAddresses");
    }, [isAuthenticated, requireSignInForAddresses]);
    const resolveRestaurantFromCart = useCallback(() => {
        const explicit = items.find((item) => (item as CartItemWithRestaurant).restaurantId)?.restaurantId;
        if (explicit) {
            const normalized = normalizeRestaurantKey(String(explicit));
            if (normalized) return normalized;
        }

        const inferred = items
            .map((item) => normalizeRestaurantKey(MENU_ID_TO_RESTAURANT[String(item.id)] || null))
            .find((id): id is string => Boolean(id));

        return inferred || null;
    }, [items]);
    const listData = useMemo(() => items.map((item) => ({ type: "item" as const, item })), [items]);
    useEffect(() => {
        const list = addresses ?? [];
        if (!list.length) {
            setSelectedAddress(null);
            return;
        }
        if (!selectedAddress) {
            const defaultAddress = list.find((addr) => addr.isDefault);
            setSelectedAddress(String((defaultAddress ?? list[0]).id));
            return;
        }
        const exists = list.some((addr) => stringifyId(addr.id) === stringifyId(selectedAddress));
        if (!exists) {
            const fallback = list.find((addr) => addr.isDefault) ?? list[0];
            setSelectedAddress(String(fallback.id));
        }
    }, [addresses, selectedAddress]);

    useEffect(() => {
        const restaurantId = resolveRestaurantFromCart();
        if (!restaurantId) {
            setDrinkRestaurantId(restaurantId ?? null);
            setDrinkRestaurantName(
                restaurantId
                    ? seedRestaurants.find((r) => stringifyId(r.id) === stringifyId(restaurantId))?.name || null
                    : null,
            );
            setDrinkItems([]);
            return;
        }

        let active = true;
        const fetchDrinks = async () => {
            setDrinkLoading(true);
            setDrinkRestaurantId(restaurantId);
            setDrinkRestaurantName(
                seedRestaurants.find((r) => stringifyId(r.id) === stringifyId(restaurantId))?.name || null,
            );
            const seedFallback = extractDrinkItems(seedMenuByRestaurantId(restaurantId) || [], restaurantId);
            try {
                const menu = await getRestaurantMenu(restaurantId);
                const drinksFromDb = extractDrinkItems(menu, restaurantId);
                if (active) {
                    setDrinkItems(drinksFromDb.length ? drinksFromDb : seedFallback);
                }
            } catch (error) {
                if (active) {
                    setDrinkItems(seedFallback);
                }
            } finally {
                if (active) {
                    setDrinkLoading(false);
                }
            }
        };

        fetchDrinks();
        return () => {
            active = false;
        };
    }, [items, resolveRestaurantFromCart]);

    const handlePlaceOrder = async () => {
        if (placingOrder) return;
        if (!items.length) {
            Alert.alert(t("cart.empty.title"), t("cart.empty.subtitle"));
            return;
        }

        if (!isAuthenticated) {
            showUserMessage(t("authRequired.orderTitle"), t("authRequired.orderBody"));
            router.push("/sign-in");
            return;
        }

        if (resolvedAddressId === null) {
            Alert.alert(
                t("cart.screen.alerts.addAddressTitle"),
                t("cart.screen.alerts.addAddressBody"),
                [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                        text: t("deliverTo.addAddress"),
                        onPress: () => router.push("/ManageAddresses"),
                    },
                ],
            );
            return;
        }

        if (!paymentMethod) {
            Alert.alert(t("cart.screen.alerts.paymentTitle"), t("cart.screen.alerts.paymentBody"));
            return;
        }

        if (isBelowMinimum) {
            Alert.alert(
                t("cart.screen.alerts.minimumTitle"),
                t("cart.screen.alerts.minimumBody", { amount: formatCurrency(MINIMUM_ORDER_TOTAL) }),
            );
            return;
        }

        const restaurantId = String(
            (items[0] as CartItemWithRestaurant | undefined)?.restaurantId ?? DEFAULT_RESTAURANT_ID,
        );
        const addressData = addressList.find((addr) => stringifyId(addr.id) === stringifyId(resolvedAddressId));
        const pendingEta = 120;

        try {
            setPlacingOrder(true);
            const restaurant = await getRestaurant(restaurantId);
            if (restaurant && !isRestaurantOpenForOrdering(restaurant)) {
                Alert.alert(
                    t("cart.screen.alerts.placeErrorTitle"),
                    isTurkish
                        ? "Bu restoran şu anda kapalı. Lütfen açık bir restorandan sipariş verin."
                        : "This restaurant is closed right now. Please order from an open restaurant.",
                );
                return;
            }

            const localOrderItems = items.map((item) => ({
                menuItemId: String(item.id),
                name: item.name,
                quantity: item.quantity,
                price: item.price + getCustomizationsTotal(item.customizations),
                customizations: item.customizations?.map(({ id, name, price }) => ({ id, name, price })) ?? [],
            }));

            const newOrderId = await placeOrder({
                userId: user?.id ?? user?.$id ?? user?.accountId ?? "guest",
                restaurantId,
                items: localOrderItems,
                paymentMethod: paymentMethod as PaymentMethod,
                fees: { deliveryFee, serviceFee, discount, tip: 0 },
                etaMinutes: pendingEta / 60,
                customer: {
                    name: user?.name ?? undefined,
                    email: user?.email ?? undefined,
                    whatsappNumber: user?.whatsappNumber ?? undefined,
                },
                deliveryAddress: addressData
                    ? {
                          id: addressData.id,
                          label: addressData.label,
                          line1: addressData.line1,
                          block: addressData.block,
                          room: addressData.room,
                          city: addressData.city,
                          country: addressData.country,
                          isDefault: addressData.isDefault,
                          createdAt: addressData.createdAt,
                      }
                    : undefined,
                notes: notes ?? "",
            });
            const restaurantLabel =
                seedRestaurants.find((restaurant) => stringifyId(restaurant.id) === stringifyId(restaurantId))?.name ||
                restaurantNameForCart ||
                "Restoran";

            clearCart();
            router.push({
                pathname: "/order/pending",
                params: {
                    orderId: newOrderId,
                    restaurantName: restaurantLabel,
                    eta: String(pendingEta),
                },
            });
        } catch (error: any) {
            console.warn("[Cart] placeOrder failed", error);
            Alert.alert(t("cart.screen.alerts.placeErrorTitle"), error?.message || t("cart.screen.alerts.placeErrorBody"));
        } finally {
            setPlacingOrder(false);
        }
    };

    if (isCartEmpty) {
        return (
            <SafeAreaView
                className="flex-1 bg-gray-50"
                style={[styles.emptyRoot, { backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top + 128, 180), paddingBottom: insets.bottom + 120 }]}
            >
                <View style={styles.emptyContent}>
                    <View style={styles.emptyIconWrap}>
                        <Icon name="cart" size={46} color="#FE8C00" />
                    </View>
                    <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>{t("cart.empty.title")}</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>{t("cart.empty.subtitle")}</Text>
                    <TouchableOpacity className="rounded-full bg-primary" style={styles.emptyCta} onPress={() => router.push("/")}>
                    <Text className="text-white paragraph-semibold" style={styles.checkoutText}>{t("cart.empty.cta")}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const restaurantIdForCart = resolveRestaurantFromCart();
    const restaurantNameForCart =
        seedRestaurants.find((r) => stringifyId(r.id) === stringifyId(restaurantIdForCart))?.name || null;

    const handleBackToRestaurant = () => {
        if (restaurantIdForCart) {
            router.push(`/restaurants/${restaurantIdForCart}`);
            return;
        }
        router.push("/home");
    };

    const restaurantForCart = seedRestaurants.find((r) => stringifyId(r.id) === stringifyId(restaurantIdForCart));
    const restaurantMin = `Min. ₺${Math.max(150, Math.round(Number(restaurantForCart?.deliveryFee || 0) || 0))}`;
    const restaurantImageSource = getRestaurantImageSource(
        restaurantForCart?.imageUrl || "",
        undefined,
        restaurantNameForCart || "Restaurant",
    );

    const renderHeader = () => (
        <View style={{ rowGap: 16, paddingBottom: 16 }}>
            <View style={styles.topBar}>
                <View style={styles.titleCenter}>
                    <Text style={styles.titleCompact}>{isAuthenticated ? "Sepet" : t("cart.screen.orderTitle")}</Text>
                </View>
                <TouchableOpacity
                    onPress={handleBackToRestaurant}
                    hitSlop={10}
                    style={styles.backBtn}
                >
                    <Icon name="arrowBack" size={20} color="#0F172A" />
                </TouchableOpacity>
            </View>
            <AddressSummary
                addresses={addressList}
                loading={addressesLoading}
                selectedAddressId={selectedAddressId}
                onSelect={handleSelectAddress}
                onManageAddresses={handleManageAddresses}
                onAddAddress={handleManageAddresses}
            />
            <View style={CONTAINER_PADDING}>
                <TouchableOpacity style={styles.restaurantCard} onPress={handleBackToRestaurant}>
                    <View style={styles.restaurantBrand}>
                        <Image source={restaurantImageSource} style={styles.restaurantLogo} contentFit="cover" />
                        <View style={styles.restaurantInfo}>
                            <Text style={styles.restaurantName} numberOfLines={1}>
                                {restaurantNameForCart || "Restoran"}
                            </Text>
                            <View style={styles.restaurantMetaRow}>
                                <Text style={styles.restaurantMetaText}>{restaurantMin}</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.restaurantArrowWrap}>
                        <Ionicons name="chevron-forward" size={18} color="#FE8C00" />
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderListItem = ({ item }: { item: { type: "item"; item: CartItemType } }) => {
        const cartItem = item.item;
        return (
            <View style={CONTAINER_PADDING}>
                <CartItemCard
                    item={cartItem}
                    onIncrease={() => increaseQty(cartItem.id, cartItem.customizations || [])}
                    onDecrease={() => decreaseQty(cartItem.id, cartItem.customizations || [])}
                    onRemove={() => removeItem(cartItem.id, cartItem.customizations || [])}
                />
            </View>
        );
    };

    const handleNoteChange = (text: string) => setNotes(text.slice(0, MAX_NOTES));

    const renderDrinkSuggestions = () => {
        if (!items.length || !drinkRestaurantId) return null;
        if (drinkLoading && !drinkItems.length) {
            return (
                <View style={styles.drinkLoadingWrap}>
                    <ActivityIndicator color="#FE8C00" />
                    <Text style={styles.drinkHeaderSubtitle}>{t("cart.screen.drinkSuggestSubtitle")}</Text>
                </View>
            );
        }

        if (!drinkItems.length) return null;

        const restaurantName = drinkRestaurantName || "Restoran";

        const handleAddDrink = (drink: DrinkSuggestion) => {
            const restaurantId = drink.restaurantId || drinkRestaurantId;
            if (!restaurantId) return;
            addItem({
                id: String(drink.id),
                name: drink.name,
                price: Number(drink.price || 0),
                image_url: drink.imageUrl || "",
                restaurantId,
                customizations: [],
            });
        };

        return (
            <View>
                <View style={styles.drinkSectionHeader}>
                    <Text style={styles.drinkSectionTitle}>
                        {t("cart.screen.drinkSuggestTitle", { restaurant: restaurantName }).replace(`${restaurantName} `, "")}
                    </Text>
                    <Text style={styles.drinkSectionAction}>Tümünü gör</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drinkListWrap}>
                    {drinkItems.slice(0, 6).map((drink) => (
                        <View
                            key={String(drink.id)}
                            style={[
                                styles.drinkCard,
                                makeShadow({ color: "#0F172A", offsetY: 8, blurRadius: 20, opacity: 0.06, elevation: 3 }),
                            ]}
                        >
                            <View style={styles.drinkRowInfo}>
                                <Text style={styles.drinkName} numberOfLines={1}>
                                    {drink.name}
                                </Text>
                                {drink.description ? (
                                    <Text style={styles.drinkDesc} numberOfLines={1}>
                                        {drink.description}
                                    </Text>
                                ) : null}
                                <Text style={styles.drinkPrice}>{formatCurrency(drink.price)}</Text>
                                <TouchableOpacity style={styles.drinkAddBtn} onPress={() => handleAddDrink(drink)}>
                                    <Text style={styles.drinkAddBtnText}>{t("cart.screen.drinkSuggestAdd")}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    };

    const drinkSuggestionsSection = renderDrinkSuggestions();
    const disabled = !canCheckout || placingOrder;
    const ctaLabel = isBelowMinimum
        ? t("cart.screen.checkout.minimumLabel", { amount: formatCurrency(MINIMUM_ORDER_TOTAL) })
        : t("cart.screen.checkout.checkoutLabel", { amount: formatCurrency(total) });
    const placingLabel = t("cart.screen.checkout.placing");
    const paymentTitle = t("cart.screen.payment.title");
    const notesTitle = `${t("cart.screen.notesTitle")} (${t("common.optional", "optional")})`;
    const notesPlaceholder = t("cart.screen.notesPlaceholder");
    const minimumWarning = isBelowMinimum
        ? t("cart.screen.checkout.minimumWarning", {
              amount: formatCurrency(MINIMUM_ORDER_TOTAL),
              remaining: formatCurrency(Math.max(MINIMUM_ORDER_TOTAL - subtotal, 0)),
          })
        : undefined;
    const footerComponent = (
        <CartFooter
            disabled={disabled}
            ctaLabel={ctaLabel}
            placingLabel={placingLabel}
            paymentTitle={paymentTitle}
            notesTitle={notesTitle}
            notesPlaceholder={notesPlaceholder}
            summaryLabels={summaryLabels}
            subtotal={formatCurrency(subtotal)}
            deliveryFee={deliveryFee ? formatCurrency(deliveryFee) : undefined}
            serviceFee={serviceFee ? formatCurrency(serviceFee) : undefined}
            serviceNote={undefined}
            total={formatCurrency(total)}
            paymentOptions={paymentOptions}
            paymentMethod={paymentMethod}
            onSelectPayment={setPaymentMethod}
            notes={notes}
            maxNotes={MAX_NOTES}
            noteSuggestions={noteSuggestions}
            onChangeNotes={handleNoteChange}
            placingOrder={placingOrder}
            onPlaceOrder={handlePlaceOrder}
            drinkSuggestions={drinkSuggestionsSection}
            minimumWarning={minimumWarning}
        />
    );

    const contentBottomPadding = insets.bottom + TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_OFFSET + EXTRA_BOTTOM_SPACE;

    return (
        <SafeAreaView style={[styles.screenBg, { backgroundColor: theme.colors.background }]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <FlatList
                data={listData}
                keyExtractor={(entry) => getCartItemKey(entry.item)}
                contentContainerStyle={{ paddingBottom: contentBottomPadding }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                ListHeaderComponent={renderHeader}
                ListFooterComponent={footerComponent}
                ItemSeparatorComponent={() => <View className="h-4" style={styles.listSeparator} />}
                renderItem={renderListItem}
            />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );

};


//Cart component that displays the shopping cart page.
//Allows users to view and manage items, choose address/payment, and place orders.

export default Cart;

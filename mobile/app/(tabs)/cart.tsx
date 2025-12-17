import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/store/cart.store";
import { images, illustrations } from "@/constants/mediaCatalog";
import { useAddresses } from "@/src/features/address/addressFeature";
import useAuthStore from "@/store/auth.store";
import type { CartItemType } from "@/type";
import type { PaymentMethod } from "@/src/domain/types";
import { placeOrder } from "@/src/services/firebaseOrders";
import { seedMenuByRestaurantId, seedRestaurants, seedMenusAll } from "@/lib/restaurantSeeds";
import AddressSummary from "@/components/cart/AddressSummary";
import AddressTabBar from "@/components/cart/AddressTabBar";
import CartItemCard from "@/components/cart/CartItemCard";
import CourierNotes from "@/components/cart/CourierNotes";
import PaymentMethodList from "@/components/cart/PaymentMethodList";
import SummaryCard from "@/components/cart/SummaryCard";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";
import { makeShadow } from "@/src/lib/shadowStyle";

const OrderIllustration = illustrations.foodieCelebration;

const CONTAINER_PADDING = { paddingHorizontal: 24 };
const MAX_NOTES = 200;
const MINIMUM_ORDER_TOTAL = 30;
const TAB_BAR_HEIGHT = 80;
const TAB_BAR_BOTTOM_OFFSET = 40;
const EXTRA_BOTTOM_SPACE = 8;

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
        "hotnfresh": "hot-n-fresh",
        "hot-n-fresh": "hot-n-fresh",
        "lavish": "lavish",
        "munchies": "munchies",
        "root": "root-kitchen-coffee",
        "rootkitchencoffee": "root-kitchen-coffee",
        "root-kitchen-coffee": "root-kitchen-coffee",
        "lombard": "lombard-kitchen",
        "lombardkitchen": "lombard-kitchen",
        "lombard-kitchen": "lombard-kitchen",
    };

    if (lookup[compact]) return lookup[compact];
    const dashy = key.replace(/\s+/g, "-");
    if (lookup[dashy]) return lookup[dashy];
    return compact;
};

const Cart = () => {
    const insets = useSafeAreaInsets();
    const { items, getTotalPrice, increaseQty, decreaseQty, removeItem, clearCart, addItem } = useCartStore();
    const { user } = useAuthStore();
    const { t } = useTranslation();
    const noteSuggestions: string[] = [];
    const paymentOptions: { id: PaymentMethod; label: string; description: string; badge?: string; hint?: string }[] = [
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
    const isCardOnDelivery = paymentMethod === "pos";
    const serviceFee = isCardOnDelivery ? 1 : 0;
    const discount = 0;
    const total = Math.max(subtotal + serviceFee - discount, 0);
    const serviceNote = isCardOnDelivery ? t("cart.screen.serviceNote.pos") : "";
    const summaryLabels = {
        subtotal: t("cart.screen.summary.subtotal"),
        delivery: t("cart.screen.summary.delivery"),
        serviceFee: t("cart.screen.summary.serviceFee"),
        discount: t("cart.screen.summary.discount"),
        total: t("cart.screen.summary.total"),
        footnote: t("cart.screen.summary.footnote"),
    };

    const { addresses, isLoading: addressesLoading } = useAddresses();
    const addressList = addresses ?? [];
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [notes, setNotes] = useState("");
    const [placingOrder, setPlacingOrder] = useState(false);
    const resolvedAddressId = selectedAddress ?? addressList[0]?.id ?? null;
    const isBelowMinimum = subtotal < MINIMUM_ORDER_TOTAL;
    const canCheckout = Boolean(!isCartEmpty && resolvedAddressId !== null && paymentMethod && !isBelowMinimum);
    const selectedAddressId = stringifyId(selectedAddress);
    const handleSelectAddress = (addressId: string | number) => setSelectedAddress(String(addressId));
    const listData = useMemo(() => {
        const data: Array<{ type: "addresses" } | { type: "item"; item: CartItemType }> = [{ type: "addresses" }];
        items.forEach((item) => data.push({ type: "item", item }));
        return data;
    }, [items]);

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

    const handlePlaceOrder = async () => {
        if (placingOrder) return;
        if (!items.length) {
            Alert.alert(t("cart.empty.title"), t("cart.empty.subtitle"));
            return;
        }

        if (resolvedAddressId === null) {
            Alert.alert(t("cart.screen.alerts.addAddressTitle"), t("cart.screen.alerts.addAddressBody"));
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

        const pendingEta = 120;
        const localOrderItems = items.map((item) => ({
            menuItemId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            price: item.price + getCustomizationsTotal(item.customizations),
            customizations: item.customizations?.map(({ id, name, price }) => ({ id, name, price })) ?? [],
        }));

        try {
            setPlacingOrder(true);
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
            });
            const restaurantLabel =
                (items[0] as CartItemWithRestaurant | undefined)?.name?.split(" ")[0] || "Kalkanli Mutfagi";

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
            Alert.alert(t("cart.screen.alerts.placeErrorTitle"), error?.message || t("cart.screen.alerts.placeErrorBody"));
        } finally {
            setPlacingOrder(false);
        }
    };

    if (isCartEmpty) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-5">
                <Image source={images.deliveryBag} className="w-60 h-60" contentFit="cover" />
                <Text className="h3-bold text-dark-100 mt-4">{t("cart.empty.title")}</Text>
                <Text className="body-medium text-center mt-2 text-dark-60">{t("cart.empty.subtitle")}</Text>
                <TouchableOpacity className="mt-4 px-6 py-3 rounded-full bg-primary" onPress={() => router.push("/")}>
                    <Text className="text-white paragraph-semibold">{t("cart.empty.cta")}</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    const renderOrderHero = () => (
        <View className="px-6">
            <View className="bg-white rounded-[32px] border border-[#F3E4D7] flex-row items-center gap-4 px-5 py-4">
                <View className="flex-1 gap-2">
                    <Text className="text-xl font-ezra-bold text-dark-100">{t("cart.screen.orderTitle")}</Text>
                    <Text className="body-medium text-dark-60">{t("cart.screen.orderSubtitle")}</Text>
                </View>
                <OrderIllustration width={120} height={120} />
            </View>
        </View>
    );

    const renderHeader = () => (
        <View className="gap-4">
            <AddressSummary
                addresses={addressList}
                loading={addressesLoading}
                selectedAddressId={selectedAddressId}
                onSelect={handleSelectAddress}
                onManageAddresses={() => router.push("/ManageAddresses")}
                onAddAddress={() => router.push("/ManageAddresses")}
            />
            {renderOrderHero()}
        </View>
    );

    const renderAddressTabs = () => (
        <AddressTabBar
            addresses={addressList}
            loading={addressesLoading}
            selectedAddressId={selectedAddressId}
            onSelect={handleSelectAddress}
            onAddAddress={() => router.push("/ManageAddresses")}
        />
    );

    const renderListItem = ({ item }: { item: { type: "addresses" } | { type: "item"; item: CartItemType } }) => {
        if (item.type === "addresses") return renderAddressTabs();
        const cartItem = item.item;
        return (
            <CartItemCard
                item={cartItem}
                onIncrease={() => increaseQty(cartItem.id, cartItem.customizations || [])}
                onDecrease={() => decreaseQty(cartItem.id, cartItem.customizations || [])}
                onRemove={() => removeItem(cartItem.id, cartItem.customizations || [])}
            />
        );
    };

    const handleNoteChange = (text: string) => setNotes(text.slice(0, MAX_NOTES));

    const resolveRestaurantFromCart = () => {
        const explicit = items.find((item) => (item as CartItemWithRestaurant).restaurantId)?.restaurantId;
        if (explicit) {
            const normalized = normalizeRestaurantKey(String(explicit));
            if (normalized) return normalized;
        }

        const inferred = items
            .map((item) => normalizeRestaurantKey(MENU_ID_TO_RESTAURANT[String(item.id)] || null))
            .find((id): id is string => Boolean(id));

        return inferred || null;
    };

    const renderDrinkSuggestions = () => {
        if (!items.length) return null;
        const restaurantId = resolveRestaurantFromCart();
        if (!restaurantId) return null;
        const catalog = seedMenuByRestaurantId(restaurantId) || [];
        const restaurantName = seedRestaurants.find((r) => String(r.id) === restaurantId)?.name || "Restoran";

        const isDrinkCategory = (cat?: string) => {
            if (!cat) return false;
            const lower = cat.toLowerCase();
            return lower.includes("drink") || lower.includes("içecek") || lower.includes("icecek");
        };

        const cartHasDrink = items.some((cartItem) => {
            const match = catalog.find((entry: any) => String(entry.id) === String(cartItem.id));
            if (match && Array.isArray(match.categories) && match.categories.some((c: any) => isDrinkCategory(String(c)))) {
                return true;
            }
            const name = (cartItem.name || "").toLowerCase();
            return name.includes("içecek") || name.includes("icecek") || name.includes("drink");
        });
        if (cartHasDrink) return null;

        const drinks = catalog.filter(
            (entry: any) =>
                Array.isArray(entry.categories) && entry.categories.some((c: any) => isDrinkCategory(String(c))),
        );
        if (!drinks.length) return null;

        const handleAddDrink = (drink: any) => {
            addItem({
                id: String(drink.id),
                name: drink.name,
                price: Number(drink.price || 0),
                image_url: "",
                restaurantId,
                customizations: [],
            });
        };

        return (
            <View
                className="rounded-[24px] overflow-hidden border border-[#F3E4D7]"
                style={makeShadow({ color: "#0F172A", offsetY: 10, blurRadius: 24, opacity: 0.08, elevation: 4 })}
            >
                <View className="px-5 py-4 bg-gradient-to-r from-[#FFF7EC] to-[#FFEFD9] border-b border-[#F3E4D7]">
                    <Text className="text-lg font-ezra-bold text-dark-100">
                        {t("cart.screen.drinkSuggestTitle", { restaurant: restaurantName })}
                    </Text>
                    <Text className="body-medium text-dark-60 mt-1">
                        {t("cart.screen.drinkSuggestSubtitle")}
                    </Text>
                </View>
                <View className="gap-[1px] bg-[#F3E4D7]">
                    <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                        {drinks.map((drink: any) => (
                            <View
                                key={String(drink.id)}
                                className="flex-row items-center justify-between bg-white px-5 py-4"
                            >
                                <View style={{ flex: 1, gap: 4, paddingRight: 12 }}>
                                    <Text className="paragraph-semibold text-dark-100" numberOfLines={1}>
                                        {drink.name}
                                    </Text>
                                    {drink.description ? (
                                        <Text className="caption text-dark-60" numberOfLines={1}>
                                            {drink.description}
                                        </Text>
                                    ) : null}
                                    <Text className="paragraph-semibold text-primary">{formatCurrency(drink.price)}</Text>
                                </View>
                                <TouchableOpacity
                                    className="px-4 py-2 rounded-full bg-primary"
                                    onPress={() => handleAddDrink(drink)}
                                >
                                    <Text className="paragraph-semibold text-white">
                                        {t("cart.screen.drinkSuggestAdd")}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        );
    };

    const renderFooter = () => {
        const disabled = !canCheckout || placingOrder;
        const label = isBelowMinimum
            ? t("cart.screen.checkout.minimumLabel", { amount: formatCurrency(MINIMUM_ORDER_TOTAL) })
            : t("cart.screen.checkout.checkoutLabel", { amount: formatCurrency(total) });

        return (
            <View className="gap-5 pt-6 pb-10" style={CONTAINER_PADDING}>
                {renderDrinkSuggestions()}
                <SummaryCard
                    subtotal={formatCurrency(subtotal)}
                    deliveryFee={deliveryFee ? formatCurrency(deliveryFee) : undefined}
                    serviceFee={serviceFee ? formatCurrency(serviceFee) : undefined}
                    serviceNote={serviceFee ? serviceNote : undefined}
                    total={formatCurrency(total)}
                    labels={summaryLabels}
                />

                <PaymentMethodList
                    title={t("cart.screen.payment.title")}
                    options={paymentOptions}
                    selected={paymentMethod}
                    onSelect={setPaymentMethod}
                />

                <CourierNotes
                    title={t("cart.screen.notesTitle")}
                    placeholder={t("cart.screen.notesPlaceholder")}
                    value={notes}
                    maxLength={MAX_NOTES}
                    suggestions={noteSuggestions}
                    onChange={handleNoteChange}
                />

                <TouchableOpacity
                    className="custom-btn flex-row items-center justify-center gap-3"
                    style={{ opacity: disabled ? 0.6 : 1 }}
                    disabled={disabled}
                    onPress={handlePlaceOrder}
                >
                    {placingOrder && <ActivityIndicator color="#fff" />}
                    <Text className="paragraph-semibold text-white">
                        {placingOrder ? t("cart.screen.checkout.placing") : label}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    const contentBottomPadding = insets.bottom + TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_OFFSET + EXTRA_BOTTOM_SPACE;

    return (
        <SafeAreaView className="flex-1 bg-[#F8F6F2]">
            <FlatList
                data={listData}
                keyExtractor={(entry) => (entry.type === "addresses" ? "address-tabs" : getCartItemKey(entry.item))}
                contentContainerStyle={{ paddingBottom: contentBottomPadding }}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={listData.length ? [1] : []}
                ListHeaderComponent={renderHeader}
                ListFooterComponent={renderFooter}
                ItemSeparatorComponent={() => <View className="h-4" />}
                renderItem={renderListItem}
            />
        </SafeAreaView>
    );

};


//Cart component that displays the shopping cart page.
//Allows users to view and manage items, choose address/payment, and place orders.

export default Cart;

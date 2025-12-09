import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import AddressSummary from "@/components/cart/AddressSummary";
import AddressTabBar from "@/components/cart/AddressTabBar";
import CartItemCard from "@/components/cart/CartItemCard";
import CourierNotes from "@/components/cart/CourierNotes";
import PaymentMethodList from "@/components/cart/PaymentMethodList";
import SummaryCard from "@/components/cart/SummaryCard";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";

const OrderIllustration = illustrations.foodieCelebration;

const CONTAINER_PADDING = { paddingHorizontal: 24 };
const MAX_NOTES = 200;
const MINIMUM_ORDER_TOTAL = 30;

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

const Cart = () => {
    const { items, getTotalPrice, increaseQty, decreaseQty, removeItem, clearCart } = useCartStore();
    const { user } = useAuthStore();
    const { t } = useTranslation();
    const noteSuggestions: string[] = [];
    const paymentOptions: { id: PaymentMethod; label: string; description: string; badge?: string; hint?: string }[] =
        useMemo(
            () => [
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
            ],
            [t],
        );
    const subtotal = useMemo(() => getTotalPrice(), [getTotalPrice, items]);
    const isCartEmpty = items.length === 0;
    const deliveryFee = 0;
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>("pos");
    const isCardOnDelivery = paymentMethod === "pos";
    const serviceFee = isCardOnDelivery ? 1 : 0;
    const discount = 0;
    const total = Math.max(subtotal + serviceFee - discount, 0);
    const serviceNote = isCardOnDelivery ? t("cart.screen.serviceNote.pos") : "";
    const summaryLabels = useMemo(
        () => ({
            subtotal: t("cart.screen.summary.subtotal"),
            delivery: t("cart.screen.summary.delivery"),
            serviceFee: t("cart.screen.summary.serviceFee"),
            discount: t("cart.screen.summary.discount"),
            total: t("cart.screen.summary.total"),
            footnote: t("cart.screen.summary.footnote"),
        }),
        [t],
    );

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
            });
            const restaurantLabel =
                (items[0] as CartItemWithRestaurant | undefined)?.name?.split(" ")[0] || "Kalkanli Mutfagi";

            clearCart();
            router.replace({
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

    const renderFooter = () => {
        const disabled = !canCheckout || placingOrder;
        const label = isBelowMinimum
            ? t("cart.screen.checkout.minimumLabel", { amount: formatCurrency(MINIMUM_ORDER_TOTAL) })
            : t("cart.screen.checkout.checkoutLabel", { amount: formatCurrency(total) });

        return (
            <View className="gap-5 pt-6 pb-20" style={CONTAINER_PADDING}>
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

    const renderStickyCheckout = () => {
        const disabled = !canCheckout || placingOrder;
        const label = isBelowMinimum
            ? t("cart.screen.checkout.minimumLabel", { amount: formatCurrency(MINIMUM_ORDER_TOTAL) })
            : t("cart.screen.checkout.checkoutLabel", { amount: formatCurrency(total) });

        return (
            <View className="absolute left-0 right-0" style={{ bottom: 24, paddingHorizontal: 16 }}>
                <View className="bg-white rounded-full border border-[#F3E4D7] px-4 py-3 flex-row items-center gap-3">
                    <View className="flex-1">
                        <Text className="caption text-dark-40">{t("cart.screen.checkout.total")}</Text>
                        <Text className="h3-bold text-dark-100">{formatCurrency(total)}</Text>
                        <Text className="caption text-dark-40">
                            {isBelowMinimum
                                ? t("cart.screen.checkout.addMore")
                                : serviceFee
                                    ? t("cart.screen.checkout.serviceFeeApplied")
                                    : ""}
                        </Text>
                    </View>
                    <TouchableOpacity
                        className="flex-row items-center gap-2 px-5 py-3 rounded-full bg-primary"
                        disabled={disabled}
                        style={{ opacity: disabled ? 0.6 : 1 }}
                        onPress={handlePlaceOrder}
                    >
                        {placingOrder && <ActivityIndicator color="#fff" />}
                        <Text className="paragraph-semibold text-white">
                            {placingOrder ? t("cart.screen.checkout.placingShort") : label}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-[#F8F6F2]">
            <FlatList
                data={listData}
                keyExtractor={(entry) => (entry.type === "addresses" ? "address-tabs" : getCartItemKey(entry.item))}
                contentContainerStyle={{ paddingBottom: 260 }}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={listData.length ? [1] : []}
                ListHeaderComponent={renderHeader}
                ListFooterComponent={renderFooter}
                ItemSeparatorComponent={() => <View className="h-4" />}
                renderItem={renderListItem}
            />
            {renderStickyCheckout()}
        </SafeAreaView>
    );
};

/**
 * Cart component that displays the shopping cart page.
 * Allows users to view and manage items, choose address/payment, and place orders.
 */
export default Cart;

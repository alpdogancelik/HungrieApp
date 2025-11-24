import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/store/cart.store";
import { images, cookingScenes } from "@/constants/mediaCatalog";
import { createOrder } from "@/lib/api";
import { useAddresses } from "@/src/features/address/addressFeature";
import useAuthStore from "@/store/auth.store";
import type { CartItemType } from "@/type";
import type { PaymentMethod } from "@/src/domain/types";
import AddressSummary from "@/components/cart/AddressSummary";
import AddressTabBar from "@/components/cart/AddressTabBar";
import CartItemCard from "@/components/cart/CartItemCard";
import CourierNotes from "@/components/cart/CourierNotes";
import PaymentMethodList from "@/components/cart/PaymentMethodList";
import SummaryCard from "@/components/cart/SummaryCard";
import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";
import { registerLocalOrder } from "@/src/api/client";

const QuietDropScene = cookingScenes.orderAccepted;

const paymentOptions: { id: PaymentMethod; label: string; description: string }[] = [
    { id: "pos", label: "Card on delivery (POS)", description: "Courier brings a wireless POS" },
    { id: "cash", label: "Cash", description: "Pay cash to the courier" },
];

const CONTAINER_PADDING = { paddingHorizontal: 24 };
const MAX_NOTES = 200;
const NOTE_SUGGESTIONS = ["Ring the bell", "Leave at door", "Call on arrival"];

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
    const subtotal = useMemo(() => getTotalPrice(), [getTotalPrice, items]);
    const isCartEmpty = items.length === 0;
    const deliveryFee = 0;
    const serviceFee = 0;
    const discount = subtotal > 250 ? 25 : 0;
    const total = subtotal - discount;

    const { addresses, isLoading: addressesLoading } = useAddresses();
    const addressList = addresses ?? [];
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>("pos");
    const [notes, setNotes] = useState("");
    const [placingOrder, setPlacingOrder] = useState(false);
    const resolvedAddressId = selectedAddress ?? addressList[0]?.id ?? null;
    const canCheckout = Boolean(!isCartEmpty && resolvedAddressId !== null && paymentMethod);
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

    const handlePrefillNote = () => {
        if (!notes) {
            setNotes("Leave at dorm lobby, text me when outside.");
        }
    };

    const handlePlaceOrder = async () => {
        if (!items.length) {
            Alert.alert(t("cart.empty.title"), t("cart.empty.subtitle"));
            return;
        }

        if (resolvedAddressId === null) {
            Alert.alert("Add a delivery address", "Please select or save a delivery address before checking out.");
            return;
        }

        if (!paymentMethod) {
            Alert.alert("Select a payment method", "Please choose how you'd like to pay before proceeding.");
            return;
        }

        const restaurantId = String(
            (items[0] as CartItemWithRestaurant | undefined)?.restaurantId ?? DEFAULT_RESTAURANT_ID,
        );

        const orderData = {
            restaurantId,
            addressId: resolvedAddressId,
            subtotal,
            deliveryFee,
            serviceFee,
            tip: 0,
            discount,
            total,
            paymentMethod: paymentMethod as PaymentMethod,
            paymentStatus: paymentMethod === "cash" ? "cash_due" : "pending",
            status: "pending",
            specialInstructions: notes,
        };

        const pendingEta = 120;

        const orderItems = items.map((item) => {
            const customizationTotal = getCustomizationsTotal(item.customizations);
            const numericMenuItemId = Number(item.id);
            const menuItemId = Number.isNaN(numericMenuItemId) ? item.id : numericMenuItemId;

            return {
                menuItemId,
                quantity: item.quantity,
                price: item.price + customizationTotal,
                customizations: item.customizations?.map(({ id, name, price, type }) => ({ id, name, price, type })) ?? [],
            };
        });
        const localOrderItems = items.map((item) => ({
            menuItemId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            price: item.price + getCustomizationsTotal(item.customizations),
            customizations: item.customizations?.map(({ id, name, price }) => ({ id, name, price })) ?? [],
        }));

        try {
            setPlacingOrder(true);
            const newOrderId = String(Date.now());
            const restaurantLabel =
                (items[0] as CartItemWithRestaurant | undefined)?.name?.split(" ")[0] || "Kampus Mutfagi";

            registerLocalOrder({
                id: newOrderId,
                userId: user?.id ?? user?.$id ?? user?.accountId ?? "guest",
                restaurantId,
                items: localOrderItems,
                status: "pending",
                paymentMethod: paymentMethod as PaymentMethod,
                subtotal,
                deliveryFee,
                serviceFee,
                discount,
                tip: 0,
                total,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                etaMinutes: pendingEta / 60,
            });

            clearCart();
            router.replace({
                pathname: "/order/pending",
                params: {
                    orderId: newOrderId,
                    restaurantName: restaurantLabel,
                    eta: String(pendingEta),
                },
            });

            // Fire-and-forget network persistence; don't block navigation
            createOrder({ orderData, orderItems }).catch((error: any) => {
                console.warn("[checkout] createOrder failed", error);
            });
        } catch (error: any) {
            Alert.alert("Unable to place order", error?.message || "Please try again in a moment.");
        } finally {
            setPlacingOrder(false);
        }
    };

    if (isCartEmpty) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-5">
                <Image source={images.deliveryBag} className="w-60 h-60" contentFit="cover" />
                <Text className="h3-bold text-dark-100 mt-4">{t("cart.empty.title")}</Text>
                <Text className="body-medium text-center mt-2 text-dark-60">
                    {t("cart.empty.subtitle")}
                </Text>
                <TouchableOpacity
                    className="mt-4 px-6 py-3 rounded-full bg-primary"
                    onPress={() => router.push("/")}
                >
                    <Text className="text-white paragraph-semibold">{t("cart.empty.cta")}</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

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
            <View className="px-6">
                <View className="bg-white rounded-[32px] border border-[#F3E4D7] flex-row items-center gap-4 px-5 py-4">
                    <View className="flex-1 gap-2">
                        <Text className="text-xs uppercase text-primary font-ezra-semibold">Quiet drop-offs</Text>
                        <Text className="text-xl font-ezra-bold text-dark-100">Couriers text after 23:00.</Text>
                        <Text className="body-medium text-dark-60">
                            Add clear notes so they know exactly where to leave your food.
                        </Text>
                        <TouchableOpacity
                            className="mt-2 self-start px-4 py-2 rounded-full bg-primary/10"
                            onPress={handlePrefillNote}
                        >
                            <Text className="paragraph-semibold text-primary-dark">Prefill courier note</Text>
                        </TouchableOpacity>
                    </View>
                    <QuietDropScene width={120} height={120} />
                </View>
            </View>
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
        const checkoutLabel = !resolvedAddressId
            ? "Select an address to continue"
            : !paymentMethod
                ? "Select a payment method"
                : `Checkout - ${formatCurrency(total)}`;

        return (
            <View className="gap-5 pt-6" style={CONTAINER_PADDING}>
                <SummaryCard
                    subtotal={formatCurrency(subtotal)}
                    discount={discount ? `- ${formatCurrency(discount)}` : "TRY 0.00"}
                    total={formatCurrency(total)}
                />

                <PaymentMethodList options={paymentOptions} selected={paymentMethod} onSelect={setPaymentMethod} />

                <CourierNotes
                    value={notes}
                    maxLength={MAX_NOTES}
                    suggestions={NOTE_SUGGESTIONS}
                    onChange={handleNoteChange}
                />

                <TouchableOpacity
                    className="custom-btn flex-row items-center justify-center gap-3"
                    style={{ opacity: !canCheckout || placingOrder ? 0.6 : 1 }}
                    disabled={!canCheckout || placingOrder}
                    onPress={handlePlaceOrder}
                >
                    {placingOrder && <ActivityIndicator color="#fff" />}
                    <Text className="paragraph-semibold text-white">
                        {placingOrder ? "Placing order..." : checkoutLabel}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-[#F8F6F2]">
            <FlatList
                data={listData}
                keyExtractor={(entry) =>
                    entry.type === "addresses" ? "address-tabs" : getCartItemKey(entry.item)
                }
                contentContainerStyle={{ paddingBottom: 200 }}
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

/**
 * Cart component that displays the shopping cart page.
 * 
 * This is the default export component for the cart tab screen,
 * allowing users to view and manage items in their shopping cart.
 * 
 * @returns {JSX.Element} The rendered cart screen component
 */
export default Cart;



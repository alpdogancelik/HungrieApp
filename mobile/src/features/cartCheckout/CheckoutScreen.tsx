import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { formatCurrency, getCustomizationsTotal } from "@/lib/cart.utils";
import { placeOrder, quoteOrder } from "@/src/data/orderRepository";
import { getRestaurant } from "@/src/data/restaurantRepository";
import type { Address, PaymentMethod } from "@/src/domain/types";
import { addressStore, useAddresses } from "@/src/features/address/addressFeature";
import { showUserMessage } from "@/src/lib/showUserMessage";
import { useTheme } from "@/src/theme/themeContext";
import useAuthStore from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { clearCheckoutOperation, discardCheckoutOperationAfterCartChange, resolveCheckoutOperation } from "./checkoutOperation";
import { classifyCheckoutQuoteFailure, type CheckoutQuoteFailure } from "./checkoutQuoteFailure";
import {
    FOOTER_CONTENT_HEIGHT,
    isRestaurantOpenForOrdering,
    MAX_NOTES,
    MINIMUM_ORDER_TOTAL,
    ORANGE,
    resolveCartRestaurantId,
    restaurantEta,
    stringifyId,
} from "./cartCheckoutModel";

const CheckoutScreen = () => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { i18n, t } = useTranslation();
    const { variant } = useTheme();
    const dark = variant === "dark";
    const styles = useMemo(() => createStyles(dark), [dark]);
    const turkish = i18n.language?.toLowerCase().startsWith("tr");
    const copy = (en: string, tr: string) => turkish ? tr : en;

    const items = useCartStore((state) => state.items);
    const subtotal = useCartStore((state) => state.totalPrice);
    const clearCart = useCartStore((state) => state.clearCart);
    const { user, isAuthenticated } = useAuthStore();
    const { addresses, isLoading: addressesLoading } = useAddresses();
    const addressList = addresses || [];
    const restaurantId = useMemo(() => resolveCartRestaurantId(items), [items]);
    const [restaurant, setRestaurant] = useState<any>(null);
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [addressSheetVisible, setAddressSheetVisible] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pos");
    const [notes, setNotes] = useState("");
    const [placingOrder, setPlacingOrder] = useState(false);
    const [serverQuote, setServerQuote] = useState<any>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<CheckoutQuoteFailure | null>(null);
    const [quoteAttempt, setQuoteAttempt] = useState(0);
    const scrollRef = useRef<ScrollView>(null);
    const deliveryFee = serverQuote ? Number(serverQuote.delivery_fee_kurus||0)/100 : 0;
    const serviceFee = serverQuote ? Number(serverQuote.service_fee_kurus||0)/100 : 0;
    const discount = serverQuote ? Number(serverQuote.discount_kurus||0)/100 : 0;
    const quotedSubtotal=serverQuote?Number(serverQuote.subtotal_kurus||0)/100:subtotal;
    const total = serverQuote?Number(serverQuote.total_kurus||0)/100:Math.max(0, subtotal + deliveryFee + serviceFee - discount);
    const belowMinimum = subtotal < MINIMUM_ORDER_TOTAL;

    useEffect(() => {
        if (!restaurantId) {
            setRestaurant(null);
            return;
        }
        setRestaurant(null);
        let mounted = true;
        void getRestaurant(restaurantId).then((result) => {
            if (mounted && result) setRestaurant(result);
        }).catch(() => undefined);
        return () => { mounted = false; };
    }, [restaurantId]);
    useEffect(() => {
        let active = true;
        if (!isAuthenticated || !restaurantId || !items.length) {
            setServerQuote(null);
            setQuoteError(null);
            setQuoteLoading(false);
            return;
        }
        setServerQuote(null);
        setQuoteError(null);
        setQuoteLoading(true);
        void quoteOrder(restaurantId, items).then((quote: any) => {
            if (active) setServerQuote(quote);
        }).catch((error) => {
            if (active) setQuoteError(classifyCheckoutQuoteFailure(error));
        }).finally(() => {
            if (active) setQuoteLoading(false);
        });
        return () => { active = false; };
    }, [isAuthenticated, items, quoteAttempt, restaurantId]);

    useFocusEffect(useCallback(() => {
        const preferred = addressList.find((address) => address.isDefault) || addressList[0];
        setSelectedAddressId((current) => addressList.some((address) => stringifyId(address.id) === current) ? current : preferred ? stringifyId(preferred.id) : null);
    }, [addressList]));

    const selectedAddress = addressList.find((address) => stringifyId(address.id) === selectedAddressId) || addressList.find((address) => address.isDefault) || addressList[0];
    const operationScope = String(user?.id || user?.$id || user?.accountId || "guest");
    const cartSignature = useMemo(() => JSON.stringify(items.map((item) => ({
        id: String(item.id), quantity: item.quantity,
        customizationIds: (item.customizations || []).map((entry) => `${entry.type || "option"}:${entry.id}`).sort(),
    }))), [items]);
    useEffect(() => {
        if (operationScope !== "guest") void discardCheckoutOperationAfterCartChange(operationScope, cartSignature);
    }, [cartSignature, operationScope]);
    const eta = restaurantEta(restaurant, Boolean(turkish));
    const canSubmit = Boolean(items.length && selectedAddress && paymentMethod && serverQuote && !quoteLoading && !quoteError && !placingOrder);

    const manageAddresses = () => {
        if (!isAuthenticated) {
            showUserMessage(t("authRequired.addressTitle", "Sign in required"), t("authRequired.addressBody", "Please sign in to manage delivery addresses."));
            router.push("/sign-in");
            return;
        }
        router.push("/ManageAddresses");
    };

    const openAddressSelector = () => {
        if (!isAuthenticated) {
            showUserMessage(t("authRequired.addressTitle", "Sign in required"), t("authRequired.addressBody", "Please sign in to manage delivery addresses."));
            router.push("/sign-in");
            return;
        }
        setAddressSheetVisible(true);
    };

    const selectAddress = async (id: string) => {
        setSelectedAddressId(id);
        try {
            await addressStore.setDefault(id);
            setAddressSheetVisible(false);
        } catch {
            Alert.alert(copy("Address could not be changed", "Adres değiştirilemedi"), copy("Please try again.", "Lütfen tekrar deneyin."));
        }
    };

    const placeCheckoutOrder = async () => {
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
        if (!selectedAddress) {
            Alert.alert(t("cart.screen.alerts.addAddressTitle"), t("cart.screen.alerts.addAddressBody"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("deliverTo.addAddress"), onPress: manageAddresses },
            ]);
            return;
        }
        if (!serverQuote || quoteLoading || quoteError) {
            Alert.alert(copy("Price could not be verified", "Fiyat doğrulanamadı"), copy("Retry the server price before placing the order.", "Siparişi vermeden önce sunucu fiyatını yeniden deneyin."));
            return;
        }

        const resolvedRestaurantId = String(items[0]?.restaurantId || restaurantId || "");
        if (!resolvedRestaurantId) {
            Alert.alert(t("cart.screen.alerts.placeErrorTitle"), copy("The cart is missing its Restaurant. Remove these items and add them again.", "Sepette restoran bilgisi eksik. Ürünleri kaldırıp yeniden ekleyin."));
            return;
        }
        const pendingEta = 120;
        try {
            setPlacingOrder(true);
            const currentRestaurant = await getRestaurant(resolvedRestaurantId);
            if (currentRestaurant && !isRestaurantOpenForOrdering(currentRestaurant)) {
                Alert.alert(t("cart.screen.alerts.placeErrorTitle"), copy("This restaurant is closed right now. Please order from an open restaurant.", "Bu restoran şu anda kapalı. Lütfen açık bir restorandan sipariş verin."));
                return;
            }
            const requestSignature = JSON.stringify({
                restaurantId: resolvedRestaurantId,
                addressId: String(selectedAddress.id),
                paymentMethod,
                notes: notes.trim(),
                items: items.map((item) => ({
                    id: String(item.id),
                    quantity: item.quantity,
                    customizationIds: (item.customizations || []).map((entry) => `${entry.type || "option"}:${entry.id}`).sort(),
                })),
            });
            const operationId = await resolveCheckoutOperation(operationScope, requestSignature, cartSignature);
            const orderId = await placeOrder({
                userId: user?.id ?? user?.$id ?? user?.accountId ?? "guest",
                restaurantId: resolvedRestaurantId,
                items: items.map((item) => ({
                    menuItemId: String(item.id),
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price + getCustomizationsTotal(item.customizations),
                    customizations: item.customizations?.map(({ id, name, price, type }) => ({ id, name, price, type })) || [],
                })),
                paymentMethod,
                fees: { deliveryFee, serviceFee, discount, tip: 0 },
                etaMinutes: pendingEta / 60,
                customer: { name: user?.name, email: user?.email, whatsappNumber: user?.whatsappNumber },
                deliveryAddress: copyAddress(selectedAddress),
                notes,
                operationId,
            });
            const restaurantName = restaurant?.name || copy("Restaurant", "Restoran");
            clearCart();
            await clearCheckoutOperation(operationScope, operationId);
            router.replace({ pathname: "/order/pending", params: { orderId, restaurantName, eta: String(pendingEta) } });
        } catch {
            Alert.alert(t("cart.screen.alerts.placeErrorTitle"), t("cart.screen.alerts.placeErrorBody"));
        } finally {
            setPlacingOrder(false);
        }
    };

    const goBack = () => router.replace("/cart");

    if (!items.length) {
        return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
            <StatusBar style={dark ? "light" : "dark"} />
            <TransactionHeader onBack={goBack} title={copy("Secure payment", "Güvenli Ödeme")} styles={styles} />
            <View style={styles.empty}><Ionicons color={ORANGE} name="cart-outline" size={34} /><Text style={styles.emptyTitle}>{t("cart.empty.title")}</Text><Pressable accessibilityRole="button" onPress={goBack} style={styles.emptyButton}><Text style={styles.buttonText}>{copy("Back to cart", "Sepete dön")}</Text></Pressable></View>
        </SafeAreaView>;
    }

    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
            <StatusBar style={dark ? "light" : "dark"} />
            <TransactionHeader onBack={goBack} title={copy("Secure payment", "Güvenli Ödeme")} styles={styles} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
                <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: FOOTER_CONTENT_HEIGHT + insets.bottom + 20 }]} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <SectionHeader styles={styles} title={copy("Delivery address", "Teslimat adresi")} />
                    <Pressable accessibilityRole="button" onPress={openAddressSelector} style={styles.addressRow}>
                        <Ionicons color={ORANGE} name="location-outline" size={23} />
                        <View style={styles.flex}>
                            {addressesLoading ? <ActivityIndicator color={ORANGE} style={styles.addressLoader} /> : selectedAddress ? <><Text numberOfLines={1} style={styles.addressLabel}>{selectedAddress.label}</Text><Text numberOfLines={1} style={styles.addressLine}>{[selectedAddress.line1, selectedAddress.block, selectedAddress.room].filter(Boolean).join(", ")}</Text><Text numberOfLines={1} style={styles.addressLine}>{[selectedAddress.city, selectedAddress.country].filter(Boolean).join(", ")}</Text></> : <Text style={styles.addressLabel}>{copy("Add delivery address", "Teslimat adresi ekle")}</Text>}
                        </View>
                        <Ionicons color={styles.tertiary.color} name="chevron-forward" size={18} />
                    </Pressable>
                    {!addressesLoading && !selectedAddress ? <Pressable accessibilityRole="button" onPress={manageAddresses} style={styles.addressWarning}>
                        <Ionicons color="#D92D20" name="alert-circle-outline" size={20} />
                        <Text style={styles.addressWarningText}>{copy("Please add a delivery address before placing your order.", "Lütfen sipariş vermeden önce bir teslimat adresi ekleyin.")}</Text>
                        <Text style={styles.addressWarningAction}>{copy("Add address", "Adres ekle")}</Text>
                    </Pressable> : null}

                    <View style={styles.etaRow}><MaterialCommunityIcons color={styles.text.color} name="motorbike" size={21} /><Text style={styles.etaLabel}>{copy("Estimated delivery time", "Tahmini teslimat süresi")}</Text><Text style={styles.etaValue}>{eta}</Text></View>

                    <Text style={styles.sectionTitle}>{copy("Order summary", "Sipariş özeti")}</Text>
                    <View style={styles.summaryCard}>
                        {items.map((item) => {
                            const unit = Number(item.price || 0) + getCustomizationsTotal(item.customizations);
                            return <View key={`${item.id}-${(item.customizations || []).map((option) => option.id).join("-")}`} style={styles.summaryItem}><View style={styles.flex}><Text numberOfLines={1} style={styles.summaryName}>{item.name}</Text><Text style={styles.summarySub}>{item.quantity} × {formatCurrency(unit)}</Text></View><Text style={styles.summaryPrice}>{formatCurrency(unit * item.quantity)}</Text></View>;
                        })}
                        <View style={styles.summaryDivider} />
                        <CostRow label={copy("Subtotal", "Ara toplam")} styles={styles} value={formatCurrency(quotedSubtotal)} />
                        <CostRow label={copy("Delivery fee", "Teslimat ücreti")} styles={styles} value={formatCurrency(deliveryFee)} />
                        {serviceFee ? <CostRow label={copy("Service fee", "Hizmet bedeli")} styles={styles} value={formatCurrency(serviceFee)} /> : null}
                        {discount ? <CostRow label={copy("Discount", "İndirim")} styles={styles} value={`-${formatCurrency(discount)}`} /> : null}
                        <View style={styles.summaryDivider} />
                        <View style={styles.totalRow}><Text style={styles.totalLabel}>{copy("Total", "Toplam")}</Text><Text style={styles.totalValue}>{formatCurrency(total)}</Text></View>
                    </View>

                    <Text style={styles.sectionTitle}>{copy("Payment method", "Ödeme yöntemi")}</Text>
                    <PaymentRow description={copy("The courier will bring a POS terminal.", "Kurye yanında POS cihazı ile gelir.")} icon="card-outline" label={copy("Pay by card at the door (POS)", "Kapıda kart ile ödeme (POS)")} onPress={() => setPaymentMethod("pos")} recommended={copy("Recommended", "Önerilen")} selected={paymentMethod === "pos"} styles={styles} />
                    <PaymentRow description={copy("Pay the courier in cash.", "Ödemeyi kuryeye nakit olarak yapın.")} icon="cash-outline" label={copy("Cash payment", "Nakit ödeme")} onPress={() => setPaymentMethod("cash")} selected={paymentMethod === "cash"} styles={styles} />

                    <View style={styles.noteHeader}><Text style={styles.noteTitle}>{copy("Note to restaurant", "Restorana not")}</Text><Text style={styles.optional}>{copy("Optional", "İsteğe bağlı")}</Text></View>
                    <View style={styles.noteShell}><TextInput maxLength={MAX_NOTES} multiline onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)} onChangeText={(value) => setNotes(value.slice(0, MAX_NOTES))} placeholder={copy("Door code, dorm details, special requests...", "Kapı kodu, yurt detayları, özel istekler...")} placeholderTextColor={styles.tertiary.color} style={styles.noteInput} textAlignVertical="top" value={notes} /><Text style={styles.counter}>{notes.length}/{MAX_NOTES}</Text></View>

                    {belowMinimum ? <View style={styles.minimumWarning}><Ionicons color="#F79009" name="warning-outline" size={18} /><Text style={styles.minimumText}>{copy(`Add ${formatCurrency(MINIMUM_ORDER_TOTAL - subtotal)} more to meet the minimum order.`, `Minimum sipariş tutarına ulaşmak için ${formatCurrency(MINIMUM_ORDER_TOTAL - subtotal)} daha ekleyin.`)}</Text></View> : null}
                    {quoteLoading ? <View style={styles.quoteState}><ActivityIndicator color={ORANGE} size="small" /><Text style={styles.quoteStateText}>{copy("Verifying the current server price…", "Güncel sunucu fiyatı doğrulanıyor…")}</Text></View> : null}
                    {quoteError ? <View style={styles.quoteState}><Ionicons color="#D92D20" name={quoteError === "restaurant_closed" ? "storefront-outline" : quoteError === "customer_access_denied" ? "lock-closed-outline" : "cloud-offline-outline"} size={18} /><Text style={styles.quoteStateText}>{quoteError === "restaurant_closed" ? copy("This restaurant is not accepting orders right now.", "Bu restoran şu anda sipariş almıyor.") : quoteError === "customer_access_denied" ? copy("Your Customer access has changed. Return to the app or sign in again.", "Müşteri erişiminiz değişti. Uygulamaya dönün veya tekrar giriş yapın.") : quoteError === "invalid_menu" ? copy("The current menu configuration could not be verified.", "Güncel menü yapılandırması doğrulanamadı.") : copy("The current server price could not be reached.", "Güncel sunucu fiyatına ulaşılamadı.")}</Text>{quoteError !== "customer_access_denied" ? <Pressable accessibilityRole="button" onPress={() => setQuoteAttempt((value) => value + 1)}><Text style={styles.quoteRetry}>{copy("Retry", "Tekrar dene")}</Text></Pressable> : null}</View> : null}
                </ScrollView>
                <TransactionFooter amount={formatCurrency(total)} ctaLabel={copy("Complete order", "Siparişi Tamamla")} disabled={!canSubmit} loading={placingOrder} onPress={() => void placeCheckoutOrder()} processingLabel={copy("Processing...", "İşleniyor...")} safeBottom={insets.bottom} styles={styles} totalLabel={copy("Total", "Toplam")} />
            </KeyboardAvoidingView>

            <Modal animationType="slide" onRequestClose={() => setAddressSheetVisible(false)} transparent visible={addressSheetVisible}>
                <View style={styles.modalBackdrop}>
                    <Pressable accessibilityLabel={copy("Close address selector", "Adres seçiciyi kapat")} onPress={() => setAddressSheetVisible(false)} style={styles.modalDismiss} />
                    <View style={[styles.addressSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>{copy("Choose delivery address", "Teslimat adresi seç")}</Text>
                        {addressList.length ? (
                            <FlatList
                                data={addressList}
                                keyExtractor={(item) => stringifyId(item.id)}
                                renderItem={({ item }) => {
                                    const id = stringifyId(item.id);
                                    const selected = id === stringifyId(selectedAddress?.id);
                                    return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => void selectAddress(id)} style={styles.addressOption}>
                                        <View style={styles.addressOptionCopy}>
                                            <Text style={styles.addressOptionTitle}>{item.label}</Text>
                                            <Text numberOfLines={1} style={styles.addressOptionLine}>{[item.line1, item.block, item.room, item.city, item.country].filter(Boolean).join(", ")}</Text>
                                        </View>
                                        <Ionicons color={selected ? ORANGE : styles.tertiary.color} name={selected ? "radio-button-on" : "radio-button-off"} size={23} />
                                    </Pressable>;
                                }}
                            />
                        ) : <Text style={styles.emptyAddresses}>{copy("No saved addresses yet.", "Henüz kayıtlı adres yok.")}</Text>}
                        <Pressable accessibilityRole="button" onPress={() => { setAddressSheetVisible(false); manageAddresses(); }} style={styles.manageAddressButton}>
                            <Text style={styles.manageAddressText}>{copy("Manage addresses", "Adresleri yönet")}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const copyAddress = (address: Address): Address => ({
    id: address.id,
    label: address.label,
    line1: address.line1,
    block: address.block,
    room: address.room,
    city: address.city,
    country: address.country,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
});

type Styles = ReturnType<typeof createStyles>;

const TransactionHeader = ({ title, onBack, styles }: { title: string; onBack: () => void; styles: Styles }) => <View style={styles.header}><Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.backButton}><Ionicons color={styles.text.color} name="chevron-back" size={22} /></Pressable><Text numberOfLines={1} style={styles.headerTitle}>{title}</Text><View style={styles.headerSpacer} /></View>;

const SectionHeader = ({ title, styles }: { title: string; styles: Styles }) => <View style={styles.sectionHeader}><Text style={styles.sectionTitleFlush}>{title}</Text></View>;

const CostRow = ({ label, value, styles }: { label: string; value: string; styles: Styles }) => <View style={styles.costRow}><Text style={styles.costLabel}>{label}</Text><Text style={styles.costValue}>{value}</Text></View>;

const PaymentRow = ({ label, description, icon, selected, recommended, onPress, styles }: { label: string; description: string; icon: "card-outline" | "cash-outline"; selected: boolean; recommended?: string; onPress: () => void; styles: Styles }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.paymentRow, selected && styles.paymentSelected]}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View><Ionicons color={styles.text.color} name={icon} size={23} /><View style={styles.flex}><View style={styles.paymentTitleRow}><Text numberOfLines={1} style={styles.paymentTitle}>{label}</Text>{recommended ? <View style={styles.badge}><Text style={styles.badgeText}>{recommended}</Text></View> : null}</View><Text numberOfLines={1} style={styles.paymentDescription}>{description}</Text></View></Pressable>;

const TransactionFooter = ({ amount, totalLabel, ctaLabel, processingLabel, disabled, loading, onPress, safeBottom, styles }: { amount: string; totalLabel: string; ctaLabel: string; processingLabel: string; disabled: boolean; loading: boolean; onPress: () => void; safeBottom: number; styles: Styles }) => <View style={[styles.footer, { paddingBottom: Math.max(safeBottom, 8) }]}><View><Text style={styles.footerLabel}>{totalLabel}</Text><Text style={styles.footerAmount}>{amount}</Text></View><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.primaryDisabled]}>{loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}<Text style={[styles.buttonText, disabled && styles.disabledText]}>{loading ? processingLabel : ctaLabel}</Text></Pressable></View>;

const createStyles = (dark: boolean) => {
    const c = { bg: dark ? "#0F1115" : "#FAFBFC", surface: dark ? "#171A20" : "#FFFFFF", text: dark ? "#F5F7FA" : "#111318", muted: dark ? "#98A2B3" : "#667085", tertiary: dark ? "#778293" : "#98A2B3", border: dark ? "#2A2E35" : "#EAECF0", input: dark ? "#1C2027" : "#FFFFFF", subtle: dark ? "#22262E" : "#F5F6F8" };
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.bg }, flex: { flex: 1, minWidth: 0 }, text: { color: c.text }, tertiary: { color: c.tertiary }, pressed: { opacity: 0.65 }, primaryPressed: { backgroundColor: "#E94F00" },
        header: { height: 52, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }, headerTitle: { flex: 1, color: c.text, textAlign: "center", fontSize: 21, lineHeight: 26, fontWeight: "700" }, headerSpacer: { width: 40 },
        content: { paddingHorizontal: 20, paddingTop: 10 }, sectionHeader: { minHeight: 28, flexDirection: "row", alignItems: "center" }, sectionTitleFlush: { flex: 1, color: c.text, fontSize: 18.5, lineHeight: 23, fontWeight: "700" },
        addressRow: { minHeight: 72, marginTop: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 12 }, addressLabel: { color: c.text, fontSize: 14.5, lineHeight: 18, fontWeight: "600" }, addressLine: { color: c.muted, fontSize: 12.5, lineHeight: 16 }, addressLoader: { alignSelf: "flex-start" }, addressWarning: { marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: dark ? "#7A271A" : "#FDA29B", backgroundColor: dark ? "#3B1E1A" : "#FEF3F2", paddingHorizontal: 11, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }, addressWarningText: { flex: 1, color: dark ? "#FECDCA" : "#B42318", fontSize: 12.5, lineHeight: 17, fontWeight: "500" }, addressWarningAction: { color: ORANGE, fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
        etaRow: { height: 48, marginTop: 10, borderRadius: 13, borderWidth: 1, borderColor: c.border, paddingHorizontal: 13, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 10 }, etaLabel: { flex: 1, color: c.text, fontSize: 13.5, lineHeight: 18, fontWeight: "500" }, etaValue: { color: c.text, fontSize: 14, lineHeight: 18, fontWeight: "700" },
        sectionTitle: { marginTop: 12, marginBottom: 7, color: c.text, fontSize: 18.5, lineHeight: 23, fontWeight: "700" }, summaryCard: { borderRadius: 15, borderWidth: 1, borderColor: c.border, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: c.surface }, summaryItem: { minHeight: 38, flexDirection: "row", alignItems: "flex-start", gap: 12 }, summaryName: { color: c.text, fontSize: 13.5, lineHeight: 17, fontWeight: "600" }, summarySub: { marginTop: 1, color: c.muted, fontSize: 12, lineHeight: 15 }, summaryPrice: { color: c.text, fontSize: 13.5, lineHeight: 17, fontWeight: "500" }, summaryDivider: { height: StyleSheet.hairlineWidth, marginVertical: 6, backgroundColor: c.border }, costRow: { minHeight: 21, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, costLabel: { color: c.muted, fontSize: 12.5, lineHeight: 17 }, costValue: { color: c.text, fontSize: 12.5, lineHeight: 17, fontWeight: "500" }, totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, totalLabel: { color: c.text, fontSize: 16, lineHeight: 21, fontWeight: "700" }, totalValue: { color: c.text, fontSize: 18, lineHeight: 23, fontWeight: "700" },
        paymentRow: { minHeight: 66, marginBottom: 8, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 11 }, paymentSelected: { borderColor: ORANGE }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: dark ? "#596273" : "#D0D5DD", alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: ORANGE }, radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE }, paymentTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 }, paymentTitle: { flexShrink: 1, color: c.text, fontSize: 14, lineHeight: 18, fontWeight: "600" }, paymentDescription: { marginTop: 2, color: c.muted, fontSize: 11.5, lineHeight: 15 }, badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: dark ? "#3A251C" : "#FFF1E7" }, badgeText: { color: ORANGE, fontSize: 10.5, lineHeight: 13, fontWeight: "500" },
        noteHeader: { marginTop: 9, marginBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, noteTitle: { color: c.text, fontSize: 16.5, lineHeight: 21, fontWeight: "700" }, optional: { color: c.muted, fontSize: 12.5, lineHeight: 17 }, noteShell: { minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6 }, noteInput: { minHeight: 38, padding: 0, color: c.text, fontSize: 13, lineHeight: 17 }, counter: { alignSelf: "flex-end", color: c.muted, fontSize: 11.5, lineHeight: 15 }, minimumWarning: { marginTop: 10, borderRadius: 12, padding: 11, backgroundColor: dark ? "#3A2A13" : "#FFF4E5", flexDirection: "row", alignItems: "flex-start", gap: 9 }, minimumText: { flex: 1, color: dark ? "#FFD18A" : "#8A4B08", fontSize: 12.5, lineHeight: 17, fontWeight: "500" }, quoteState: { marginTop: 10, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 9 }, quoteStateText: { flex: 1, color: c.muted, fontSize: 12.5, lineHeight: 17 }, quoteRetry: { color: ORANGE, fontSize: 13, fontWeight: "700" },
        footer: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: FOOTER_CONTENT_HEIGHT, paddingTop: 10, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, footerLabel: { color: c.text, fontSize: 12.5, lineHeight: 16, fontWeight: "500" }, footerAmount: { marginTop: 1, color: c.text, fontSize: 21, lineHeight: 25, fontWeight: "700" }, primaryButton: { width: "62%", height: 53, borderRadius: 17, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: ORANGE }, primaryDisabled: { backgroundColor: dark ? "#343942" : "#E4E7EC" }, buttonText: { color: "#FFFFFF", fontSize: 16, lineHeight: 20, fontWeight: "600", textAlign: "center" }, disabledText: { color: c.tertiary },
        modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2, 6, 23, 0.48)" }, modalDismiss: { flex: 1 }, addressSheet: { maxHeight: "72%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 10 }, modalHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: "center", marginBottom: 15 }, modalTitle: { color: c.text, fontSize: 21, lineHeight: 27, fontWeight: "700", marginBottom: 10 }, addressOption: { minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, addressOptionCopy: { flex: 1, paddingRight: 12 }, addressOptionTitle: { color: c.text, fontSize: 16, fontWeight: "600" }, addressOptionLine: { color: c.muted, marginTop: 3, fontSize: 13 }, emptyAddresses: { color: c.muted, fontSize: 15, paddingVertical: 24, textAlign: "center" }, manageAddressButton: { minHeight: 48, borderRadius: 14, backgroundColor: ORANGE, marginTop: 14, alignItems: "center", justifyContent: "center" }, manageAddressText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
        empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 }, emptyTitle: { color: c.text, fontSize: 23, fontWeight: "700" }, emptyButton: { minHeight: 48, borderRadius: 15, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", backgroundColor: ORANGE },
    });
};

export default CheckoutScreen;

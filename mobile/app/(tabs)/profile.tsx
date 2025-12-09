import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import "@/src/lib/i18n";
import useAuthStore from "@/store/auth.store";
import useServerResource from "@/lib/useServerResource";
import { getUserOrders, logout } from "@/lib/api";
import { router } from "expo-router";
import { Badge, SectionHeader } from "@/src/components/componentRegistry";
import { useDefaultAddress, type ManageAddressesNavigation } from "@/src/features/address/addressFeature";
import { images, illustrations, emojiSet } from "@/constants/mediaCatalog";
import GodzillaFishing from "@/assets/godzilla/VCTRLY-godzila-fishing-fish-beach-enjoy.svg";
import GodzillaCafe from "@/assets/godzilla/VCTRLY-godzila-cafe-coffee-tea-restaurant.svg";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import i18n from "@/src/lib/i18n";

const EMOJI_OPTIONS = Object.values(emojiSet);
const WINE_RED = "#7F021F";

const formatCurrency = (value?: number | string) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger"> = {
    preparing: "warning",
    ready: "success",
    canceled: "danger",
};

const Profile = () => {
    const navigation = useNavigation<ManageAddressesNavigation>();
    const { user, setIsAuthenticated, setUser, preferredEmoji, setPreferredEmoji } = useAuthStore();
    const { defaultAddress } = useDefaultAddress();
    const { data: orders } = useServerResource({ fn: getUserOrders, skipAlert: true });
    const [signingOut, setSigningOut] = useState(false);
    const [supportModalVisible, setSupportModalVisible] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [nameDraft, setNameDraft] = useState(user?.name ?? "");
    const [emailDraft, setEmailDraft] = useState(user?.email ?? "");
    const { t } = useTranslation();

    const initials = useMemo(
        () =>
            (user?.name || "Hungrie User")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
        [user?.name],
    );

    const activeOrders = (orders || []).filter((order: any) => order.status !== "delivered");
    const TrackingIllustration = illustrations.tracking;
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

    const handleManageAddressesPress = () => {
        const routeNames = navigation.getState?.()?.routeNames ?? [];
        if (routeNames.includes("ManageAddresses")) {
            navigation.navigate("ManageAddresses");
            return;
        }
        router.push("/ManageAddresses");
    };
    const addressLineOne = defaultAddress
        ? [defaultAddress.line1, defaultAddress.block].filter(Boolean).join(", ")
        : "";
    const addressLineTwo = defaultAddress
        ? [defaultAddress.room, defaultAddress.city, defaultAddress.country].filter(Boolean).join(", ")
        : "";

    useEffect(() => {
        setNameDraft(user?.name ?? "");
        setEmailDraft(user?.email ?? "");
    }, [user?.name, user?.email]);

    const handleSaveProfile = () => {
        const trimmedName = nameDraft.trim();
        const trimmedEmail = emailDraft.trim();
        if (!trimmedName || !trimmedEmail) {
            Alert.alert(t("profile.header.edit"), "Name and email are required.");
            return;
        }
        setUser({
            ...(user || { avatar: undefined }),
            name: trimmedName,
            email: trimmedEmail,
        });
        setIsEditingProfile(false);
    };

    const handleNotificationTest = async () => {
        try {
            const granted = await NotificationManager.requestPermissions();
            if (!granted) {
                Alert.alert(t("profileExtras.actions.notifications.label"), "Bildirim izni verilmedi.");
                return;
            }
            await NotificationManager.notifyLocal(t("profileExtras.actions.notifications.label"), "Test bildirimi gönderildi.");
        } catch (error: any) {
            Alert.alert("Bildirim gönderilemedi", error?.message || "Lütfen tekrar deneyin.");
        }
    };

    const handleLogout = async () => {
        try {
            setSigningOut(true);
            await logout();
        } catch (error: any) {
            Alert.alert("Unable to sign out", error?.message || "Please try again.");
        } finally {
            setSigningOut(false);
            setUser(null);
            setIsAuthenticated(false);
        }
    };

    const closeModal = () => setSelectedOrder(null);

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
                <View className="px-5 pt-6 gap-6">
                    <View className="secondary-card border-0 shadow-2xl gap-4" style={{ backgroundColor: WINE_RED }}>
                        <View className="flex-row items-center gap-4">
                            <TouchableOpacity
                                className="size-16 rounded-full bg-white/10 border border-white/40 items-center justify-center"
                                onPress={() => setEmojiPickerOpen(true)}
                            >
                                {preferredEmoji ? (
                                    <Image source={preferredEmoji} style={{ width: 30, height: 30 }} />
                                ) : (
                                    <Text className="h3-bold text-white">{initials}</Text>
                                )}
                            </TouchableOpacity>
                            <View className="flex-1">
                                <View className="flex-row items-center gap-2">
                                    <Text className="text-white text-2xl font-ezra-bold">{user?.name || "Hungrie Student"}</Text>
                                    {preferredEmoji ? (
                                        <Image source={preferredEmoji} style={{ width: 22, height: 22 }} />
                                    ) : null}
                                </View>
                                <Text className="body-medium text-white/70">{user?.email || "student@campus.edu"}</Text>
                            </View>
                        </View>
                        <View className="flex-row gap-3">
                            <TouchableOpacity className="hero-cta flex-1 items-center" onPress={() => setIsEditingProfile(true)}>
                                <Text className="text-white">{t("profile.header.edit")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="flex-1 px-5 py-3 rounded-full bg-white/10 border border-white/30 items-center"
                                disabled={signingOut}
                                onPress={handleLogout}
                            >
                                <Text className="paragraph-semibold text-white">
                                    {signingOut ? t("profile.header.signingOut") : t("profile.header.signOut")}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="secondary-card flex-row items-center gap-4 bg-white border border-[#FFE6C5]">
                        <Image source={images.deliveryReview} className="w-24 h-24 rounded-2xl" contentFit="cover" />
                        <View className="flex-1 gap-1">
                            <Text className="text-xs uppercase text-primary font-ezra-semibold">
                                {t("profileExtras.weekly.eyebrow")}
                            </Text>
                            <Text className="paragraph-semibold text-dark-100">{t("profileExtras.weekly.title")}</Text>
                            <Text className="body-medium text-dark-60">{t("profileExtras.weekly.subtitle")}</Text>
                            <TouchableOpacity className="chip self-start mt-1" onPress={() => router.push("/orders")}>
                                <Text className="paragraph-semibold text-primary-dark">{t("profileExtras.weekly.cta")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="secondary-card flex-row items-center gap-4 border-0" style={{ backgroundColor: WINE_RED }}>
                        <View className="flex-1 gap-2">
                            <Text className="text-xs uppercase text-white/70 font-ezra-semibold">
                                {t("profileExtras.delivery.eyebrow")}
                            </Text>
                            <Text className="text-white text-xl font-ezra-bold">{t("profileExtras.delivery.title")}</Text>
                            <Text className="body-medium text-white/80">{t("profileExtras.delivery.subtitle")}</Text>
                            <TouchableOpacity
                                className="self-start px-4 py-2 rounded-full bg-white/10"
                                onPress={handleManageAddressesPress}
                            >
                                <Text className="paragraph-semibold text-white">{t("profileExtras.delivery.cta")}</Text>
                            </TouchableOpacity>
                        </View>
                        <TrackingIllustration width={110} height={110} />
                    </View>

                    <View className="secondary-card gap-3">
                        <SectionHeader title={t("profile.defaultAddress")} />
                        {defaultAddress ? (
                            <View className="gap-1">
                                <Text className="paragraph-semibold text-dark-100">{defaultAddress.label}</Text>
                                {addressLineOne ? (
                                    <Text className="body-medium text-dark-60">{addressLineOne}</Text>
                                ) : null}
                                {addressLineTwo ? (
                                    <Text className="body-medium text-dark-60">{addressLineTwo}</Text>
                                ) : null}
                            </View>
                        ) : (
                            <Text className="body-medium text-dark-60">{t("profile.noAddress")}</Text>
                        )}
                        <TouchableOpacity
                            className="chip self-start mt-2"
                            onPress={handleManageAddressesPress}
                        >
                            <Text className="paragraph-semibold text-primary-dark">{t("profile.manageAddresses")}</Text>
                        </TouchableOpacity>
                    </View>

                    <Modal transparent visible={emojiPickerOpen} animationType="fade" onRequestClose={() => setEmojiPickerOpen(false)}>
                        <TouchableOpacity className="flex-1 bg-black/30" activeOpacity={1} onPress={() => setEmojiPickerOpen(false)} />
                        <View className="absolute left-0 right-0 bottom-0 bg-white rounded-t-[32px] p-5 gap-4 max-h-[55%]">
                            <View className="h-1 w-16 bg-gray-200 rounded-full self-center" />
                            <Text className="h4-bold text-dark-100">Emoji seç</Text>
                            <View className="max-h-[320px]">
                                <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
                                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                                        {EMOJI_OPTIONS.map((emojiSrc, index) => {
                                            const isActive = preferredEmoji === emojiSrc;
                                            return (
                                                <TouchableOpacity
                                                    key={index}
                                                    onPress={() => {
                                                        setPreferredEmoji(emojiSrc as any);
                                                        setEmojiPickerOpen(false);
                                                    }}
                                                    style={{
                                                        borderColor: isActive ? "#FE8C00" : "#E2E8F0",
                                                        backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF",
                                                    }}
                                                    className="w-16 h-16 rounded-2xl border items-center justify-center"
                                                >
                                                    <Image
                                                        source={emojiSrc}
                                                        style={{ width: 36, height: 36 }}
                                                        contentFit="contain"
                                                        cachePolicy="memory-disk"
                                                    />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>

                    <View className="secondary-card gap-3">
                        <SectionHeader title={t("profile.activeOrders")} />
                        {activeOrders.length ? (
                            activeOrders.map((order: any) => (
                                <TouchableOpacity
                                    key={order.id}
                                    className="p-3 rounded-2xl border border-gray-100 mb-2"
                                    onPress={() => setSelectedOrder(order)}
                                >
                                    <View className="flex-row items-center justify-between">
                                        <Text className="paragraph-semibold text-dark-100">
                                            {order.restaurant?.name || `Order #${order.id}`}
                                        </Text>
                                        <Badge
                                            label={t(`status.${order.status}` as const)}
                                            status={STATUS_VARIANT[order.status] || "warning"}
                                        />
                                    </View>
                                    <Text className="body-medium text-dark-60 mt-1">
                                        {`${formatCurrency(order.total)} - ${order.paymentMethod === "cash"
                                            ? t("profileExtras.payment.cash")
                                            : t("profileExtras.payment.card")
                                            }`}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text className="body-medium text-dark-60">{t("profile.noActiveOrders")}</Text>
                        )}
                    </View>

                    <View className="secondary-card gap-3">
                        <SectionHeader title={t("profile.accountActions")} />
                        {[
                            {
                                label: t("profileExtras.actions.notifications.label"),
                                description: t("profileExtras.actions.notifications.description"),
                                action: handleNotificationTest,
                            },
                            {
                                label: t("profileExtras.actions.help.label"),
                                description: t("profileExtras.actions.help.description"),
                                action: () => setSupportModalVisible(true),
                            },
                            {
                                label: t("profileExtras.actions.history.label"),
                                description: t("profileExtras.actions.history.description"),
                                action: () => router.push("/orders"),
                            },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.label}
                                className="profile-field"
                                onPress={item.action || (() => Alert.alert(t("profileExtras.actions.soonTitle"), item.label))}
                            >
                                <View className="profile-field__icon">
                                    <Text className="paragraph-semibold text-primary-dark">{item.label[0]}</Text>
                                </View>
                                <View className="flex-1">
                                    <Text className="paragraph-semibold text-dark-100">{item.label}</Text>
                                    <Text className="body-medium text-dark-60">{item.description}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity className="hero-cta mt-2 items-center" onPress={() => router.push("/restaurant/console")}>
                            <Text className="text-white">{t("profile.restaurantConsole")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="chip mt-2 bg-white border-primary" onPress={() => router.push("/restaurant/couriers")}>
                            <Text className="paragraph-semibold text-primary-dark">{t("profile.courierConsole")}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            <Modal transparent animationType="fade" visible={isEditingProfile} onRequestClose={() => setIsEditingProfile(false)}>
                <View className="flex-1 bg-black/40 justify-center px-5">
                    <View className="bg-white rounded-3xl overflow-hidden shadow-2xl">
                        <LinearGradient
                            colors={["#0B1220", "#0E1A36"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0.8 }}
                            style={{ padding: 20, flexDirection: "row", alignItems: "center", gap: 12 }}
                        >
                            <View className="flex-1 gap-1">
                                <Text className="text-white/60 tracking-[5px] uppercase text-[11px]">
                                    {t("profile.header.edit")}
                                </Text>
                                <Text className="text-white text-2xl font-ezra-bold leading-7">
                                    {t("profileExtras.editModal.title")}
                                </Text>
                                <Text className="body-medium text-white/75">{t("profileExtras.editModal.subtitle")}</Text>
                            </View>
                            <GodzillaFishing width={120} height={120} />
                        </LinearGradient>

                        <View className="p-5 gap-4 bg-white">
                            <View className="gap-2">
                                <Text className="paragraph-semibold text-dark-80">{t("profileExtras.editModal.name")}</Text>
                                <TextInput
                                    value={nameDraft}
                                    onChangeText={setNameDraft}
                                    placeholder={t("profileExtras.editModal.namePlaceholder")}
                                    placeholderTextColor="#94A3B8"
                                    className="rounded-2xl border border-gray-200 px-4 py-3 text-dark-100"
                                />
                            </View>
                            <View className="gap-2">
                                <Text className="paragraph-semibold text-dark-80">{t("profileExtras.editModal.email")}</Text>
                                <TextInput
                                    value={emailDraft}
                                    onChangeText={setEmailDraft}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    placeholder={t("profileExtras.editModal.emailPlaceholder")}
                                    placeholderTextColor="#94A3B8"
                                    className="rounded-2xl border border-gray-200 px-4 py-3 text-dark-100"
                                />
                            </View>
                            <View className="flex-row gap-3 mt-2">
                                <TouchableOpacity
                                    className="flex-1 rounded-full border border-gray-200 py-3 items-center"
                                    onPress={() => setIsEditingProfile(false)}
                                >
                                    <Text className="paragraph-semibold text-dark-60">{t("profileExtras.editModal.cancel")}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className="flex-1 rounded-full bg-primary py-3 items-center"
                                    onPress={handleSaveProfile}
                                >
                                    <Text className="paragraph-semibold text-white">{t("profileExtras.editModal.save")}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {selectedOrder && (
                <Modal animationType="slide" transparent visible onRequestClose={closeModal}>
                    <View className="flex-1 bg-black/40 justify-center px-6">
                        <View className="bg-white rounded-3xl p-5 gap-4">
                            <Text className="text-xl font-ezra-bold text-dark-100">{t("profile.modal.title")}</Text>
                            <View className="flex-row justify-between items-center">
                                <Text className="paragraph-semibold text-dark-60">{t("profile.modal.status")}</Text>
                                <Badge
                                    label={t(`status.${selectedOrder.status}` as const)}
                                    status={STATUS_VARIANT[selectedOrder.status] || "warning"}
                                />
                            </View>
                            <View className="flex-row justify-between">
                                <Text className="paragraph-semibold text-dark-60">{t("profile.modal.eta")}</Text>
                                <Text className="paragraph-semibold text-dark-100">{selectedOrder.eta ?? 25} min</Text>
                            </View>
                            <View className="flex-row justify-between">
                                <Text className="paragraph-semibold text-dark-60">{t("profile.modal.total")}</Text>
                                <Text className="h3-bold text-dark-100">{formatCurrency(selectedOrder.total)}</Text>
                            </View>
                            <View>
                                <Text className="paragraph-semibold text-dark-80 mb-1">
                                    {selectedOrder.restaurant?.name || `Order #${selectedOrder.id}`}
                                </Text>
                                <Text className="body-medium text-dark-60">{selectedOrder.address || "Campus pickup"}</Text>
                            </View>
                            <TouchableOpacity className="custom-btn" onPress={closeModal}>
                                <Text className="paragraph-semibold text-white">{t("profile.modal.close")}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
            <Modal transparent visible={supportModalVisible} animationType="fade" onRequestClose={() => setSupportModalVisible(false)}>
                <TouchableOpacity className="flex-1 bg-black/30" activeOpacity={1} onPress={() => setSupportModalVisible(false)} />
                <View className="absolute left-0 right-0 bottom-0 bg-white rounded-t-[32px] p-5 gap-4">
                    <View className="h-1 w-16 bg-gray-200 rounded-full self-center" />
                    <View className="flex-row items-center gap-3">
                        <GodzillaCafe width={64} height={64} />
                        <View className="flex-1">
                            <Text className="text-xl font-ezra-bold text-dark-100">
                                {i18n.language.startsWith("tr") ? "Çok yakında" : "Coming soon"}
                            </Text>
                            <Text className="body-medium text-dark-60">
                                {i18n.language.startsWith("tr")
                                    ? "Destek merkezi burada açılacak. Şimdilik sohbeti kapalı tuttuk ama yakında açacağız :)"
                                    : "Support center will open here soon. Chat is disabled for now, but we are going to open it soon."}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        className="chip bg-primary/10 self-start"
                        onPress={() => setSupportModalVisible(false)}
                    >
                        <Text className="paragraph-semibold text-primary-dark">
                            {i18n.language.startsWith("tr") ? "Kapat" : "Close"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default Profile;


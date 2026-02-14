import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import "@/src/lib/i18n";

import useAuthStore from "@/store/auth.store";
import { logout } from "@/lib/api";
import { router, useRouter } from "expo-router";

import { SectionHeader } from "@/src/components/componentRegistry";
import { useDefaultAddress, type ManageAddressesNavigation } from "@/src/features/address/addressFeature";

import { images, illustrations, emojiSet } from "@/constants/mediaCatalog";

import { subscribeUserOrders } from "@/src/services/firebaseOrders";
import { storage } from "@/src/lib/storage";
import { useTheme } from "@/src/theme/themeContext";

import { OrderStatus } from "@/type";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/components/OrderCard";
import { makeShadow } from "@/src/lib/shadowStyle";
import { updateUserProfile } from "@/lib/firebaseAuth";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { seedRestaurants } from "@/lib/restaurantSeeds";

const EMOJI_OPTIONS = Object.values(emojiSet);
const WINE_RED = "#7F021F";
const ORANGE = "#FE8C00";
const normalizeId = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const restaurantNamesById = seedRestaurants.reduce<Record<string, string>>((acc, restaurant: any) => {
    const id = normalizeId(restaurant?.id);
    if (!id) return acc;
    acc[id] = restaurant?.name || id;
    return acc;
}, {});
const resolveRestaurantName = (order: any) =>
    order?.restaurant?.name ||
    order?.restaurantName ||
    restaurantNamesById[normalizeId(order?.restaurantId)] ||
    "Restaurant";
const ui = StyleSheet.create({
    pageContent: {
        paddingHorizontal: 20,
        rowGap: 24,
    },
    card: {
        borderRadius: 24,
        padding: 16,
    },
    heroRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 16,
    },
    avatarButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.4)",
        backgroundColor: "rgba(255,255,255,0.1)",
        alignItems: "center",
        justifyContent: "center",
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
    },
    userName: {
        color: "#FFFFFF",
        fontSize: 30,
        fontFamily: "ChairoSans",
    },
    userEmail: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 14,
        marginTop: 2,
        fontFamily: "ChairoSans",
    },
    heroActions: {
        flexDirection: "row",
        columnGap: 12,
    },
    primaryCta: {
        flex: 1,
        borderRadius: 999,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: "#0F172A",
        alignItems: "center",
    },
    secondaryCta: {
        flex: 1,
        borderRadius: 999,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
        backgroundColor: "rgba(255,255,255,0.1)",
        alignItems: "center",
    },
    ctaText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontFamily: "ChairoSans",
    },
    addressTitle: {
        color: "#FFFFFF",
        fontSize: 30,
        fontFamily: "ChairoSans",
        lineHeight: 34,
    },
    addressText: {
        color: "rgba(255,255,255,0.82)",
        fontSize: 16,
        fontFamily: "ChairoSans",
    },
    addressMeta: {
        color: "rgba(255,255,255,0.82)",
        fontSize: 14,
        fontFamily: "ChairoSans",
    },
    manageAddressBtn: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: "rgba(255,255,255,0.15)",
    },
    actionsCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    sectionCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    orderItemCard: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        backgroundColor: "#FFFFFF",
    },
    rowBetween: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    accountRow: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 8,
        columnGap: 10,
    },
    accountIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: "#FFF1E7",
        alignItems: "center",
        justifyContent: "center",
    },
    accountLabel: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#0F172A",
    },
    accountDesc: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#334155",
        marginTop: 2,
    },
    accountInitial: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: "#E56E00",
    },
    editModalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        paddingHorizontal: 20,
    },
    editModalCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        overflow: "hidden",
    },
    editModalBody: {
        padding: 20,
        rowGap: 16,
        backgroundColor: "#FFFFFF",
    },
    editFieldLabel: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#1E293B",
    },
    editFieldInput: {
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 16,
        backgroundColor: "#FFFFFF",
    },
    editActionsRow: {
        flexDirection: "row",
        columnGap: 12,
        marginTop: 8,
    },
    editCancelBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        backgroundColor: "#FFFFFF",
    },
    editSaveBtn: {
        flex: 1,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        backgroundColor: "#FE8C00",
    },
    editCancelText: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#334155",
    },
    editSaveText: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        color: "#FFFFFF",
    },
    editHeaderKicker: {
        color: "rgba(255,255,255,0.65)",
        letterSpacing: 5,
        textTransform: "uppercase",
        fontSize: 11,
        fontFamily: "ChairoSans",
    },
    editHeaderTitle: {
        color: "#FFFFFF",
        fontSize: 22,
        lineHeight: 28,
        fontFamily: "ChairoSans",
    },
    editHeaderSubtitle: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 14,
        lineHeight: 20,
        fontFamily: "ChairoSans",
    },
    editHeaderImageWrap: {
        width: 110,
        height: 110,
        alignItems: "center",
        justifyContent: "center",
    },
});

const formatCurrency = (value?: number | string) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "TRY 0.00";
    return `TRY ${amount.toFixed(2)}`;
};

const normalizeStatus = (status?: string): OrderStatus => {
    if (!status) return "pending";
    if (status === "accepted") return "preparing";
    if (status === "rejected") return "canceled";
    if (["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(status)) {
        return status as OrderStatus;
    }
    return "pending";
};

type OrderSummaryItem = {
    name: string;
    quantity: number;
};

const Profile = () => {
    const navigation = useNavigation<ManageAddressesNavigation>();
    const { user, setIsAuthenticated, setUser, preferredEmoji, setPreferredEmoji } = useAuthStore();
    const { defaultAddress } = useDefaultAddress();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const safeTop = Math.max(insets.top, 12);

    const [orders, setOrders] = useState<any[]>([]);
    const [signingOut, setSigningOut] = useState(false);

    const [notifModalVisible, setNotifModalVisible] = useState(false);

    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);

    const [nameDraft, setNameDraft] = useState(user?.name ?? "");
    const [emailDraft, setEmailDraft] = useState(user?.email ?? "");
    const [whatsappDraft, setWhatsappDraft] = useState(user?.whatsappNumber ?? "");

    const TrackingIllustration = illustrations.tracking;
    const EditHeaderIllustration = illustrations.courierHero || illustrations.foodieCelebration || illustrations.tracking;

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

    const activeOrders = useMemo(() => {
        return (orders || []).filter((o: any) => {
            const s = normalizeStatus(o?.status);
            return s !== "delivered" && s !== "canceled";
        });
    }, [orders]);

    const handleManageAddressesPress = () => {
        const routeNames = navigation.getState?.()?.routeNames ?? [];
        if (routeNames.includes("ManageAddresses")) {
            navigation.navigate("ManageAddresses");
            return;
        }
        router.push("/ManageAddresses");
    };

    const addressLineOne = defaultAddress ? [defaultAddress.line1, defaultAddress.block].filter(Boolean).join(", ") : "";
    const addressLineTwo = defaultAddress
        ? [defaultAddress.room, defaultAddress.city, defaultAddress.country].filter(Boolean).join(", ")
        : "";

    useEffect(() => {
        setNameDraft(user?.name ?? "");
        setEmailDraft(user?.email ?? "");
        setWhatsappDraft(user?.whatsappNumber ?? "");
    }, [user?.name, user?.email, user?.whatsappNumber]);

    useEffect(() => {
        const userId = user?.id ?? user?.$id ?? user?.accountId ?? null;
        if (!userId) return;

        const unsubscribe = subscribeUserOrders(userId, (list) => setOrders(list || []));
        return () => {
            try {
                unsubscribe && unsubscribe();
            } catch {
                /* noop */
            }
        };
    }, [user?.id, user?.$id, user?.accountId]);

    const handleSaveProfile = async () => {
        const trimmedName = nameDraft.trim();
        const trimmedWhatsapp = whatsappDraft.trim();

        if (!trimmedName) {
            Alert.alert(t("profile.header.edit"), "Name is required.");
            return;
        }

        try {
            setSavingProfile(true);

            const synced = await updateUserProfile({
                name: trimmedName,
                whatsappNumber: trimmedWhatsapp || undefined,
            });

            setUser({
                ...(user || { avatar: undefined }),
                name: synced?.name ?? trimmedName,
                email: synced?.email ?? user?.email,
                whatsappNumber: (synced?.whatsappNumber ?? trimmedWhatsapp) || undefined,
            });

            setIsEditingProfile(false);
        } catch (error: any) {
            Alert.alert(t("profile.header.edit"), error?.message || "Unable to update profile right now.");
        } finally {
            setSavingProfile(false);
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
            router.replace("/sign-in");
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={["left", "right", "bottom"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160, paddingTop: safeTop }}>
                <View className="px-5 gap-6" style={ui.pageContent}>
                    {/* HERO */}
                    <View className="secondary-card border-0 shadow-2xl gap-4" style={[ui.card, { backgroundColor: WINE_RED, rowGap: 16 }]}>
                        <View className="flex-row items-center gap-4" style={ui.heroRow}>
                            <TouchableOpacity
                                className="size-16 rounded-full bg-white/10 border border-white/40 items-center justify-center"
                                style={ui.avatarButton}
                                onPress={() => setEmojiPickerOpen(true)}
                            >
                                {preferredEmoji ? (
                                    <Image source={preferredEmoji} style={{ width: 30, height: 30 }} />
                                ) : (
                                    <Text className="h3-bold text-white">{initials}</Text>
                                )}
                            </TouchableOpacity>

                            <View className="flex-1">
                                <View className="flex-row items-center gap-2" style={ui.nameRow}>
                                    <Text className="text-white text-2xl font-ezra-bold" style={ui.userName}>{user?.name || "Hungrie Student"}</Text>
                                    {preferredEmoji ? <Image source={preferredEmoji} style={{ width: 22, height: 22 }} /> : null}
                                </View>
                                <Text className="body-medium text-white/70" style={ui.userEmail}>{user?.email || "student@campus.edu"}</Text>
                            </View>
                        </View>

                        <View className="flex-row gap-3" style={ui.heroActions}>
                            <TouchableOpacity style={ui.primaryCta} onPress={() => setIsEditingProfile(true)}>
                                <Text className="text-white" style={ui.ctaText}>{t("profile.header.edit")}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className="flex-1 px-5 py-3 rounded-full bg-white/10 border border-white/30 items-center"
                                style={ui.secondaryCta}
                                disabled={signingOut}
                                onPress={handleLogout}
                            >
                                <Text className="paragraph-semibold text-white" style={ui.ctaText}>
                                    {signingOut ? t("profile.header.signingOut") : t("profile.header.signOut")}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ADDRESS — design (orange) + database defaultAddress */}
                    <View className="secondary-card gap-3" style={[ui.card, { backgroundColor: ORANGE, rowGap: 12 }]}>
                        <View className="flex-row items-start gap-4">
                            <View className="flex-1 gap-3">
                                <Text className="text-white text-2xl font-ezra-bold" style={ui.addressTitle}>{t("profile.defaultAddress")}</Text>
                                {defaultAddress ? (
                                    <View className="gap-1">
                                        <Text className="paragraph-semibold text-white" style={ui.addressText}>{defaultAddress.label}</Text>
                                        {addressLineOne ? <Text className="body-medium text-white/80" style={ui.addressMeta}>{addressLineOne}</Text> : null}
                                        {addressLineTwo ? <Text className="body-medium text-white/80" style={ui.addressMeta}>{addressLineTwo}</Text> : null}
                                    </View>
                                ) : (
                                    <Text className="body-medium text-white/80" style={ui.addressMeta}>{t("profile.noAddress")}</Text>
                                )}

                                <TouchableOpacity
                                    className="self-start px-4 py-2 rounded-full bg-white/15"
                                    style={ui.manageAddressBtn}
                                    onPress={handleManageAddressesPress}
                                >
                                    <Text className="paragraph-semibold text-white" style={ui.ctaText}>{t("profile.manageAddresses")}</Text>
                                </TouchableOpacity>
                            </View>

                            <TrackingIllustration width={110} height={110} />
                        </View>
                    </View>

                    {/* ACTIVE ORDERS — keep database behaviour, keep clean UI */}
                    <View className="secondary-card gap-4" style={ui.sectionCard}>
                        <View className="flex-row items-center justify-between" style={ui.rowBetween}>
                            <SectionHeader title={t("profile.activeOrders")} />
                            {illustrations.courierHero ? <illustrations.courierHero width={56} height={56} /> : null}
                        </View>

                        {activeOrders.length ? (
                            <View className="gap-3">
                                {activeOrders.map((order: any) => {
                                    const norm = normalizeStatus(order.status);
                                    const badge = ORDER_STATUS_COLORS[norm];
                                    const label = ORDER_STATUS_LABELS[norm] || t(`status.${norm}` as const);

                                    return (
                                        <TouchableOpacity
                                            key={order.id}
                                            className="p-4 rounded-3xl border border-[#F1F5F9] bg-white"
                                            onPress={() =>
                                                router.push({
                                                    pathname: "/order/pending",
                                                    params: {
                                                        orderId: order.id,
                                                        restaurantName: resolveRestaurantName(order),
                                                        eta: String(order.eta || order.etaMinutes || 120),
                                                    },
                                                })
                                            }
                                            style={[
                                                ui.orderItemCard,
                                                makeShadow({
                                                    color: "#0F172A",
                                                    offsetY: 6,
                                                    blurRadius: 12,
                                                    opacity: 0.04,
                                                    elevation: 2,
                                                }),
                                            ]}
                                        >
                                            <View className="flex-row items-center justify-between" style={ui.rowBetween}>
                                                <View>
                                                    <Text className="paragraph-semibold text-dark-100">
                                                        {order.restaurant?.name || `Order #${order.id}`}
                                                    </Text>
                                                    <Text className="body-medium text-dark-60 mt-1">
                                                        {`${formatCurrency(order.total)} - ${order.paymentMethod === "cash"
                                                                ? t("profileExtras.payment.cash")
                                                                : t("profileExtras.payment.card")
                                                            }`}
                                                    </Text>
                                                </View>

                                                <View className="px-3 py-1 rounded-full flex-row items-center gap-2" style={{ backgroundColor: badge.bg }}>
                                                    <View className="size-2 rounded-full" style={{ backgroundColor: badge.dot }} />
                                                    <Text className="paragraph-semibold" style={{ color: badge.text }}>
                                                        {label}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <Text className="body-medium text-dark-60">{t("profile.noActiveOrders")}</Text>
                        )}
                    </View>

                    <OrderHistorySection orders={orders} />

                    {/* ACTIONS — design version */}
                    <View className="secondary-card gap-3" style={ui.actionsCard}>
                        <SectionHeader title={t("profile.accountActions")} />
                        {[
                            {
                                label: t("profileExtras.actions.notifications.label"),
                                description: t("profileExtras.actions.notifications.description"),
                                action: () => setNotifModalVisible(true),
                            },
                            {
                                label: t("profileExtras.actions.privacy.label"),
                                description: t("profileExtras.actions.privacy.description"),
                                action: () => router.push("/privacy"),
                            },
                            {
                                label: t("profileExtras.actions.terms.label"),
                                description: t("profileExtras.actions.terms.description"),
                                action: () => router.push("/terms"),
                            },
                            {
                                label: t("profileExtras.actions.history.label"),
                                description: t("profileExtras.actions.history.description"),
                                action: () => router.push("/orders"),
                            },
                        ].map((item) => (
                            <TouchableOpacity key={item.label} className="profile-field" style={ui.accountRow} onPress={item.action}>
                                <View className="profile-field__icon" style={ui.accountIcon}>
                                    <Text className="paragraph-semibold text-primary-dark" style={ui.accountInitial}>{item.label[0]}</Text>
                                </View>
                                <View className="flex-1">
                                    <Text className="paragraph-semibold text-dark-100" style={ui.accountLabel}>{item.label}</Text>
                                    <Text className="body-medium text-dark-60" style={ui.accountDesc}>{item.description}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>

            {/* EMOJI PICKER */}
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
                                                borderColor: isActive ? ORANGE : "#E2E8F0",
                                                backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF",
                                            }}
                                            className="w-16 h-16 rounded-2xl border items-center justify-center"
                                        >
                                            <Image source={emojiSrc} style={{ width: 36, height: 36 }} contentFit="contain" cachePolicy="memory-disk" />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* EDIT PROFILE — database (updateUserProfile + whatsapp), design modal */}
            <Modal transparent animationType="fade" visible={isEditingProfile} onRequestClose={() => setIsEditingProfile(false)}>
                <View className="flex-1 bg-black/40 justify-center px-5" style={ui.editModalOverlay}>
                    <View className="bg-white rounded-3xl overflow-hidden shadow-2xl" style={ui.editModalCard}>
                        <LinearGradient
                            colors={["#0B1220", "#0E1A36"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0.8 }}
                            style={{ padding: 20, flexDirection: "row", alignItems: "center", gap: 12 }}
                        >
                            <View className="flex-1 gap-1">
                                <Text className="text-white/60 tracking-[5px] uppercase text-[11px]" style={ui.editHeaderKicker}>
                                    {t("profile.header.edit")}
                                </Text>
                                <Text className="text-white text-2xl font-ezra-bold leading-7" style={ui.editHeaderTitle}>
                                    {t("profileExtras.editModal.title")}
                                </Text>
                                <Text className="body-medium text-white/75" style={ui.editHeaderSubtitle}>
                                    {t("profileExtras.editModal.subtitle")}
                                </Text>
                            </View>
                            {EditHeaderIllustration ? (
                                <View style={ui.editHeaderImageWrap}>
                                    <EditHeaderIllustration width={96} height={96} />
                                </View>
                            ) : null}
                        </LinearGradient>

                        <View className="p-5 gap-4 bg-white" style={ui.editModalBody}>
                            <View className="gap-2">
                                <Text className="paragraph-semibold text-dark-80" style={ui.editFieldLabel}>{t("profileExtras.editModal.name")}</Text>
                                <TextInput
                                    value={nameDraft}
                                    onChangeText={setNameDraft}
                                    placeholder={t("profileExtras.editModal.namePlaceholder")}
                                    placeholderTextColor="#94A3B8"
                                    className="rounded-2xl border border-gray-200 px-4 py-3 text-dark-100"
                                    style={ui.editFieldInput}
                                />
                            </View>

                            <View className="gap-2">
                                <Text className="paragraph-semibold text-dark-80" style={ui.editFieldLabel}>{t("profileExtras.editModal.email")}</Text>
                                <TextInput
                                    value={emailDraft}
                                    editable={false}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    placeholder={t("profileExtras.editModal.emailPlaceholder")}
                                    placeholderTextColor="#94A3B8"
                                    className="rounded-2xl border border-gray-200 px-4 py-3 text-dark-100"
                                    style={[ui.editFieldInput, { backgroundColor: "#F8FAFC" }]}
                                />
                            </View>

                            <View className="gap-2">
                                <Text className="paragraph-semibold text-dark-80" style={ui.editFieldLabel}>
                                    {t("profileExtras.editModal.whatsapp", "WhatsApp")}
                                </Text>
                                <TextInput
                                    value={whatsappDraft}
                                    onChangeText={setWhatsappDraft}
                                    keyboardType="phone-pad"
                                    placeholder={t("profileExtras.editModal.whatsappPlaceholder", "Enter WhatsApp number")}
                                    placeholderTextColor="#94A3B8"
                                    className="rounded-2xl border border-gray-200 px-4 py-3 text-dark-100"
                                    style={ui.editFieldInput}
                                />
                            </View>

                            <View className="flex-row gap-3 mt-2" style={ui.editActionsRow}>
                                <TouchableOpacity
                                    style={ui.editCancelBtn}
                                    onPress={() => setIsEditingProfile(false)}
                                >
                                    <Text className="paragraph-semibold text-dark-60" style={ui.editCancelText}>
                                        {t("profileExtras.editModal.cancel")}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[ui.editSaveBtn, { opacity: savingProfile ? 0.7 : 1 }]}
                                    onPress={handleSaveProfile}
                                    disabled={savingProfile}
                                >
                                    <Text className="paragraph-semibold text-white" style={ui.editSaveText}>
                                        {savingProfile ? t("profile.header.saving", "Saving...") : t("profileExtras.editModal.save")}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            <NotificationPreferencesModal visible={notifModalVisible} onClose={() => setNotifModalVisible(false)} />
        </SafeAreaView>
    );
};

/* -------------------------------------------------------------------------- */
/* Notifications Prefs Modal */
/* -------------------------------------------------------------------------- */

type NotificationPrefs = {
    announcements: boolean;
    orderStatus: boolean;
    messages: boolean;
    reviewReplies: boolean;
};

const NOTIF_PREFS_KEY = "hungrie_notification_prefs_v1";
const defaultPrefs: NotificationPrefs = {
    announcements: true,
    orderStatus: true,
    messages: true,
    reviewReplies: true,
};
const notificationUi = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        justifyContent: "flex-end",
    },
    dismissArea: {
        flex: 1,
    },
    sheet: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 24,
        rowGap: 20,
    },
    dragHandle: {
        height: 4,
        width: 64,
        borderRadius: 999,
        backgroundColor: "#E5E7EB",
        alignSelf: "center",
    },
    heroRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
    heroImage: {
        width: 56,
        height: 56,
        borderRadius: 16,
    },
    title: {
        fontSize: 22,
        lineHeight: 28,
        color: "#111827",
        fontFamily: "ChairoSans-Bold",
    },
    subtitle: {
        marginTop: 2,
        fontSize: 14,
        lineHeight: 20,
        color: "#6B7280",
        fontFamily: "ChairoSans",
    },
    permissionError: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 16,
        color: "#EF4444",
        fontFamily: "ChairoSans",
    },
    permissionHint: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 16,
        color: "#94A3B8",
        fontFamily: "ChairoSans",
    },
    rows: {
        rowGap: 8,
    },
    rowButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    rowLabel: {
        flex: 1,
        paddingRight: 12,
        fontSize: 16,
        lineHeight: 22,
        color: "#111827",
        fontFamily: "ChairoSans-SemiBold",
    },
    toggleTrack: {
        width: 50,
        height: 30,
        borderRadius: 999,
        padding: 4,
        justifyContent: "center",
    },
    toggleThumb: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#FFFFFF",
    },
    saveButton: {
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    saveButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        lineHeight: 22,
        fontFamily: "ChairoSans-SemiBold",
    },
});

const NotificationPreferencesModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
    const [loading, setLoading] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

    useEffect(() => {
        if (!visible) return;
        const loadPrefs = async () => {
            const saved = await storage.getItem(NOTIF_PREFS_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved) as NotificationPrefs;
                    setPrefs({ ...defaultPrefs, ...parsed });
                } catch {
                    setPrefs(defaultPrefs);
                }
            } else {
                setPrefs(defaultPrefs);
            }
        };
        void loadPrefs();
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        const request = async () => {
            const granted = await NotificationManager.requestPermissions();
            setPermissionGranted(granted);
        };
        void request();
    }, [visible]);

    const toggle = (key: keyof NotificationPrefs) => {
        setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setLoading(true);
        await storage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
        setLoading(false);
        onClose();
    };

    const rows: Array<{ key: keyof NotificationPrefs; label: string }> = [
        { key: "announcements", label: t("cart.screen.notifications.announcements") },
        { key: "orderStatus", label: t("cart.screen.notifications.orderStatus") },
        { key: "messages", label: t("cart.screen.notifications.messages") },
        { key: "reviewReplies", label: t("cart.screen.notifications.reviewReplies") },
    ];

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View style={notificationUi.backdrop}>
                <Pressable style={notificationUi.dismissArea} onPress={onClose} />
                <View style={notificationUi.sheet}>
                    <View style={notificationUi.dragHandle} />

                    <View style={notificationUi.heroRow}>
                        <Image source={images.deliveryReview} style={notificationUi.heroImage} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                            <Text style={notificationUi.title}>{t("cart.screen.notifications.title")}</Text>
                            <Text style={notificationUi.subtitle}>{t("cart.screen.notifications.subtitle")}</Text>

                            {permissionGranted === false ? (
                                <Text style={notificationUi.permissionError}>{t("cart.screen.notifications.permissionDenied")}</Text>
                            ) : null}
                            {permissionGranted === null ? (
                                <Text style={notificationUi.permissionHint}>{t("cart.screen.notifications.permissionNeeded")}</Text>
                            ) : null}
                        </View>
                    </View>

                    <View style={notificationUi.rows}>
                        {rows.map((row) => (
                            <TouchableOpacity key={row.key} style={notificationUi.rowButton} onPress={() => toggle(row.key)}>
                                <Text style={notificationUi.rowLabel}>{row.label}</Text>

                                <View
                                    style={[
                                        notificationUi.toggleTrack,
                                        {
                                            backgroundColor: prefs[row.key] ? theme.colors.primary : "#E2E8F0",
                                            alignItems: prefs[row.key] ? "flex-end" : "flex-start",
                                        },
                                    ]}
                                >
                                    <View style={notificationUi.toggleThumb} />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[notificationUi.saveButton, { opacity: loading ? 0.7 : 1 }]}
                        disabled={loading}
                        onPress={handleSave}
                    >
                        <Text style={notificationUi.saveButtonText}>
                            {loading ? t("cart.screen.notifications.saving") : t("cart.screen.notifications.save")}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

/* -------------------------------------------------------------------------- */
/* Order History Section (robust timestamps + status colors) */
/* -------------------------------------------------------------------------- */

const OrderHistorySection = ({ orders }: { orders: any[] }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const HistoryIllustration = illustrations.foodieCelebration;

    const formatTimestamp = (value: any) => {
        if (!value) return "";
        if (typeof value === "string" || typeof value === "number") {
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
        }
        if (typeof value === "object" && "seconds" in value) {
            const millis = value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
            return new Date(millis).toLocaleString();
        }
        return String(value);
    };

    const getMillis = (value: any) => {
        if (!value) return 0;
        if (typeof value === "object" && "seconds" in value) {
            return value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
        }
        const d = new Date(value);
        const ms = d.getTime();
        return Number.isNaN(ms) ? 0 : ms;
    };

    const resolveItems = (order: any): OrderSummaryItem[] => {
        const rawItems = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
        return rawItems.map((item: any) => ({
            name: item?.name ?? "-",
            quantity: Number(item?.quantity ?? 1),
        }));
    };

    const sortedOrders = useMemo(() => {
        return (orders || [])
            .sort((a, b) => {
                const da = getMillis(a.updatedAt || a.createdAt || 0);
                const db = getMillis(b.updatedAt || b.createdAt || 0);
                return db - da;
            });
    }, [orders]);
    const recentOrders = useMemo(() => sortedOrders.slice(0, 2), [sortedOrders]);

    return (
        <View className="secondary-card gap-4" style={ui.sectionCard}>
            <View className="flex-row items-center justify-between" style={ui.rowBetween}>
                <SectionHeader title={t("orders.historyTitle", "Sipariş Geçmişi")} />
                <HistoryIllustration width={52} height={52} />
            </View>

            <View className="gap-3">
                {recentOrders.map((order) => {
                    const normStatus = normalizeStatus(order.status);
                    const badge = ORDER_STATUS_COLORS[normStatus];
                    const label = ORDER_STATUS_LABELS[normStatus] || t(`status.${normStatus}` as const);
                    const orderIdText = `#${String(order.id ?? "-")}`;

                    const items = resolveItems(order);
                    const summary = items.length ? items.map((it) => `${it.quantity}x ${it.name}`).join(" • ") : null;

                    return (
                        <View
                            key={order.id}
                            className="bg-white rounded-3xl border border-gray-100 p-4"
                            style={[
                                ui.orderItemCard,
                                makeShadow({ color: "#0F172A", offsetY: 6, blurRadius: 12, opacity: 0.05, elevation: 3 }),
                            ]}
                        >
                            <View className="flex-row justify-between items-center" style={ui.rowBetween}>
                                <View style={{ flex: 1, paddingRight: 10 }}>
                                    <Text className="paragraph-semibold text-dark-100">
                                        {resolveRestaurantName(order) || t("orders.unknownRestaurant", "Restaurant")}
                                    </Text>
                                    <Text className="caption text-dark-40 mt-1">Order ID: {orderIdText}</Text>
                                </View>

                                <View className="px-3 py-1 rounded-full flex-row items-center gap-2" style={{ backgroundColor: badge.bg }}>
                                    <View className="size-2 rounded-full" style={{ backgroundColor: badge.dot }} />
                                    <Text className="paragraph-semibold" style={{ color: badge.text }}>
                                        {label}
                                    </Text>
                                </View>
                            </View>

                            <Text className="caption text-dark-40 mt-1">{formatTimestamp(order.updatedAt || order.createdAt)}</Text>

                            {summary ? <Text className="body-medium text-dark-80 mt-2">{summary}</Text> : null}

                            <View className="flex-row items-center justify-between mt-3">
                                <View>
                                    <Text className="caption text-dark-40">{t("cart.screen.summary.total")}</Text>
                                    <Text className="h3-bold text-dark-100">{formatCurrency(order.total)}</Text>
                                </View>

                                <Text className="paragraph-semibold" style={{ color: badge.text }}>
                                    {label}
                                </Text>
                            </View>
                        </View>
                    );
                })}

                {!sortedOrders.length ? (
                    <Text className="body-medium text-dark-60">{t("orders.emptyHistory", "Hiç sipariş bulunamadı.")}</Text>
                ) : null}
                {sortedOrders.length > 2 ? (
                    <TouchableOpacity
                        onPress={() => router.push("/orders")}
                        style={{
                            marginTop: 4,
                            alignSelf: "center",
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            backgroundColor: "#FFFFFF",
                        }}
                    >
                        <Text className="paragraph-semibold text-primary">
                            {t("orders.viewAll", "Tüm siparişleri gör")}
                        </Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
};

export default Profile;

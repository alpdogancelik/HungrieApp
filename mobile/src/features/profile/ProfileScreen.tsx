import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { DimensionValue } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import LanguageToggle from "@/components/LanguageToggle";
import { getRestaurantImageSource } from "@/lib/assets";
import { seedMenuByRestaurantId, seedRestaurants } from "@/lib/restaurantSeeds";
import { checkCurrentAdminAuthorization } from "@/src/features/auth/adminAuthorization";
import { formatPanelCurrency } from "@/src/features/restaurantPanel/panelLocale";
import { isCancelledStatus, isReviewableStatus } from "@/src/features/reviews/reviewUtils";
import { useTheme } from "@/src/theme/themeContext";
import { NotificationPreferencesModal } from "./NotificationPreferencesModal";
import { useProfile } from "./useProfile";

const ORANGE = "#FF5A00";
const DANGER = "#E52521";
const BOTTOM_NAV_CONTENT_HEIGHT = Platform.OS === "android" ? 74 : 70;
const BOTTOM_CONTENT_CLEARANCE = 22;
const SECTION_HEADER_MARGIN_TOP = 12;
type IconName = ComponentProps<typeof Ionicons>["name"];

const hasImageSource = (value: unknown) => {
    if (typeof value === "number") return true;
    if (typeof value === "string") return Boolean(value.trim());
    if (!value || typeof value !== "object") return false;
    return Boolean(String((value as { uri?: unknown }).uri || "").trim());
};

const OrderThumbnail = ({
    contain,
    fallbackSource,
    primarySource,
    sourceKey,
    style,
}: {
    contain?: boolean;
    fallbackSource: any;
    primarySource: any;
    sourceKey: string;
    style: any;
}) => {
    const [showFallback, setShowFallback] = useState(false);

    useEffect(() => setShowFallback(false), [sourceKey]);

    return (
        <Image
            contentFit={contain || showFallback ? "contain" : "cover"}
            onError={() => setShowFallback(true)}
            source={showFallback ? fallbackSource : primarySource}
            style={style}
        />
    );
};

export default function ProfileScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const { variant, setVariant } = useTheme();
    const insets = useSafeAreaInsets();
    const dark = variant === "dark";
    const styles = useMemo(() => createStyles(dark), [dark]);
    const profile = useProfile();
    const scrollRef = useRef<ScrollView>(null);
    const [preferencesY, setPreferencesY] = useState(0);
    const [languageVisible, setLanguageVisible] = useState(false);
    const [adminAuthorized, setAdminAuthorized] = useState(false);
    const [avatarImageFailed, setAvatarImageFailed] = useState(false);
    const isTurkish = i18n.language?.startsWith("tr") ?? false;
    const copy = (key: string, english: string, turkish: string) => t(key, { defaultValue: isTurkish ? turkish : english });
    const isAdmin = profile.isAuthenticated && adminAuthorized;
    const displayName = String(profile.user?.name || "").trim();
    const avatarInitial = Array.from(displayName)[0]?.toLocaleUpperCase(isTurkish ? "tr-TR" : "en-US") || "";
    const avatarSource = profile.user?.avatar;
    const showAvatarImage = hasImageSource(avatarSource) && !avatarImageFailed;
    const addressParts = profile.defaultAddress
        ? [profile.defaultAddress.line1, profile.defaultAddress.block, profile.defaultAddress.room, profile.defaultAddress.city, profile.defaultAddress.country]
            .map((part) => String(part || "").trim())
            .filter(Boolean)
            .filter((part, index, parts) => {
                const normalized = part.toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US");
                return !parts.slice(0, index).some((previous) => {
                    const previousNormalized = previous.toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US");
                    return previousNormalized === normalized || previousNormalized.includes(normalized);
                });
            })
        : [];
    const formattedAddress = addressParts.join(", ");

    useEffect(() => setAvatarImageFailed(false), [avatarSource]);

    useEffect(() => {
        let active = true;
        setAdminAuthorized(false);
        if (profile.isAuthenticated) {
            void checkCurrentAdminAuthorization(true).then((result) => {
                if (active) setAdminAuthorized(result.status === "allowed");
            }).catch(() => undefined);
        }
        return () => { active = false; };
    }, [profile.isAuthenticated, profile.userId]);

    const icon = (name: IconName, size = 20, color = styles.title.color) => <Ionicons color={color} name={name} size={size} />;
    const chevron = (color = styles.chevron.color) => icon("chevron-forward", 16, color);
    const action = (label: string, onPress: () => void) => (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.actionHitbox, pressed && styles.pressed]}>
            <View style={styles.actionRow}><Text numberOfLines={1} style={styles.actionText}>{label}</Text>{chevron(ORANGE)}</View>
        </Pressable>
    );
    const sectionHeader = (name: IconName, title: string, onPress?: () => void, label = copy("profileRedesign.seeAll", "See all", "Tümünü gör")) => (
        <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
                <View style={styles.sectionIcon}>{icon(name, 20)}</View>
                <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
            </View>
            {onPress ? action(label, onPress) : null}
        </View>
    );
    const settingsRow = (name: IconName, title: string, onPress: () => void, value?: string, isLast = false) => (
        <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
            <View style={styles.listRow}>
                <View style={styles.rowIcon}>{icon(name, 19)}</View>
                <View style={[styles.rowContent, isLast && styles.lastRow]}>
                    <Text numberOfLines={1} style={styles.rowLabel}>{title}</Text>
                    {value ? <Text numberOfLines={1} style={styles.rowValue}>{value}</Text> : null}
                    {chevron()}
                </View>
            </View>
        </Pressable>
    );
    const bottomSheet = (visible: boolean, onClose: () => void, title: string, children: ReactNode) => (
        <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.backdrop}>
                <Pressable accessibilityLabel={copy("common.close", "Close", "Kapat")} onPress={onClose} style={styles.dismiss} />
                <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>{title}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={copy("common.close", "Close", "Kapat")} onPress={onClose} style={styles.closeButton}>{icon("close", 21)}</Pressable>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );

    const normalizedStatus = (order: any) => {
        const raw = String(order?.status || "pending").toLowerCase();
        if (isReviewableStatus(raw)) return "delivered";
        if (isCancelledStatus(raw)) return "canceled";
        if (raw === "accepted") return "preparing";
        return ["pending", "preparing", "ready", "out_for_delivery"].includes(raw) ? raw : "pending";
    };
    const historyOrder = profile.orders.find((order: any) => {
        const status = String(order?.status || "");
        return isReviewableStatus(status) || isCancelledStatus(status);
    });

    const renderActiveOrder = (order: any) => {
        const restaurant: any = seedRestaurants.find((entry: any) => String(entry.id) === String(order.restaurantId));
        const restaurantName = order.restaurant?.name || order.restaurantName || restaurant?.name || t("orders.unknownRestaurant");
        const logoCandidate = order.restaurant?.logo || order.restaurant?.logoUrl || order.restaurant?.logo_url
            || order.restaurant?.restaurantLogo || order.restaurantLogo || order.restaurant_logo
            || restaurant?.logoUrl || restaurant?.logo || restaurant?.imageUrl;
        const logoSource = getRestaurantImageSource(logoCandidate, undefined, restaurantName);
        const status = normalizedStatus(order);
        const statusLabel = t(`status.${status}`, { defaultValue: String(order.status || "pending") });
        const etaMin = Number(order.etaMin ?? order.deliveryEtaMin);
        const etaMax = Number(order.etaMax ?? order.deliveryEtaMax);
        const etaMinutes = Number(order.etaMinutes ?? order.eta);
        const roundedEta = Math.max(10, Math.round(etaMinutes / 5) * 5);
        const etaRange = etaMin > 0 && etaMax > 0
            ? `${Math.round(etaMin)}–${Math.round(etaMax)}`
            : etaMinutes > 0 && etaMinutes < 180
              ? `${Math.max(10, roundedEta - 5)}–${roundedEta + 5}`
              : "25–35";
        const etaLabel = `${isTurkish ? "Tahmini" : "Estimated"} ${etaRange} ${isTurkish ? "dk" : "min"}`;
        const stamp = order.updatedAt || order.createdAt;
        const date = new Date(typeof stamp === "object" && stamp?.seconds ? stamp.seconds * 1000 : stamp);
        const dateText = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(isTurkish ? "tr-TR" : "en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
        const activeStep = status === "preparing" ? 2 : status === "ready" || status === "out_for_delivery" ? 3 : status === "delivered" ? 4 : 0;
        const progressSteps = [
            { label: isTurkish ? "Bekliyor" : "Waiting", icon: "time-outline" as const },
            { label: isTurkish ? "Alındı" : "Received", icon: "checkmark-circle-outline" as const },
            { label: isTurkish ? "Hazırlanıyor" : "Preparing", icon: "restaurant-outline" as const },
            { label: isTurkish ? "Yolda" : "On the way", icon: "bicycle-outline" as const },
            { label: isTurkish ? "Teslim edildi" : "Delivered", icon: "cube-outline" as const },
        ];
        const progressFill = `${Math.min(100, Math.max(0, (activeStep / (progressSteps.length - 1)) * 100))}%` as DimensionValue;
        const openOrder = () => router.push({
            pathname: "/order/pending",
            params: { orderId: order.id, restaurantName, eta: String(order.eta || order.etaMinutes || 120) },
        });

        return (
            <Pressable key={order.id || order.$id} accessibilityRole="button" onPress={openOrder} style={styles.liveOrderCard}>
                <View style={styles.liveOrderTopRow}>
                    <View style={styles.liveOrderLogoShell}>
                        <OrderThumbnail contain fallbackSource={logoSource} primarySource={logoSource} sourceKey={`${order.id || order.$id}:logo`} style={styles.liveOrderLogo} />
                    </View>
                    <View style={styles.liveOrderInfo}>
                        <Text numberOfLines={1} style={styles.liveOrderName}>{restaurantName}</Text>
                        <View style={styles.liveOrderStatusRow}>
                            <View style={styles.liveOrderStatusPill}><Text numberOfLines={1} style={styles.liveOrderStatusText}>{statusLabel}</Text></View>
                            <View style={styles.liveOrderMetaRow}>{icon("time-outline", 14, styles.chevron.color)}<Text numberOfLines={1} style={styles.liveOrderEta}>{etaLabel}</Text></View>
                        </View>
                        {dateText ? <View style={styles.liveOrderMetaRow}>{icon("calendar-outline", 14, styles.chevron.color)}<Text numberOfLines={1} style={styles.liveOrderDate}>{dateText}</Text></View> : null}
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        onPress={(event) => { event.stopPropagation(); openOrder(); }}
                        style={styles.trackOrderButton}
                    >
                        <Text numberOfLines={1} style={styles.trackOrderText}>{isTurkish ? "Takip et" : "Track order"}</Text>
                        {icon("chevron-forward", 14, "#FFFFFF")}
                    </Pressable>
                </View>
                <View style={styles.liveProgressRow}>
                    <View style={styles.liveProgressLine} />
                    <View style={[styles.liveProgressLineFill, { width: progressFill }]} />
                    {progressSteps.map((step, index) => {
                        const done = index < activeStep;
                        const current = index === activeStep;
                        return (
                            <View key={step.label} style={styles.liveProgressStep}>
                                <View style={[styles.liveProgressDot, done && styles.liveProgressDotDone, current && styles.liveProgressDotCurrent]}>
                                    {icon(step.icon, 18, current ? "#FFFFFF" : done ? ORANGE : styles.chevron.color)}
                                </View>
                                <Text numberOfLines={2} style={[styles.liveProgressLabel, done && styles.liveProgressLabelDone, current && styles.liveProgressLabelCurrent]}>{step.label}</Text>
                            </View>
                        );
                    })}
                </View>
            </Pressable>
        );
    };

    const renderOrder = (order: any, active: boolean) => {
        const restaurant: any = seedRestaurants.find((entry: any) => String(entry.id) === String(order.restaurantId));
        const restaurantName = order.restaurant?.name || order.restaurantName || restaurant?.name || t("orders.unknownRestaurant");
        const items = Array.isArray(order.orderItems) ? order.orderItems : Array.isArray(order.items) ? order.items : [];
        const presentationHint = `${restaurantName} ${order.restaurant?.cuisine || restaurant?.cuisine || ""}`.toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US");
        const preferredFoodTerms = ["pizza", "burger", "dürüm", "durum", "wrap", "kebap", "kebab", "salata", "salad", "cafe", "coffee"]
            .filter((term) => presentationHint.includes(term));
        const storefrontItem = seedMenuByRestaurantId(String(restaurant?.id || order.restaurantId || "")).find((item) => {
            if (!hasImageSource(item.imageUrl)) return false;
            const itemHint = `${item.name} ${item.categories || ""}`.toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US");
            return preferredFoodTerms.some((term) => itemHint.includes(term));
        });
        const itemImage = items.find((item: any) => {
            if (!hasImageSource(item?.imageUrl || item?.image_url || item?.itemImageUrl)) return false;
            const itemHint = `${item?.name || ""} ${item?.category || ""} ${item?.categories || ""}`.toLocaleLowerCase(isTurkish ? "tr-TR" : "en-US");
            return preferredFoodTerms.some((term) => itemHint.includes(term));
        }) || items.find((item: any) => hasImageSource(item?.imageUrl || item?.image_url || item?.itemImageUrl));
        const primaryImageCandidate = order.restaurant?.coverImageUrl || order.restaurant?.cover_image_url
            || order.restaurant?.heroImageUrl || order.restaurant?.hero_image_url
            || order.restaurant?.storefrontImageUrl || order.restaurant?.storefront_image_url
            || restaurant?.coverImageUrl || restaurant?.heroImageUrl || restaurant?.storefrontImageUrl
            || storefrontItem?.imageUrl
            || itemImage?.imageUrl || itemImage?.image_url || itemImage?.itemImageUrl
            || order.imageUrl || order.image_url || order.foodImageUrl || order.food_image_url;
        const fallbackImageCandidate = order.restaurant?.logo || order.restaurant?.logoUrl || order.restaurant?.logo_url
            || order.restaurant?.restaurantLogo || order.restaurantLogo || order.restaurant_logo
            || restaurant?.logoUrl || restaurant?.logo || restaurant?.imageUrl;
        const fallbackSource = getRestaurantImageSource(fallbackImageCandidate, undefined, restaurantName);
        const primarySource = hasImageSource(primaryImageCandidate)
            ? getRestaurantImageSource(primaryImageCandidate, fallbackSource)
            : fallbackSource;
        const status = normalizedStatus(order);
        const rawStatus = String(order.status || "pending").toLowerCase();
        const stamp = order.updatedAt || order.createdAt;
        const date = new Date(typeof stamp === "object" && stamp?.seconds ? stamp.seconds * 1000 : stamp);
        const dateText = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(isTurkish ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
        const etaMin = Number(order.etaMin ?? order.deliveryEtaMin);
        const etaMax = Number(order.etaMax ?? order.deliveryEtaMax);
        const etaMinutes = Number(order.etaMinutes ?? order.eta);
        const roundedEta = Math.max(10, Math.round(etaMinutes / 5) * 5);
        const etaRange = etaMin > 0 && etaMax > 0 ? `${Math.round(etaMin)}–${Math.round(etaMax)}` : etaMinutes > 0 && etaMinutes < 180 ? `${Math.max(10, roundedEta - 5)}–${roundedEta + 5}` : "25–35";
        const amount = Number(order.total || 0);
        const formattedTotal = formatPanelCurrency(Number.isFinite(amount) ? amount : 0, isTurkish ? "tr" : "en");
        const delivered = status === "delivered";
        const canOpenOrderDetail = active || delivered;
        const openOrder = active
            ? () => router.push({ pathname: "/order/pending", params: { orderId: order.id, restaurantName, eta: String(order.eta || order.etaMinutes || 120) } })
            : () => router.push({ pathname: "/orders/[id]", params: { id: String(order.id || order.$id || "") } });
        return (
            <Pressable key={order.id} accessibilityRole={canOpenOrderDetail ? "button" : undefined} disabled={!canOpenOrderDetail} onPress={canOpenOrderDetail ? openOrder : undefined} style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
                <View style={styles.orderCard}>
                    <View style={[styles.thumbnailShell, active && styles.thumbnailShellPhoto]}>
                        <OrderThumbnail contain={!active} fallbackSource={fallbackSource} primarySource={active ? primarySource : fallbackSource} sourceKey={`${order.id}:${active ? String(primaryImageCandidate || "") : "restaurant-logo"}`} style={[styles.thumbnail, active && styles.thumbnailPhoto]} />
                    </View>
                    <View style={styles.flex}>
                        <Text numberOfLines={1} style={styles.itemTitle}>{restaurantName}</Text>
                        <Text numberOfLines={1} style={styles.metadata}>{active ? `${isTurkish ? "Tahmini" : "Estimated"} ${etaRange} ${isTurkish ? "dk" : "min"}` : dateText}</Text>
                        <Text numberOfLines={1} style={styles.metadata}>{items.length} {isTurkish ? "ürün" : items.length === 1 ? "item" : "items"} · {formattedTotal}</Text>
                    </View>
                    <View style={[styles.statusBadge, !delivered && styles.neutralStatus]}>
                        {icon(delivered ? "checkmark-circle-outline" : "time-outline", 14, delivered ? styles.statusText.color : styles.muted.color)}
                        <Text numberOfLines={1} style={[styles.statusText, !delivered && styles.muted]}>{t(`status.${status}`, { defaultValue: rawStatus })}</Text>
                    </View>{canOpenOrderDetail ? chevron() : null}
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
            <StatusBar style={dark ? "light" : "dark"} />
            <View style={styles.viewport}>
                <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: BOTTOM_NAV_CONTENT_HEIGHT + insets.bottom + BOTTOM_CONTENT_CLEARANCE }]} showsVerticalScrollIndicator={false}>
                <View style={styles.profileHeader}>
                    <View style={styles.flex}>
                        <Text style={styles.pageTitle}>{copy("profileRedesign.title", "My Profile", "Profilim")}</Text>
                        <Text style={styles.subtitle}>{copy("profileRedesign.subtitle", "Manage your account and preferences.", "Hesabını ve tercihlerini yönet.")}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={copy("profileRedesign.settings", "Settings", "Ayarlar")} hitSlop={4} onPress={() => scrollRef.current?.scrollTo({ y: preferencesY, animated: true })} style={({ pressed }) => [styles.settingsHitbox, pressed && styles.pressed]}><View style={styles.settingsButton}>{icon("settings-outline", 20)}</View></Pressable>
                </View>

                {profile.isAuthenticated ? <>
                    <View style={styles.identityCard}>
                        <View style={styles.avatar}>
                            {showAvatarImage
                                ? <Image contentFit="cover" onError={() => setAvatarImageFailed(true)} source={{ uri: avatarSource }} style={styles.avatarImage} />
                                : avatarInitial
                                  ? <Text style={styles.initial}>{avatarInitial}</Text>
                                  : icon("person-outline", 24, ORANGE)}
                        </View>
                        <View style={styles.flex}><Text numberOfLines={1} style={styles.name}>{profile.user?.name}</Text><Text numberOfLines={1} style={styles.metadata}>{profile.user?.email}</Text>{isAdmin ? <View style={styles.adminBadge}>{icon("shield-checkmark", 12, ORANGE)}<Text style={styles.adminText}>{copy("profileRedesign.admin", "Admin", "Yönetici")}</Text></View> : null}</View>
                        {action(t("profile.header.edit"), () => profile.setIsEditingProfile(true))}
                    </View>

                    {sectionHeader("location-outline", copy("profileRedesign.delivery", "Delivery address", "Teslimat adresi"))}
                    <Pressable accessibilityRole="button" onPress={profile.handleManageAddressesPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
                        <View style={styles.addressCard}>
                            <View style={styles.addressIcon}>{icon("business-outline", 20, styles.muted.color)}</View>
                            <View style={styles.flex}><Text numberOfLines={1} style={styles.itemTitle}>{profile.defaultAddress?.label || copy("profileRedesign.addAddress", "Add delivery address", "Teslimat adresi ekle")}</Text>{profile.defaultAddress ? <Text ellipsizeMode="tail" numberOfLines={2} style={styles.metadata}>{formattedAddress}</Text> : null}</View>{chevron()}
                        </View>
                    </Pressable>

                    {sectionHeader("bag-outline", t("profile.activeOrders"))}
                    {profile.activeOrders.length ? profile.activeOrders.slice(0, 1).map(renderActiveOrder) : <View style={styles.emptyCard}>
                        <View style={styles.emptyIcon}>{icon("bag-outline", 22, ORANGE)}</View>
                        <View style={styles.flex}><Text style={styles.itemTitle}>{copy("profileRedesign.noActive", "No active orders", "Aktif sipariş yok")}</Text><Text style={styles.metadata}>{copy("profileRedesign.hungry", "Hungry for something tasty?", "Lezzetli bir şeylere ne dersin?")}</Text><Pressable accessibilityRole="button" hitSlop={5} onPress={() => router.push("/home")} style={styles.browseAction}><Text style={styles.browseText}>{copy("profileRedesign.browse", "Browse restaurants", "Restoranları keşfet")}</Text>{icon("arrow-forward", 16, ORANGE)}</Pressable></View>
                    </View>}

                    {sectionHeader("time-outline", t("orders.historyTitle"), () => router.push("/orders"))}
                    {historyOrder ? renderOrder(historyOrder, false) : <View style={styles.emptyHistory}><Text style={styles.metadata}>{t("orders.emptyHistory")}</Text></View>}
                </> : <View style={styles.guestCard}><Text style={styles.sectionTitle}>{profile.guestCopy.title}</Text><Text style={styles.metadata}>{profile.guestCopy.body}</Text>{action(profile.guestCopy.cta, () => router.push("/sign-in"))}</View>}

                <View onLayout={(event) => setPreferencesY(event.nativeEvent.layout.y)}>
                    {sectionHeader("options-outline", copy("profileRedesign.preferences", "Preferences", "Tercihler"))}
                    <View style={styles.group}>
                        {profile.isAuthenticated ? settingsRow("notifications-outline", t("profileExtras.actions.notifications.label"), () => profile.setNotifModalVisible(true)) : null}
                        <View style={styles.listRow}><View style={styles.rowIcon}>{icon("moon-outline", 19)}</View><View style={styles.rowContent}><Text style={styles.rowLabel}>{copy("profileRedesign.darkMode", "Dark mode", "Koyu mod")}</Text><Pressable accessibilityLabel={copy("profileRedesign.darkMode", "Dark mode", "Koyu mod")} accessibilityRole="switch" accessibilityState={{ checked: dark }} hitSlop={9} onPress={() => setVariant(dark ? "light" : "dark")} style={styles.switchHitbox}><View style={[styles.switchTrack, dark && styles.switchTrackActive]}><View style={[styles.switchThumb, dark && styles.switchThumbActive]} /></View></Pressable></View></View>
                        {settingsRow("globe-outline", copy("profileRedesign.language", "Language", "Dil"), () => setLanguageVisible(true), isTurkish ? "Türkçe" : "English", true)}
                    </View>
                </View>

                {sectionHeader("help-circle-outline", copy("profileRedesign.accountSupport", "Account & support", "Hesap ve destek"))}
                <View style={styles.group}>
                    {isAdmin ? settingsRow("shield-checkmark-outline", copy("profileRedesign.adminAccess", "Admin access", "Yönetici erişimi"), () => router.push("/admin")) : null}
                    {profile.ownedRestaurantId ? settingsRow("storefront-outline", copy("profileRedesign.restaurantPanel", "Restaurant panel", "Restoran paneli"), () => router.push("/restaurantpanel")) : null}
                    {settingsRow("document-text-outline", t("profileExtras.actions.privacy.label"), () => router.push("/privacy"))}
                    {settingsRow("document-text-outline", t("profileExtras.actions.terms.label"), () => router.push("/terms"))}
                    {settingsRow("headset-outline", t("profileExtras.actions.help.label"), () => router.push("/support"), undefined, true)}
                </View>

                {profile.isAuthenticated ? <View style={styles.destructiveGroup}>
                    <Pressable accessibilityRole="button" disabled={profile.signingOut || profile.deletingProfile} onPress={profile.handleLogout} style={({ pressed }) => [styles.destructivePressable, pressed && styles.pressedOpacity]}>
                        <View style={styles.signOutButton}><View style={styles.signOutContent}>{icon("log-out-outline", 19, DANGER)}<Text numberOfLines={1} style={styles.signOutText}>{t(profile.signingOut ? "profile.header.signingOut" : "profile.header.signOut")}</Text></View></View>
                    </Pressable>
                    <View style={styles.deleteCard}>
                        <View style={styles.deleteCopy}>
                            <Text style={styles.deleteTitle}>{copy("profileRedesign.deleteAccount", "Delete account", "Hesabı sil")}</Text>
                            <Text style={styles.deleteDescription}>{copy("profileRedesign.deleteDescription", "Permanently remove your account and profile data from Hungrie.", "Hesabını ve profil verilerini Hungrie'den kalıcı olarak kaldır.")}</Text>
                        </View>
                        <Pressable accessibilityRole="button" disabled={profile.deletingProfile || profile.signingOut} onPress={profile.handleDeleteProfile} style={({ pressed }) => [styles.deletePressable, pressed && styles.pressedOpacity]}>
                            <View style={styles.deleteButton}><Text numberOfLines={1} style={styles.deleteButtonText}>{profile.deletingProfile ? t("profileExtras.deleteProfile.deleting") : copy("profileRedesign.deleteAccount", "Delete account", "Hesabı sil")}</Text></View>
                        </Pressable>
                    </View>
                </View> : null}
                </ScrollView>

            </View>

            {bottomSheet(languageVisible, () => setLanguageVisible(false), copy("profileRedesign.language", "Language", "Dil"), <LanguageToggle />)}
            {bottomSheet(profile.isEditingProfile, () => profile.setIsEditingProfile(false), t("profileExtras.editModal.title"), <View style={styles.form}>
                <Text style={styles.formLabel}>{t("profileExtras.editModal.name")}</Text><TextInput accessibilityLabel={t("profileExtras.editModal.name")} autoComplete="name" onChangeText={profile.setNameDraft} style={styles.input} value={profile.nameDraft} />
                <Text style={styles.formLabel}>{t("profileExtras.editModal.email")}</Text><TextInput accessibilityLabel={t("profileExtras.editModal.email")} editable={false} style={[styles.input, styles.readonly]} value={profile.emailDraft} />
                <Text style={styles.formLabel}>{t("profileExtras.editModal.whatsapp", "WhatsApp")}</Text><TextInput accessibilityLabel="WhatsApp" keyboardType="phone-pad" onChangeText={profile.setWhatsappDraft} style={styles.input} value={profile.whatsappDraft} />
                <View style={styles.formActions}>{action(t("common.cancel"), () => profile.setIsEditingProfile(false))}<Pressable accessibilityRole="button" disabled={profile.savingProfile} onPress={profile.handleSaveProfile} style={styles.saveButton}><Text style={styles.saveText}>{t(profile.savingProfile ? "profile.header.saving" : "profileExtras.editModal.save")}</Text></Pressable></View>
            </View>)}
            <NotificationPreferencesModal isRestaurantMember={Boolean(profile.ownedRestaurantId)} onClose={() => profile.setNotifModalVisible(false)} visible={profile.notifModalVisible} />
        </SafeAreaView>
    );
}

const createStyles = (dark: boolean) => {
    const colors = { background: dark ? "#0F1115" : "#FAFBFC", surface: dark ? "#171A20" : "#FFFFFF", text: dark ? "#F5F7FA" : "#111318", muted: dark ? "#AAB2C0" : "#667085", tertiary: dark ? "#778293" : "#98A2B3", border: dark ? "#2A2E35" : "#EAECF0", subtle: dark ? "#22262E" : "#F5F6F8" };
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.background }, viewport: { flex: 1, overflow: "hidden", backgroundColor: colors.background }, content: { width: "100%", maxWidth: 620, alignSelf: "center", paddingHorizontal: 22, paddingTop: 18 },
        flex: { flex: 1, minWidth: 0 }, title: { color: colors.text }, muted: { color: colors.muted, fontSize: 13, lineHeight: 17 }, chevron: { color: colors.tertiary }, cardPressable: { borderRadius: 16, overflow: "hidden" },
        profileHeader: { minHeight: 58, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 15 },
        settingsHitbox: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 999 }, settingsButton: { width: 40, height: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", shadowColor: dark ? "#000000" : "#101828", shadowOffset: { width: 0, height: 1 }, shadowOpacity: dark ? 0.16 : 0.05, shadowRadius: 2, elevation: 1 },
        pageTitle: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.5 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 19, marginTop: 2 },
        identityCard: { minHeight: 94, borderRadius: 18, borderWidth: 1, borderColor: dark ? colors.border : "#F2F4F7", backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
        avatar: { width: 54, height: 54, borderRadius: 999, backgroundColor: dark ? "#4A2D18" : "#FFE4C2", alignItems: "center", justifyContent: "center", overflow: "hidden" }, avatarImage: { width: "100%", height: "100%" }, initial: { color: ORANGE, fontSize: 28, lineHeight: 34, fontWeight: "600", textAlign: "center", includeFontPadding: false },
        name: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "600" }, metadata: { color: colors.muted, fontSize: 13, lineHeight: 17, marginTop: 1 },
        adminBadge: { minHeight: 24, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: dark ? "#392719" : "#FFF3E8", paddingHorizontal: 9, marginTop: 3 }, adminText: { color: ORANGE, fontSize: 12, lineHeight: 16, fontWeight: "500" },
        actionHitbox: { minHeight: 44, flexShrink: 0, justifyContent: "center", borderRadius: 8 }, actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 }, actionText: { flexShrink: 0, color: ORANGE, fontSize: 14, lineHeight: 18, fontWeight: "500" }, pressed: { backgroundColor: colors.subtle },
        sectionHeader: { width: "100%", minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SECTION_HEADER_MARGIN_TOP, marginBottom: 4 }, sectionHeaderLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }, sectionIcon: { width: 30, alignItems: "flex-start", justifyContent: "center" }, sectionTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "700", letterSpacing: -0.35 },
        addressCard: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9 }, addressIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.subtle, alignItems: "center", justifyContent: "center" },
        itemTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "600" }, emptyCard: { minHeight: 90, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 9 }, emptyIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: dark ? "#30231D" : "#FFF3E9", alignItems: "center", justifyContent: "center" }, browseAction: { minHeight: 32, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7 }, browseText: { color: ORANGE, fontSize: 14, lineHeight: 18, fontWeight: "600" },
        orderCard: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 9 }, thumbnailShell: { width: 52, height: 52, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }, thumbnailShellPhoto: { borderWidth: 0 }, thumbnail: { width: 42, height: 42, borderRadius: 7 }, thumbnailPhoto: { width: 52, height: 52, borderRadius: 10 }, statusBadge: { maxWidth: 100, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: dark ? "#173326" : "#EBF9F1", paddingHorizontal: 9, paddingVertical: 6 }, statusText: { color: dark ? "#70DAA0" : "#3DBD78", fontSize: 13, lineHeight: 16, fontWeight: "500" }, neutralStatus: { backgroundColor: colors.subtle }, emptyHistory: { minHeight: 52, justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 },
        liveOrderCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 18, overflow: "hidden" },
        liveOrderTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
        liveOrderLogoShell: { width: 56, height: 56, flexShrink: 0, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
        liveOrderLogo: { width: 40, height: 40, borderRadius: 12 },
        liveOrderInfo: { flex: 1, minWidth: 0 },
        liveOrderName: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600" },
        liveOrderStatusRow: { marginTop: 5, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
        liveOrderStatusPill: { maxWidth: "100%", borderRadius: 999, borderWidth: 1, borderColor: dark ? "rgba(255,90,0,0.34)" : "rgba(255,90,0,0.18)", backgroundColor: dark ? "#352319" : "#FFF3EB", paddingHorizontal: 10, paddingVertical: 4 },
        liveOrderStatusText: { color: dark ? "#FF9A62" : ORANGE, fontSize: 12, lineHeight: 16, fontWeight: "500" },
        liveOrderMetaRow: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
        liveOrderEta: { flexShrink: 1, color: colors.muted, fontSize: 12, lineHeight: 16 },
        liveOrderDate: { flexShrink: 1, color: colors.tertiary, fontSize: 12, lineHeight: 16 },
        trackOrderButton: { minHeight: 38, flexShrink: 0, borderRadius: 999, backgroundColor: ORANGE, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
        trackOrderText: { color: "#FFFFFF", fontSize: 12, lineHeight: 16, fontWeight: "600" },
        liveProgressRow: { position: "relative", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 2 },
        liveProgressLine: { position: "absolute", left: 28, right: 28, top: 19, height: 2, backgroundColor: colors.border },
        liveProgressLineFill: { position: "absolute", left: 28, top: 19, height: 2, backgroundColor: ORANGE },
        liveProgressStep: { width: 54, alignItems: "center", gap: 6 },
        liveProgressDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.subtle, alignItems: "center", justifyContent: "center" },
        liveProgressDotDone: { borderColor: ORANGE, backgroundColor: colors.surface },
        liveProgressDotCurrent: { borderColor: ORANGE, backgroundColor: ORANGE },
        liveProgressLabel: { minHeight: 26, color: colors.tertiary, fontSize: 10, lineHeight: 13, textAlign: "center" },
        liveProgressLabelDone: { color: ORANGE },
        liveProgressLabelCurrent: { color: colors.text, fontWeight: "500" },
        group: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }, listRow: { minHeight: 50, flexDirection: "row", alignItems: "center", paddingLeft: 14 }, rowIcon: { width: 34, alignItems: "flex-start", justifyContent: "center" }, rowContent: { minHeight: 50, flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingRight: 12 }, lastRow: { borderBottomWidth: 0 }, rowLabel: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: "500" }, rowValue: { maxWidth: "38%", color: colors.muted, fontSize: 13.5, lineHeight: 18 }, switchHitbox: { width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center" }, switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: "#D0D5DD", padding: 2, justifyContent: "center" }, switchTrackActive: { backgroundColor: ORANGE }, switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", transform: [{ translateX: 0 }] }, switchThumbActive: { transform: [{ translateX: 18 }] },
        destructiveGroup: { marginTop: 18, gap: 14 }, destructivePressable: { width: "100%", flexShrink: 0, borderRadius: 15 }, pressedOpacity: { opacity: 0.76 }, signOutButton: { width: "100%", minHeight: 48, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: dark ? "rgba(229,37,33,0.48)" : "rgba(229,37,33,0.30)", backgroundColor: colors.surface }, signOutContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, signOutText: { color: DANGER, fontSize: 15, lineHeight: 19, fontWeight: "600" }, deleteCard: { width: "100%", borderRadius: 16, borderWidth: 1, borderColor: dark ? "#713634" : "#FECACA", backgroundColor: dark ? "#2B191A" : "#FFF7F7", padding: 15, gap: 12 }, deleteCopy: { gap: 4 }, deleteTitle: { color: dark ? "#FF8B83" : "#B42318", fontSize: 16, lineHeight: 20, fontWeight: "700" }, deleteDescription: { color: dark ? "#F5AAA5" : "#B42318", fontSize: 13.5, lineHeight: 19, fontWeight: "400" }, deletePressable: { minHeight: 43, alignSelf: "flex-end", borderRadius: 13 }, deleteButton: { minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: DANGER, paddingHorizontal: 18 }, deleteButtonText: { color: "#FFFFFF", fontSize: 14.5, lineHeight: 19, fontWeight: "600" }, guestCard: { marginTop: 2, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, gap: 8 },
        backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }, dismiss: { flex: 1 }, sheet: { maxHeight: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface, padding: 22 }, sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 }, sheetTitle: { flex: 1, color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "700" }, closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.subtle },
        form: { gap: 10 }, formLabel: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: "500" }, input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, fontSize: 16, paddingHorizontal: 12 }, readonly: { backgroundColor: colors.subtle }, formActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 20, marginTop: 12 }, saveButton: { minHeight: 44, borderRadius: 12, backgroundColor: ORANGE, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }, saveText: { color: "#FFFFFF", fontSize: 15, lineHeight: 19, fontWeight: "600" },
    });
};

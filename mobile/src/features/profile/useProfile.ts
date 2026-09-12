import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import useAuthStore from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { logout } from "@/src/data/authRepository";
import { useDefaultAddress } from "@/src/features/address/addressFeature";
import { autoCancelExpiredPendingOrders, fetchUserOrdersPage, subscribeLatestOrderSummary } from "@/src/data/orderRepository";
import { getOwnedRestaurantId } from "@/src/data/restaurantRepository";
import { deleteCurrentUserProfile, updateUserProfile } from "@/src/data/profileRepository";
import { isCancelledStatus, isReviewableStatus } from "@/src/features/reviews/reviewUtils";
const autoCancelingProfileOrderIds = new Set<string>();
const PROFILE_ORDER_LIMIT = 20;

const orderId = (order: any) => String(order?.id ?? order?.$id ?? "").trim();

const mergeLatestOrder = (orders: any[], latest: any) => {
    if (!latest) return orders;
    const latestId = orderId(latest);
    if (!latestId) return [latest, ...orders];
    return [latest, ...orders.filter((order) => orderId(order) !== latestId)];
};

export function useProfile() {
    const { user, isAuthenticated, setUser, resetAuthState } = useAuthStore();
    const clearCart = useCartStore((s) => s.clearCart);
    const { defaultAddress } = useDefaultAddress();
    const { t, i18n } = useTranslation();
    const [orders, setOrders] = useState<any[]>([]);
    const [ownedRestaurantId, setOwnedRestaurantId] = useState<string | null>(null);
    const [signingOut, setSigningOut] = useState(false);
    const [deletingProfile, setDeletingProfile] = useState(false);

    const [notifModalVisible, setNotifModalVisible] = useState(false);

    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);

    const [nameDraft, setNameDraft] = useState(user?.name ?? "");
    const [emailDraft, setEmailDraft] = useState(user?.email ?? "");
    const [whatsappDraft, setWhatsappDraft] = useState(user?.whatsappNumber ?? "");

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
    const userId = String(user?.id ?? user?.$id ?? user?.accountId ?? "").trim();
    const activeOrders = useMemo(() => {
        return (orders || []).filter((o: any) => {
            const status = String(o?.status || "");
            return !isReviewableStatus(status) && !isCancelledStatus(status);
        });
    }, [orders]);
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const guestCopy = {
        title: isTurkish ? "Profilini y\u00F6netmek i\u00E7in giri\u015F yap" : "Sign in to manage your profile",
        body: isTurkish
            ? "Restoranlar\u0131 ve men\u00FCleri \u00F6zg\u00FCrce gez. Sipari\u015F vermek, adreslerini y\u00F6netmek veya hesab\u0131n\u0131 d\u00FCzenlemek istedi\u011Finde giri\u015F yap."
            : "Browse restaurants and menus freely. Sign in when you want to place orders, manage addresses, or edit your account.",
        cta: isTurkish ? "Giri\u015F yap" : "Sign in",
    };

    const handleManageAddressesPress = () => {
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

    const loadUserOrders = useCallback(async () => {
        if (!userId) {
            setOrders([]);
            return;
        }

        try {
            const page = await fetchUserOrdersPage(userId, { limit: PROFILE_ORDER_LIMIT });
            const nextOrders = page.items || [];
            void autoCancelExpiredPendingOrders(nextOrders, {
                inFlightIds: autoCancelingProfileOrderIds,
                onError: (error) => {
                    console.warn("[orders] Failed to auto-cancel expired pending order from profile", error);
                },
            });
            setOrders(nextOrders);
        } catch {
            setOrders([]);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            setOrders([]);
            return undefined;
        }

        try {
            return subscribeLatestOrderSummary(userId, (latest) => {
                void autoCancelExpiredPendingOrders(latest ? [latest] : [], {
                    inFlightIds: autoCancelingProfileOrderIds,
                    onError: (error) => {
                        console.warn("[orders] Failed to auto-cancel expired pending order from profile", error);
                    },
                });
                setOrders((current) => mergeLatestOrder(current, latest));
            });
        } catch {
            void loadUserOrders();
            return undefined;
        }
    }, [loadUserOrders, userId]);

    useFocusEffect(
        useCallback(() => {
            void loadUserOrders();
            return undefined;
        }, [loadUserOrders]),
    );

    const loadOwnedRestaurant = useCallback(async () => {
        if (!userId) {
            setOwnedRestaurantId(null);
            return;
        }
        const owned = await getOwnedRestaurantId().catch(() => null);
        setOwnedRestaurantId(owned ? String(owned) : null);
    }, [userId]);

    useEffect(() => {
        void loadOwnedRestaurant();
    }, [loadOwnedRestaurant]);

    useFocusEffect(
        useCallback(() => {
            void loadOwnedRestaurant();
            return undefined;
        }, [loadOwnedRestaurant]),
    );

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
                whatsappNumber: trimmedWhatsapp,
            });

            setUser({
                ...(user || { avatar: undefined }),
                id: synced?.accountId ?? user?.id,
                $id: synced?.accountId ?? user?.$id,
                accountId: synced?.accountId ?? user?.accountId,
                name: synced?.name ?? trimmedName,
                email: synced?.email ?? user?.email,
                avatar: synced?.avatar ?? user?.avatar,
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
            setOrders([]);
            setOwnedRestaurantId(null);
            setNotifModalVisible(false);
            setIsEditingProfile(false);
            setSavingProfile(false);
            setNameDraft("");
            setEmailDraft("");
            setWhatsappDraft("");
            clearCart();
            resetAuthState();
            router.replace("/sign-in");
        } catch (error: any) {
            Alert.alert("Unable to sign out", error?.message || "Please try again.");
        } finally {
            setSigningOut(false);
        }
    };

    const handleDeleteProfile = () => {
        const confirmTitle = t("profileExtras.deleteProfile.confirmTitle", "Delete profile?");
        const confirmBody = t(
            "profileExtras.deleteProfile.confirmBody",
            "Are you sure? This permanently deletes your profile and you will lose access to your account.",
        );
        const successTitle = t("profileExtras.deleteProfile.successTitle", "Profile deleted");
        const successBody = t("profileExtras.deleteProfile.successBody", "Your account has been deleted permanently.");
        const errorTitle = t("profileExtras.deleteProfile.errorTitle", "Unable to delete profile");
        const errorBody = t(
            "profileExtras.deleteProfile.errorBody",
            "Please sign in again and try deleting your profile once more.",
        );

        const executeDeleteProfile = async () => {
            try {
                setDeletingProfile(true);
                await deleteCurrentUserProfile();
                setOrders([]);
                setOwnedRestaurantId(null);
                setNotifModalVisible(false);
                setIsEditingProfile(false);
                setSavingProfile(false);
                setNameDraft("");
                setEmailDraft("");
                setWhatsappDraft("");
                clearCart();
                resetAuthState();

                if (Platform.OS === "web") {
                    window.alert(`${successTitle}\n\n${successBody}`);
                } else {
                    Alert.alert(successTitle, successBody);
                }

                router.replace("/sign-in");
            } catch (error: any) {
                const message = error?.message || errorBody;
                if (Platform.OS === "web") {
                    window.alert(`${errorTitle}\n\n${message}`);
                } else {
                    Alert.alert(errorTitle, message);
                }
            } finally {
                setDeletingProfile(false);
            }
        };

        if (Platform.OS === "web") {
            const confirmed = window.confirm(`${confirmTitle}\n\n${confirmBody}`);
            if (confirmed) {
                void executeDeleteProfile();
            }
            return;
        }

        Alert.alert(confirmTitle, confirmBody, [
            {
                text: t("common.cancel"),
                style: "cancel",
            },
            {
                text: t("profileExtras.deleteProfile.confirmAction", "Delete profile"),
                style: "destructive",
                onPress: () => {
                    void executeDeleteProfile();
                },
            },
        ]);
    };

    return { user, isAuthenticated, defaultAddress, orders, activeOrders, ownedRestaurantId,
        signingOut, deletingProfile, notifModalVisible, setNotifModalVisible,
        isEditingProfile, setIsEditingProfile, savingProfile, nameDraft, setNameDraft,
        emailDraft, whatsappDraft, setWhatsappDraft, initials, userId, guestCopy,
        addressLineOne, addressLineTwo, handleManageAddressesPress,
        handleSaveProfile, handleLogout, handleDeleteProfile };
}

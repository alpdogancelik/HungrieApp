import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { DimensionValue } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import "@/src/lib/i18n";

import useAuthStore from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { logout } from "@/lib/api";
import { router, useRouter } from "expo-router";
import { getRestaurantImageSource } from "@/lib/assets";

import { useDefaultAddress, type ManageAddressesNavigation } from "@/src/features/address/addressFeature";

import { profileIllustrations, profileImages } from "@/constants/profileMedia";

import { autoCancelExpiredPendingOrders, fetchUserOrders, subscribeUserOrders } from "@/src/services/firebaseOrders";
import { storage } from "@/src/lib/storage";
import { useTheme } from "@/src/theme/themeContext";
import { useStableWindowDimensions } from "@/src/lib/useStableWindowDimensions";

import { OrderStatus } from "@/type";
import { ORDER_STATUS_COLORS } from "@/components/OrderCard";
import { makeShadow } from "@/src/lib/shadowStyle";
import { useWebDocumentTitle } from "@/src/lib/useWebDocumentTitle";
import { deleteCurrentUserProfile, getOwnedRestaurantId, updateUserProfile } from "@/lib/firebaseAuth";
import { NotificationManager } from "@/src/features/notifications/NotificationManager";
import { seedRestaurants } from "@/lib/restaurantSeeds";
import { isCancelledStatus, isReviewableStatus } from "@/src/features/reviews/reviewUtils";

const ORANGE = "#FE8C00";
const autoCancelingProfileOrderIds = new Set<string>();
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
const resolveRestaurantSeed = (order: any) => {
    const restaurantId = normalizeId(order?.restaurantId).toLowerCase();
    const restaurantName = normalizeId(order?.restaurant?.name || order?.restaurantName).toLowerCase();
    return seedRestaurants.find((restaurant: any) => {
        const seedId = normalizeId(restaurant?.id).toLowerCase();
        const seedName = normalizeId(restaurant?.name).toLowerCase();
        return (restaurantId && seedId === restaurantId) || (restaurantName && seedName === restaurantName);
    });
};
const ui = StyleSheet.create({
    pageContent: {
        paddingHorizontal: 20,
        rowGap: 24,
    },
    screenTitle: {
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 25,
        color: "#0F172A",
    },
    screenSubtitle: {
        marginTop: 4,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 17,
        color: "#667085",
    },
    topHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    topHeaderActions: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
    topIconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E9EEF5",
        ...makeShadow({
            color: "#0F172A",
            offsetY: 8,
            blurRadius: 18,
            opacity: 0.05,
            elevation: 2,
        }),
    },
    profileCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E9EEF5",
        rowGap: 16,
        ...makeShadow({
            color: "#0F172A",
            offsetY: 10,
            blurRadius: 24,
            opacity: 0.06,
            elevation: 3,
        }),
    },
    profileCardTop: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 14,
    },
    profileAvatar: {
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: "#FFE3BD",
        alignItems: "center",
        justifyContent: "center",
    },
    profileAvatarText: {
        fontFamily: "ChairoSans",
        fontSize: 28,
        color: "#D97706",
    },
    profileIdentity: {
        flex: 1,
        minWidth: 0,
    },
    profileName: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 20,
        color: "#0F172A",
    },
    profileEmail: {
        marginTop: 4,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#667085",
    },
    editButton: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "#FFFFFF",
    },
    editButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#F97316",
    },
    profileDivider: {
        height: 1,
        backgroundColor: "#EAECF0",
    },
    signOutRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 10,
    },
    signOutTextInline: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#DC2626",
    },
    addressModernCard: {
        borderRadius: 18,
        paddingHorizontal: 13,
        paddingVertical: 10,
        backgroundColor: "#FFF9F3",
        borderWidth: 1,
        borderColor: "#FFE1C2",
        rowGap: 0,
        ...makeShadow({
            color: "#F28C28",
            offsetY: 6,
            blurRadius: 18,
            opacity: 0.07,
            elevation: 2,
        }),
    },
    addressModernTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        columnGap: 14,
    },
    addressModernInfo: {
        flex: 1,
        minWidth: 0,
    },
    addressKickerRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 5,
        marginBottom: 6,
    },
    addressKicker: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#F26B00",
    },
    addressModernTitle: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 20,
        color: "#0F172A",
    },
    addressModernMeta: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 17,
        color: "#667085",
    },
    addressImage: {
        width: 132,
        height: 118,
        alignSelf: "flex-end",
        alignItems: "flex-end",
        justifyContent: "flex-end",
    },
    addressManageButton: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        columnGap: 4,
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 6,
        backgroundColor: "#FF6A00",
    },
    addressManageButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#FFFFFF",
    },
    modernSectionCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E9EEF5",
        rowGap: 14,
        ...makeShadow({
            color: "#0F172A",
            offsetY: 10,
            blurRadius: 24,
            opacity: 0.06,
            elevation: 3,
        }),
    },
    modernSectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    modernSectionTitle: {
        fontFamily: "ChairoSans",
        fontSize: 17,
        lineHeight: 21,
        color: "#0F172A",
    },
    linkButtonRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 4,
    },
    linkButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#F97316",
    },
    activeOrderEmptyRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 14,
    },
    activeOrderEmptyState: {
        flexDirection: "row",
        alignItems: "flex-start",
        columnGap: 14,
    },
    emptyBagBubble: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#FFF3E8",
        alignItems: "center",
        justifyContent: "center",
    },
    activeOrderCopy: {
        flex: 1,
        minWidth: 0,
    },
    activeOrderEmptyCopy: {
        flex: 1,
        minWidth: 0,
        rowGap: 10,
    },
    activeOrderTitle: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 19,
        color: "#0F172A",
    },
    activeOrderBody: {
        marginTop: 3,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 17,
        color: "#667085",
    },
    orangeCta: {
        borderRadius: 999,
        backgroundColor: "#FF8A00",
        paddingHorizontal: 16,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    orangeCtaText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#FFFFFF",
    },
    orangeCtaInline: {
        alignSelf: "flex-start",
    },
    compactStatusPill: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: "#EAF9EE",
        flexDirection: "row",
        alignItems: "center",
        columnGap: 6,
    },
    compactStatusText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#249F5D",
    },
    activeOrdersSection: {
        rowGap: 12,
    },
    activeOrdersHeader: {
        paddingHorizontal: 8,
    },
    activeOrderCard: {
        borderRadius: 20,
        backgroundColor: "#FFFFFF",
        rowGap: 18,
    },
    activeOrderTopRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        columnGap: 12,
    },
    activeRestaurantLogoShell: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#EEF2F6",
        ...makeShadow({
            color: "#0F172A",
            offsetY: 7,
            blurRadius: 14,
            opacity: 0.08,
            elevation: 2,
        }),
    },
    activeRestaurantLogo: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    activeRestaurantLogoImage: {
        width: "100%",
        height: "100%",
    },
    activeOrderInfo: {
        flex: 1,
        minWidth: 0,
    },
    activeOrderName: {
        fontFamily: "ChairoSans",
        fontSize: 17,
        lineHeight: 22,
        color: "#111827",
    },
    activeOrderMetaRow: {
        marginTop: 6,
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: 7,
        rowGap: 5,
    },
    activeStatusPill: {
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: "rgba(249,115,22,0.14)",
        backgroundColor: "#FFF4ED",
    },
    activeStatusPillText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 15,
        color: "#F97316",
    },
    activeEtaText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#667085",
    },
    activeDateRow: {
        marginTop: 4,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 4,
    },
    activeDateText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 16,
        color: "#98A2B3",
        flexShrink: 0,
    },
    trackOrderButton: {
        flexShrink: 0,
        borderRadius: 999,
        backgroundColor: "#FF6A00",
        paddingHorizontal: 13,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 4,
    },
    trackOrderButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 15,
        color: "#FFFFFF",
    },
    activeProgressRow: {
        position: "relative",
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        paddingTop: 2,
    },
    activeProgressLine: {
        position: "absolute",
        left: 28,
        right: 28,
        top: 22,
        height: 2,
        backgroundColor: "#EEF2F6",
    },
    activeProgressLineFill: {
        position: "absolute",
        left: 28,
        top: 22,
        height: 2,
        backgroundColor: "#FF6A00",
    },
    activeProgressStep: {
        width: 62,
        alignItems: "center",
        rowGap: 7,
    },
    activeProgressDot: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#F6F8FB",
    },
    activeProgressDotDone: {
        borderColor: "#FF6A00",
        backgroundColor: "#FFFFFF",
    },
    activeProgressDotCurrent: {
        borderColor: "#FF6A00",
        backgroundColor: "#FF6A00",
    },
    activeProgressLabel: {
        fontFamily: "ChairoSans",
        fontSize: 10,
        lineHeight: 13,
        color: "#98A2B3",
        textAlign: "center",
    },
    activeProgressLabelDone: {
        color: "#FF6A00",
    },
    activeProgressLabelCurrent: {
        color: "#111827",
    },
    historyRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
    historySection: {
        rowGap: 12,
    },
    historyHeader: {
        paddingHorizontal: 8,
    },
    historyCard: {
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E9EEF5",
        ...makeShadow({
            color: "#0F172A",
            offsetY: 10,
            blurRadius: 24,
            opacity: 0.06,
            elevation: 3,
        }),
    },
    historyTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    historyRestaurantName: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 20,
        color: "#0F172A",
    },
    historyMeta: {
        marginTop: 4,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 17,
        color: "#667085",
    },
    historyPrice: {
        color: "#F97316",
        fontFamily: "ChairoSans",
    },
    historyStatusWrap: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
        flexShrink: 0,
    },
    historyArrowWrap: {
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
    },
    accountList: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "#E9EEF5",
        backgroundColor: "#FFFFFF",
        overflow: "hidden",
    },
    accountListRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        columnGap: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#EEF2F6",
    },
    accountListIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "#FFF4EA",
        alignItems: "center",
        justifyContent: "center",
    },
    accountListTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    accountListTitle: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        color: "#0F172A",
    },
    accountListBody: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 17,
        color: "#667085",
    },
    deleteInlineCard: {
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 18,
        backgroundColor: "#FFF5F5",
        borderWidth: 1,
        borderColor: "#FECACA",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 16,
    },
    deleteInlineCopy: {
        flex: 1,
        minWidth: 0,
    },
    deleteInlineTitle: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 19,
        color: "#B42318",
    },
    deleteInlineBody: {
        marginTop: 6,
        fontFamily: "ChairoSans",
        fontSize: 12,
        lineHeight: 17,
        color: "#B42318",
    },
    deleteInlineButton: {
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 12,
        backgroundColor: "#EF4444",
        alignItems: "center",
        justifyContent: "center",
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
        fontSize: 24,
        fontFamily: "ChairoSans",
    },
    userEmail: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 13,
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
        justifyContent: "center",
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
        justifyContent: "center",
    },
    ctaText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontFamily: "ChairoSans",
    },
    addressTitle: {
        color: "#FFFFFF",
        fontSize: 24,
        fontFamily: "ChairoSans",
        lineHeight: 28,
    },
    addressText: {
        color: "rgba(255,255,255,0.82)",
        fontSize: 14,
        fontFamily: "ChairoSans",
    },
    addressMeta: {
        color: "rgba(255,255,255,0.82)",
        fontSize: 13,
        fontFamily: "ChairoSans",
    },
    addressCard: {
        rowGap: 10,
    },
    addressRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
    },
    addressContent: {
        flex: 1,
        rowGap: 7,
        minWidth: 0,
    },
    addressTextGroup: {
        rowGap: 1,
    },
    addressIllustrationWrap: {
        width: 78,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "stretch",
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
    sectionCardWeb: {
        borderRadius: 28,
        padding: 20,
    },
    sectionCardShadow: {
        ...makeShadow({
            color: "#0F172A",
            offsetY: 10,
            blurRadius: 22,
            opacity: 0.06,
            elevation: 4,
        }),
    },
    sectionCardShadowWeb: {
        ...makeShadow({
            color: "#0F172A",
            offsetY: 14,
            blurRadius: 28,
            opacity: 0.07,
            elevation: 5,
        }),
    },
    guestCard: {
        width: "100%",
        maxWidth: 420,
        paddingVertical: 28,
        alignItems: "center",
        rowGap: 16,
    },
    guestViewport: {
        flex: 1,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    guestTitle: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        lineHeight: 24,
        color: "#0F172A",
        textAlign: "center",
    },
    guestBody: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
        color: "#475569",
        textAlign: "center",
    },
    guestButton: {
        width: "100%",
        marginTop: 8,
        borderRadius: 999,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: "#FE8C00",
        alignItems: "center",
        justifyContent: "center",
    },
    guestButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 20,
        color: "#FFFFFF",
        textAlign: "center",
    },
    orderItemCard: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        backgroundColor: "#FFFFFF",
    },
    orderItemCardWeb: {
        borderRadius: 22,
        padding: 18,
        borderColor: "#E2E8F0",
    },
    orderItemCardShadow: {
        ...makeShadow({
            color: "#0F172A",
            offsetY: 6,
            blurRadius: 12,
            opacity: 0.05,
            elevation: 3,
        }),
    },
    orderItemCardShadowWeb: {
        ...makeShadow({
            color: "#0F172A",
            offsetY: 10,
            blurRadius: 20,
            opacity: 0.06,
            elevation: 4,
        }),
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
        fontSize: 15,
        color: "#0F172A",
    },
    accountDesc: {
        fontFamily: "ChairoSans",
        fontSize: 13,
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
    deleteAccountCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: "#FFF5F5",
        borderWidth: 1,
        borderColor: "#FECACA",
        rowGap: 12,
    },
    deleteAccountTitle: {
        fontFamily: "ChairoSans",
        fontSize: 18,
        color: "#7F1D1D",
    },
    deleteAccountBody: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 20,
        color: "#991B1B",
    },
    deleteAccountButton: {
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 12,
        backgroundColor: "#DC2626",
        alignItems: "center",
        justifyContent: "center",
    },
    deleteAccountButtonDisabled: {
        opacity: 0.7,
    },
    deleteAccountButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 15,
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
        fontSize: 13,
        lineHeight: 18,
        fontFamily: "ChairoSans",
    },
    editHeaderHero: {
        position: "relative",
        padding: 20,
        minHeight: 146,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
    },
    editHeaderCopy: {
        flex: 1,
        minWidth: 0,
        rowGap: 4,
        paddingRight: 66,
    },
    editHeaderImageWrap: {
        position: "absolute",
        right: 10,
        bottom: 18,
        width: 58,
        height: 78,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
});

const formatCurrency = (value?: number | string) => {
    const amount = Number(value ?? 0);
    if (Number.isNaN(amount)) return "₺0.00";
    return `₺${amount.toFixed(2)}`;
};

const normalizeStatus = (status?: string): OrderStatus => {
    const raw = String(status || "").trim().toLowerCase();
    if (!raw) return "pending";
    if (isCancelledStatus(raw)) return "canceled";
    if (isReviewableStatus(raw)) return "delivered";
    if (raw === "accepted") return "preparing";
    if (["pending", "preparing", "ready", "out_for_delivery", "delivered", "canceled"].includes(raw)) {
        return raw as OrderStatus;
    }
    return "pending";
};

const getActiveOrderStep = (status: OrderStatus) => {
    if (status === "preparing") return 2;
    if (status === "ready" || status === "out_for_delivery") return 3;
    if (status === "delivered") return 4;
    return 0;
};

const formatProfileEta = (order: any, isTurkish: boolean) => {
    const etaMin = Number(order?.etaMin ?? order?.deliveryEtaMin);
    const etaMax = Number(order?.etaMax ?? order?.deliveryEtaMax);
    if (Number.isFinite(etaMin) && Number.isFinite(etaMax) && etaMin > 0 && etaMax > 0) {
        return `${isTurkish ? "Tahmini" : "Estimated"} ${Math.round(etaMin)}-${Math.round(etaMax)} ${isTurkish ? "dk" : "min"}`;
    }

    const eta = Number(order?.etaMinutes ?? order?.eta);
    if (Number.isFinite(eta) && eta > 0 && eta < 180) {
        const rounded = Math.max(10, Math.round(eta / 5) * 5);
        return `${isTurkish ? "Tahmini" : "Estimated"} ${Math.max(10, rounded - 5)}-${rounded + 5} ${isTurkish ? "dk" : "min"}`;
    }

    return isTurkish ? "Tahmini 25-35 dk" : "Estimated 25-35 min";
};

type OrderSummaryItem = {
    name: string;
    quantity: number;
};

const resolveItems = (order: any): OrderSummaryItem[] => {
    const rawItems = Array.isArray(order?.orderItems) ? order.orderItems : Array.isArray(order?.items) ? order.items : [];
    return rawItems.map((item: any) => ({
        name: item?.name ?? "-",
        quantity: Number(item?.quantity ?? 1),
    }));
};

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

const formatProfileOrderDate = (value: any, isTurkish: boolean) => {
    if (!value) return "";
    const date =
        typeof value === "object" && "seconds" in value
            ? new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000)
            : new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat(isTurkish ? "tr-TR" : "en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    })
        .format(date)
        .replace(",", " •");
};

const Profile = () => {
    useWebDocumentTitle();
    const navigation = useNavigation<ManageAddressesNavigation>();
    const { user, isAuthenticated, setUser, resetAuthState } = useAuthStore();
    const clearCart = useCartStore((s) => s.clearCart);
    const { defaultAddress } = useDefaultAddress();
    const { t, i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useStableWindowDimensions();
    const safeTop = Math.max(insets.top, 12);
    const isWeb = Platform.OS === "web";
    const guestTabBarOffset = Platform.OS === "web" ? 0 : 74 + Math.max(insets.bottom, 10) + 26;
    const guestViewportHeight = Math.max(windowHeight - safeTop - guestTabBarOffset, 0);
    const guestVisualCenterOffset = Math.max((guestTabBarOffset - safeTop) / 2, 0) + 48;

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

    const TrackingIllustration = profileIllustrations.tracking;
    const EditHeaderIllustration =
        profileIllustrations.courierHero || profileIllustrations.foodieCelebration || profileIllustrations.tracking;

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

    const loadUserOrders = useCallback(async () => {
        if (!userId) {
            setOrders([]);
            return;
        }

        try {
            const list = await fetchUserOrders(userId);
            void autoCancelExpiredPendingOrders(list || [], {
                inFlightIds: autoCancelingProfileOrderIds,
                onError: (error) => {
                    console.warn("[orders] Failed to auto-cancel expired pending order from profile", error);
                },
            });
            setOrders(list || []);
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
            return subscribeUserOrders(userId, (nextOrders) => {
                void autoCancelExpiredPendingOrders(nextOrders || [], {
                    inFlightIds: autoCancelingProfileOrderIds,
                    onError: (error) => {
                        console.warn("[orders] Failed to auto-cancel expired pending order from profile", error);
                    },
                });
                setOrders(nextOrders || []);
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
        } catch (error: any) {
            Alert.alert("Unable to sign out", error?.message || "Please try again.");
        } finally {
            setSigningOut(false);
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

    if (!isAuthenticated) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50" edges={["left", "right", "bottom"]}>
                <View
                    style={[
                        ui.guestViewport,
                        {
                            paddingTop: safeTop,
                            paddingBottom: guestTabBarOffset,
                            minHeight: guestViewportHeight || undefined,
                            transform: [{ translateY: guestVisualCenterOffset }],
                        },
                    ]}
                >
                    <View
                        className="secondary-card items-center"
                        style={[ui.sectionCard, ui.sectionCardShadow, ui.guestCard]}
                    >
                        {profileIllustrations.courierHero ? <profileIllustrations.courierHero width={120} height={120} /> : null}
                        <Text style={ui.guestTitle}>{guestCopy.title}</Text>
                        <Text style={ui.guestBody}>{guestCopy.body}</Text>
                        <TouchableOpacity
                            style={ui.guestButton}
                            onPress={() => router.push("/sign-in")}
                        >
                            <Text style={ui.guestButtonText}>{guestCopy.cta}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-50" edges={["left", "right", "bottom"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160, paddingTop: safeTop }}>
                <View className="px-5 gap-6" style={ui.pageContent}>
                    <View style={ui.topHeaderRow}>
                        <View>
                            <Text style={ui.screenTitle}>{isTurkish ? "Profilim" : "My Profile"}</Text>
                            <Text style={ui.screenSubtitle}>
                                {isTurkish ? "Hesabını yönet ve siparişlerini takip et." : "Manage your account and track your orders."}
                            </Text>
                        </View>
                        <View style={ui.topHeaderActions}>
                            <Pressable style={ui.topIconButton} onPress={() => setIsEditingProfile(true)}>
                                <Ionicons name="settings-outline" size={22} color="#0F172A" />
                            </Pressable>
                            <Pressable style={ui.topIconButton} onPress={() => setNotifModalVisible(true)}>
                                <Ionicons name="notifications-outline" size={22} color="#0F172A" />
                            </Pressable>
                        </View>
                    </View>

                    <View style={ui.profileCard}>
                        <View style={ui.profileCardTop}>
                            <View style={ui.profileAvatar}>
                                <Text style={ui.profileAvatarText}>{initials.slice(0, 1)}</Text>
                            </View>
                            <View style={ui.profileIdentity}>
                                <Text style={ui.profileName}>{user?.name || "Hungrie Student"}</Text>
                                <Text style={ui.profileEmail}>{user?.email || "student@campus.edu"}</Text>
                            </View>
                            <TouchableOpacity style={ui.editButton} onPress={() => setIsEditingProfile(true)}>
                                <Text style={ui.editButtonText}>{t("profile.header.edit")}</Text>
                                <Ionicons name="create-outline" size={16} color="#F97316" />
                            </TouchableOpacity>
                        </View>

                        <View style={ui.profileDivider} />

                        <TouchableOpacity style={ui.signOutRow} disabled={signingOut} onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                            <Text style={ui.signOutTextInline}>
                                {signingOut ? t("profile.header.signingOut") : t("profile.header.signOut")}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[ui.card, ui.addressCard, ui.addressModernCard]}>
                        <View style={ui.addressRow}>
                            <View style={ui.addressContent}>
                                <View style={ui.addressKickerRow}>
                                    <Ionicons name="location-sharp" size={15} color="#FF6A00" />
                                    <Text style={ui.addressKicker}>{t("profile.defaultAddress")}</Text>
                                </View>
                                {defaultAddress ? (
                                    <View style={ui.addressTextGroup}>
                                        <Text style={ui.addressModernTitle} numberOfLines={1}>
                                            {defaultAddress.label}
                                        </Text>
                                        {addressLineOne ? (
                                            <Text style={ui.addressModernMeta} numberOfLines={1}>
                                                {addressLineOne}
                                            </Text>
                                        ) : null}
                                        {addressLineTwo ? (
                                            <Text style={ui.addressModernMeta} numberOfLines={1}>
                                                {addressLineTwo}
                                            </Text>
                                        ) : null}
                                    </View>
                                ) : (
                                    <Text style={ui.addressModernMeta} numberOfLines={2}>
                                        {t("profile.noAddress")}
                                    </Text>
                                )}

                                <TouchableOpacity
                                    style={ui.addressManageButton}
                                    onPress={handleManageAddressesPress}
                                >
                                    <Ionicons name="location-outline" size={14} color="#FFFFFF" />
                                    <Text style={ui.addressManageButtonText}>
                                        {t("profile.manageAddresses")}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={ui.addressIllustrationWrap}>
                                <TrackingIllustration width={70} height={70} />
                            </View>
                        </View>
                    </View>

                    <View style={ui.activeOrdersSection}>
                        <View style={[ui.modernSectionHeader, ui.activeOrdersHeader]}>
                            <Text style={ui.modernSectionTitle}>{t("profile.activeOrders")}</Text>
                            <TouchableOpacity onPress={() => router.push("/orders")} style={ui.linkButtonRow}>
                                <Text style={ui.linkButtonText}>{isTurkish ? "Tümünü gör" : "See all"}</Text>
                                <Ionicons name="chevron-forward" size={15} color="#F97316" />
                            </TouchableOpacity>
                        </View>

                        <View style={ui.modernSectionCard}>
                            {activeOrders.length ? (
                                activeOrders.slice(0, 1).map((order: any) => {
                                const norm = normalizeStatus(order.status);
                                const label = t(`status.${norm}` as const);
                                const restaurantName = resolveRestaurantName(order) || t("orders.unknownRestaurant");
                                const restaurantSeed = resolveRestaurantSeed(order);
                                const logoSource = getRestaurantImageSource(
                                    order?.restaurant?.imageUrl || order?.restaurant?.image_url || order?.imageUrl || restaurantSeed?.imageUrl,
                                    undefined,
                                    `${normalizeId(order?.restaurantId)} ${restaurantName}`,
                                );
                                const activeStep = getActiveOrderStep(norm);
                                const etaLabel = formatProfileEta(order, isTurkish);
                                const orderDate = formatProfileOrderDate(order.updatedAt || order.createdAt, isTurkish);
                                const progressSteps = [
                                    {
                                        label: isTurkish ? "Yanıt bekliyor" : "Waiting",
                                        icon: "time-outline" as const,
                                    },
                                    {
                                        label: isTurkish ? "Alındı" : "Received",
                                        icon: "checkmark-circle-outline" as const,
                                    },
                                    {
                                        label: isTurkish ? "Hazırlanıyor" : "Preparing",
                                        icon: "restaurant-outline" as const,
                                    },
                                    {
                                        label: isTurkish ? "Yolda" : "On the way",
                                        icon: "bicycle-outline" as const,
                                    },
                                    {
                                        label: isTurkish ? "Teslim edildi" : "Delivered",
                                        icon: "cube-outline" as const,
                                    },
                                ];
                                const progressDenominator = Math.max(progressSteps.length - 1, 1);
                                const progressFill = `${Math.min(100, Math.max(0, (activeStep / progressDenominator) * 100))}%` as DimensionValue;
                                const openOrder = () =>
                                    router.push({
                                        pathname: "/order/pending",
                                        params: {
                                            orderId: order.id,
                                            restaurantName: resolveRestaurantName(order),
                                            eta: String(order.eta || order.etaMinutes || 120),
                                        },
                                    });

                                return (
                                    <TouchableOpacity
                                        key={order.id}
                                        activeOpacity={0.9}
                                        style={ui.activeOrderCard}
                                        onPress={openOrder}
                                    >
                                        <View style={ui.activeOrderTopRow}>
                                            <View style={ui.activeRestaurantLogoShell}>
                                                <View style={ui.activeRestaurantLogo}>
                                                    <Image source={logoSource} style={ui.activeRestaurantLogoImage} contentFit="cover" />
                                                </View>
                                            </View>

                                            <View style={ui.activeOrderInfo}>
                                                <Text style={ui.activeOrderName} numberOfLines={1}>
                                                    {restaurantName}
                                                </Text>
                                                <View style={ui.activeOrderMetaRow}>
                                                    <View style={ui.activeStatusPill}>
                                                        <Text style={ui.activeStatusPillText}>{label}</Text>
                                                    </View>
                                                    <View style={ui.activeDateRow}>
                                                        <Ionicons name="time-outline" size={13} color="#98A2B3" />
                                                        <Text style={ui.activeEtaText} numberOfLines={1}>
                                                            {etaLabel}
                                                        </Text>
                                                    </View>
                                                </View>
                                                {orderDate ? (
                                                    <View style={ui.activeDateRow}>
                                                        <Ionicons name="calendar-outline" size={13} color="#98A2B3" />
                                                        <Text style={ui.activeDateText}>
                                                            {orderDate}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                            </View>

                                            <TouchableOpacity style={ui.trackOrderButton} onPress={openOrder}>
                                                <Text style={ui.trackOrderButtonText}>
                                                    {isTurkish ? "Siparişi takip et" : "Track order"}
                                                </Text>
                                                <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={ui.activeProgressRow}>
                                            <View style={ui.activeProgressLine} />
                                            <View style={[ui.activeProgressLineFill, { width: progressFill }]} />
                                            {progressSteps.map((step, index) => {
                                                const isDone = index < activeStep;
                                                const isCurrent = index === activeStep;
                                                const iconColor = isCurrent ? "#FFFFFF" : isDone ? "#FF6A00" : "#98A2B3";
                                                return (
                                                    <View key={step.label} style={ui.activeProgressStep}>
                                                        <View
                                                            style={[
                                                                ui.activeProgressDot,
                                                                isDone ? ui.activeProgressDotDone : null,
                                                                isCurrent ? ui.activeProgressDotCurrent : null,
                                                            ]}
                                                        >
                                                            <Ionicons name={step.icon} size={18} color={iconColor} />
                                                        </View>
                                                        <Text
                                                            style={[
                                                                ui.activeProgressLabel,
                                                                isDone ? ui.activeProgressLabelDone : null,
                                                                isCurrent ? ui.activeProgressLabelCurrent : null,
                                                            ]}
                                                            numberOfLines={1}
                                                        >
                                                            {step.label}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </TouchableOpacity>
                                    );
                                })
                            ) : (
                                <View style={ui.activeOrderEmptyState}>
                                    <View style={ui.emptyBagBubble}>
                                        <Ionicons name="bag-handle-outline" size={22} color="#F97316" />
                                    </View>
                                    <View style={ui.activeOrderEmptyCopy}>
                                        <Text style={ui.activeOrderTitle}>{t("profile.noActiveOrders")}</Text>
                                        <Text style={ui.activeOrderBody}>
                                            {isTurkish ? "Lezzetli bir şeyler sipariş vermeye ne dersin?" : "How about ordering something tasty?"}
                                        </Text>
                                        <TouchableOpacity style={[ui.orangeCta, ui.orangeCtaInline]} onPress={() => router.push("/search")}>
                                            <Text style={ui.orangeCtaText}>{isTurkish ? "Restoranlara göz at" : "Browse restaurants"}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    </View>

                    <OrderHistorySection orders={orders} />

                    <View style={ui.modernSectionCard}>
                        <Text style={ui.modernSectionTitle}>{t("profile.accountActions")}</Text>
                        <View style={ui.accountList}>
                            {[
                                ...(ownedRestaurantId
                                    ? [
                                          {
                                              label: isTurkish ? "Restoran paneli" : "Restaurant panel",
                                              description: isTurkish ? "Restoran siparişlerini ve menünü yönet." : "Manage restaurant orders and menu.",
                                              action: () => router.push("/restaurantpanel"),
                                              icon: "storefront-outline" as const,
                                          },
                                      ]
                                    : []),
                                {
                                    label: t("profileExtras.actions.notifications.label"),
                                    description: t("profileExtras.actions.notifications.description"),
                                    action: () => setNotifModalVisible(true),
                                    icon: "notifications-outline" as const,
                                },
                                {
                                    label: t("profileExtras.actions.privacy.label"),
                                    description: t("profileExtras.actions.privacy.description"),
                                    action: () => router.push("/privacy"),
                                    icon: "shield-checkmark-outline" as const,
                                },
                                {
                                    label: t("profileExtras.actions.terms.label"),
                                    description: t("profileExtras.actions.terms.description"),
                                    action: () => router.push("/terms"),
                                    icon: "document-text-outline" as const,
                                },
                                {
                                    label: t("profileExtras.actions.help.label"),
                                    description: t("profileExtras.actions.help.description"),
                                    action: () => router.push("/support"),
                                    icon: "headset-outline" as const,
                                },
                                {
                                    label: t("profileExtras.actions.history.label"),
                                    description: t("profileExtras.actions.history.description"),
                                    action: () => router.push("/orders"),
                                    icon: "time-outline" as const,
                                },
                            ].map((item, index, array) => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[ui.accountListRow, index === array.length - 1 ? { borderBottomWidth: 0 } : null]}
                                    onPress={item.action}
                                >
                                    <View style={ui.accountListIcon}>
                                        <Ionicons name={item.icon} size={20} color="#F97316" />
                                    </View>
                                    <View style={ui.accountListTextWrap}>
                                        <Text style={ui.accountListTitle}>{item.label}</Text>
                                        <Text style={ui.accountListBody}>{item.description}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={ui.deleteInlineCard}>
                        <View style={ui.deleteInlineCopy}>
                            <Text style={ui.deleteInlineTitle}>{t("profileExtras.deleteProfile.title", "Delete profile")}</Text>
                            <Text style={ui.deleteInlineBody}>
                                {t(
                                    "profileExtras.deleteProfile.description",
                                    "Permanently remove your account and profile data from Hungrie.",
                                )}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[ui.deleteInlineButton, deletingProfile ? ui.deleteAccountButtonDisabled : null]}
                            disabled={deletingProfile}
                            onPress={handleDeleteProfile}
                        >
                            <Text style={ui.deleteAccountButtonText}>
                                {deletingProfile
                                    ? t("profileExtras.deleteProfile.deleting", "Deleting...")
                                    : t("profileExtras.deleteProfile.cta", "Delete profile")}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* EDIT PROFILE - database (updateUserProfile + whatsapp), design modal */}
            <Modal transparent animationType="fade" visible={isEditingProfile} onRequestClose={() => setIsEditingProfile(false)}>
                <View className="flex-1 bg-black/40 justify-center px-5" style={ui.editModalOverlay}>
                    <View className="bg-white rounded-3xl overflow-hidden shadow-2xl" style={ui.editModalCard}>
                        <LinearGradient
                            colors={["#0B1220", "#0E1A36"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0.8 }}
                            style={ui.editHeaderHero}
                        >
                            <View style={ui.editHeaderCopy}>
                                <Text
                                    className="text-white/60 tracking-[5px] uppercase text-[11px]"
                                    style={ui.editHeaderKicker}
                                    numberOfLines={1}
                                >
                                    {t("profile.header.edit")}
                                </Text>
                                <Text
                                    className="text-white text-2xl font-ezra-bold leading-7"
                                    style={ui.editHeaderTitle}
                                    numberOfLines={2}
                                >
                                    {t("profileExtras.editModal.title")}
                                </Text>
                                <Text
                                    className="body-medium text-white/75"
                                    style={ui.editHeaderSubtitle}
                                    numberOfLines={2}
                                >
                                    {t("profileExtras.editModal.subtitle")}
                                </Text>
                            </View>
                            {EditHeaderIllustration ? (
                                <View style={ui.editHeaderImageWrap}>
                                    <EditHeaderIllustration width={70} height={70} />
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
                        <Image source={profileImages.deliveryReview} style={notificationUi.heroImage} contentFit="cover" />
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
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");

    const getMillis = (value: any) => {
        if (!value) return 0;
        if (typeof value === "object" && "seconds" in value) {
            return value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
        }
        const d = new Date(value);
        const ms = d.getTime();
        return Number.isNaN(ms) ? 0 : ms;
    };

    const sortedOrders = useMemo(() => {
        return (orders || [])
            .sort((a, b) => {
                const da = getMillis(a.updatedAt || a.createdAt || 0);
                const db = getMillis(b.updatedAt || b.createdAt || 0);
                return db - da;
            });
    }, [orders]);
    const recentOrder = sortedOrders[0];
    const normStatus = recentOrder ? normalizeStatus(recentOrder.status) : null;
    const badge = normStatus ? ORDER_STATUS_COLORS[normStatus] : null;
    const label = normStatus ? t(`status.${normStatus}` as const) : "";
    const items = recentOrder ? resolveItems(recentOrder) : [];
    const restaurantName = recentOrder ? resolveRestaurantName(recentOrder) || t("orders.unknownRestaurant") : "";
    const orderTotal = recentOrder ? formatCurrency(recentOrder.total) : "";

    return (
        <View style={ui.historySection}>
            <View style={[ui.modernSectionHeader, ui.historyHeader]}>
                <Text style={ui.modernSectionTitle}>{t("orders.historyTitle")}</Text>
                <TouchableOpacity onPress={() => router.push("/orders")} style={ui.linkButtonRow}>
                    <Text style={ui.linkButtonText}>{isTurkish ? "Tümünü gör" : "See all"}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#F97316" />
                </TouchableOpacity>
            </View>

            <View style={ui.historyCard}>
                {recentOrder ? (
                <TouchableOpacity style={ui.historyRow} onPress={() => router.push("/orders")} activeOpacity={0.88}>
                    <View style={ui.historyTextWrap}>
                        <Text style={ui.historyRestaurantName}>{restaurantName}</Text>
                        <Text style={ui.historyMeta}>{formatProfileOrderDate(recentOrder.updatedAt || recentOrder.createdAt, isTurkish)}</Text>
                        <Text style={ui.historyMeta}>
                            {`${items.length || 0} ${isTurkish ? "ürün" : items.length === 1 ? "item" : "items"} • `}
                            <Text style={ui.historyPrice}>{orderTotal}</Text>
                        </Text>
                    </View>
                    <View style={ui.historyStatusWrap}>
                        {badge ? (
                            <View style={[ui.compactStatusPill, { backgroundColor: badge.bg }]}>
                                <Ionicons
                                    name={normStatus === "delivered" ? "checkmark-circle-outline" : "ellipse"}
                                    size={13}
                                    color={badge.text}
                                />
                                <Text style={[ui.compactStatusText, { color: badge.text }]}>{label}</Text>
                            </View>
                        ) : null}
                        <View style={ui.historyArrowWrap}>
                            <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
                        </View>
                    </View>
                </TouchableOpacity>
                ) : (
                    <Text style={ui.activeOrderBody}>{t("orders.emptyHistory")}</Text>
                )}
            </View>
        </View>
    );
};

export default Profile;

import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ListRenderItem,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { Address } from "@/src/domain/types";
import { useTheme } from "@/src/theme/themeContext";
import AddressCard from "./AddressCard";
import { useAddressActions, useAddresses } from "./hooks";
import type { ManageAddressesNavigation } from "./types";

const ORANGE = "#FF5A00";
const FOOTER_HEIGHT = 82;

const ManageAddressesScreen = () => {
    const navigation = useNavigation<ManageAddressesNavigation>();
    const insets = useSafeAreaInsets();
    const { addresses, isLoading } = useAddresses();
    const { removeAddress, setDefaultAddress } = useAddressActions();
    const { t } = useTranslation();
    const { variant } = useTheme();
    const styles = useMemo(() => createStyles(variant === "dark"), [variant]);

    const navigateToForm = useCallback(
        (addressId?: string) => {
            navigation.navigate("AddressForm", addressId ? { addressId } : undefined);
        },
        [navigation],
    );

    const confirmDelete = useCallback(
        (address: Address) => {
            Alert.alert(
                t("address.manage.confirmDeleteTitle"),
                t("address.manage.confirmDeleteBody", { label: address.label }),
                [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                        text: t("common.delete"),
                        style: "destructive",
                        onPress: () => {
                            removeAddress(address.id).catch((error) => {
                                Alert.alert(t("address.manage.deleteError"), error?.message ?? t("misc.manageSoon"));
                            });
                        },
                    },
                ],
                { cancelable: true },
            );
        },
        [removeAddress, t],
    );

    const handleSetDefault = useCallback(
        (address: Address) => {
            if (address.isDefault) return;
            setDefaultAddress(address.id).catch((error) => {
                Alert.alert(t("address.manage.updateDefaultError"), error?.message ?? t("misc.manageSoon"));
            });
        },
        [setDefaultAddress, t],
    );

    const renderAddress: ListRenderItem<Address> = ({ item, index }) => (
        <AddressCard
            address={item}
            isFirst={index === 0}
            isLast={index === addresses.length - 1}
            onDelete={() => confirmDelete(item)}
            onEdit={() => navigateToForm(item.id)}
            onSetDefault={() => handleSetDefault(item)}
        />
    );

    const renderEmpty = () => {
        if (isLoading) {
            return (
                <View style={styles.loadingGroup}>
                    <ActivityIndicator color={ORANGE} />
                </View>
            );
        }
        return (
            <View style={styles.emptyState}>
                <Ionicons color={styles.secondary.color} name="location-outline" size={31} />
                <Text style={styles.emptyTitle}>{t("address.manage.emptyTitle")}</Text>
                <Text style={styles.emptySubtitle}>{t("address.manage.emptySubtitle")}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
            <View style={styles.header}>
                <Pressable
                    accessibilityLabel={t("common.goBack")}
                    accessibilityRole="button"
                    hitSlop={4}
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <Ionicons color={styles.primary.color} name="chevron-back" size={20} />
                </Pressable>
                <Text numberOfLines={1} style={styles.headerTitle}>{t("address.manage.title")}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <FlatList
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: FOOTER_HEIGHT + insets.bottom + 16 },
                    !addresses.length && styles.emptyListContent,
                ]}
                data={addresses}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmpty}
                renderItem={renderAddress}
                showsVerticalScrollIndicator={false}
            />

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                <Pressable
                    accessibilityLabel={t("address.manage.addNew")}
                    accessibilityRole="button"
                    onPress={() => navigateToForm()}
                    style={styles.primaryButton}
                >
                    <Ionicons color="#FFFFFF" name="add" size={20} />
                    <Text style={styles.primaryButtonText}>{t("address.manage.addNew")}</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
};

const createStyles = (dark: boolean) => {
    const colors = {
        page: dark ? "#0F1115" : "#FAFBFC",
        surface: dark ? "#171A20" : "#FFFFFF",
        primary: dark ? "#F5F7FA" : "#111318",
        secondary: dark ? "#98A2B3" : "#667085",
        border: dark ? "#2A2E35" : "#EAECF0",
        pressed: dark ? "#22262E" : "#F5F6F8",
    };

    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.page },
        primary: { color: colors.primary },
        secondary: { color: colors.secondary },
        header: { height: 54, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", backgroundColor: colors.page },
        backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
        headerTitle: { flex: 1, color: colors.primary, fontSize: 21, lineHeight: 26, fontWeight: "700", textAlign: "center" },
        headerSpacer: { width: 44, height: 44 },
        listContent: { paddingHorizontal: 22, paddingTop: 20 },
        emptyListContent: { flexGrow: 1 },
        loadingGroup: { minHeight: 90, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
        emptyState: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
        emptyTitle: { marginTop: 12, color: colors.primary, fontSize: 16, lineHeight: 21, fontWeight: "600", textAlign: "center" },
        emptySubtitle: { maxWidth: 280, marginTop: 5, color: colors.secondary, fontSize: 13.5, lineHeight: 19, textAlign: "center" },
        footer: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: FOOTER_HEIGHT, paddingTop: 14, paddingHorizontal: 22, backgroundColor: colors.page, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        primaryButton: { height: 54, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: ORANGE },
        primaryButtonText: { color: "#FFFFFF", fontSize: 16, lineHeight: 20, fontWeight: "600" },
    });
};

export default ManageAddressesScreen;

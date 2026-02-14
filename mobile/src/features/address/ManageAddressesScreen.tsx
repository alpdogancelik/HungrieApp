import { useCallback } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ListRenderItem,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { Address } from "@/src/domain/types";
import { images } from "@/constants/mediaCatalog";
import Icon from "@/components/Icon";
import AddressCard from "./AddressCard";
import { useAddressActions, useAddresses } from "./hooks";
import type { ManageAddressesNavigation } from "./types";

const ManageAddressesScreen = () => {
    const navigation = useNavigation<ManageAddressesNavigation>();
    const { addresses, isLoading } = useAddresses();
    const { removeAddress, setDefaultAddress } = useAddressActions();
    const { t } = useTranslation();

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

    const renderAddress: ListRenderItem<Address> = ({ item }) => (
        <AddressCard
            address={item}
            onEdit={() => navigateToForm(item.id)}
            onDelete={() => confirmDelete(item)}
            onSetDefault={() => handleSetDefault(item)}
        />
    );

    const renderEmpty = () => {
        if (isLoading) {
            return (
                <View style={styles.loadingState}>
                    <ActivityIndicator color="#FE8C00" />
                </View>
            );
        }
        return (
            <View style={styles.emptyState}>
                <Image source={images.deliveryProcess} style={styles.emptyImage} contentFit="cover" />
                <Text style={styles.emptyTitle}>{t("address.manage.emptyTitle")}</Text>
                <Text style={styles.emptySubtitle}>{t("address.manage.emptySubtitle")}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={() => navigateToForm()}>
                    <Text style={styles.primaryButtonText}>{t("address.manage.addNew")}</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("common.goBack")}
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Icon name="arrowBack" size={18} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t("address.manage.title")}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <FlatList
                data={addresses}
                renderItem={renderAddress}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, flexGrow: 1 }}
                ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
                ListEmptyComponent={renderEmpty}
            />

            {addresses.length ? (
                <View style={styles.footer}>
                    <TouchableOpacity style={[styles.primaryButton, styles.footerButton]} onPress={() => navigateToForm()}>
                        <Text style={styles.primaryButtonText}>{t("address.manage.addNew")}</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#F7F8FA",
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "700",
        color: "#111827",
    },
    headerSpacer: {
        width: 40,
        height: 40,
    },
    itemSeparator: {
        height: 12,
    },
    loadingState: {
        paddingVertical: 80,
        alignItems: "center",
    },
    emptyState: {
        alignItems: "center",
        paddingHorizontal: 32,
        paddingVertical: 64,
        rowGap: 16,
    },
    emptyImage: {
        width: 192,
        height: 192,
    },
    emptyTitle: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "700",
        color: "#111827",
        textAlign: "center",
    },
    emptySubtitle: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: "500",
        color: "#6B7280",
        textAlign: "center",
    },
    primaryButton: {
        backgroundColor: "#FE8C00",
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 32,
    },
    footerButton: {
        paddingVertical: 16,
    },
    primaryButtonText: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});

export default ManageAddressesScreen;

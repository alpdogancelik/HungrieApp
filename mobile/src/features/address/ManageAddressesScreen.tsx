import { useCallback } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ListRenderItem,
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
                <View className="py-20 items-center">
                    <ActivityIndicator color="#FE8C00" />
                </View>
            );
        }
        return (
            <View className="items-center px-8 py-16 gap-4">
                <Image source={images.deliveryProcess} className="w-48 h-48" contentFit="cover" />
                <Text className="h4-bold text-dark-100 text-center">{t("address.manage.emptyTitle")}</Text>
                <Text className="body-medium text-dark-60 text-center">{t("address.manage.emptySubtitle")}</Text>
                <TouchableOpacity className="hero-cta px-8 py-4 rounded-full" onPress={() => navigateToForm()}>
                    <Text className="paragraph-semibold text-white">{t("address.manage.addNew")}</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("common.goBack")}
                    className="size-10 rounded-full bg-white items-center justify-center border border-gray-100"
                    onPress={() => navigation.goBack()}
                >
                    <Icon name="arrowBack" size={18} color="#0F172A" />
                </TouchableOpacity>
                <Text className="h4-bold text-dark-100">{t("address.manage.title")}</Text>
                <View className="size-10" />
            </View>

            <FlatList
                data={addresses}
                renderItem={renderAddress}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, flexGrow: 1 }}
                ItemSeparatorComponent={() => <View className="h-3" />}
                ListEmptyComponent={renderEmpty}
            />

            {addresses.length ? (
                <View className="px-5 pb-8">
                    <TouchableOpacity className="hero-cta items-center py-4" onPress={() => navigateToForm()}>
                        <Text className="paragraph-semibold text-white">{t("address.manage.addNew")}</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
        </SafeAreaView>
    );
};

export default ManageAddressesScreen;

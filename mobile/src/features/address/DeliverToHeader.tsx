import { useCallback, useEffect, useMemo, useState } from "react";
import { DeviceEventEmitter, FlatList, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import cn from "clsx";
import type { Address } from "@/src/domain/types";
import { addressStore } from "@/src/features/address/addressStore";
import { useDefaultAddress } from "@/src/features/address/hooks";

const renderAddressLine = (address: Address) =>
    [address.line1, address.block].filter(Boolean).join(", ") ||
    [address.city, address.country].filter(Boolean).join(", ");

const renderAddressDetail = (address: Address) => [address.room, address.city, address.country].filter(Boolean).join(", ");

const DeliverToHeader = () => {
    const { defaultAddress, addresses } = useDefaultAddress();
    const [sheetVisible, setSheetVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(defaultAddress?.id ?? null);
    const router = useRouter();
    const { t } = useTranslation();

    useEffect(() => {
        setSelectedId(defaultAddress?.id ?? null);
    }, [defaultAddress?.id]);

    const subtitle = defaultAddress ? renderAddressLine(defaultAddress) : t("deliverTo.subtitle");

    const handleUseAddress = useCallback(async () => {
        if (!selectedId) return;
        await addressStore.setDefault(selectedId);
        const updated = addresses.find((address) => address.id === selectedId);
        if (updated) {
            DeviceEventEmitter.emit("app/addressChanged", updated);
        }
        setSheetVisible(false);
    }, [addresses, selectedId]);

    const openManageAddresses = () => {
        setSheetVisible(false);
        router.push("/ManageAddresses");
    };

    const renderItem = useCallback(
        ({ item }: { item: Address }) => {
            const isSelected = item.id === selectedId;
            return (
                <Pressable
                    onPress={() => setSelectedId(item.id)}
                    className={cn(
                        "flex-row items-center gap-3 px-4 py-3 rounded-3xl border mb-3",
                        isSelected ? "border-primary bg-primary/5" : "border-gray-100 bg-white",
                    )}
                >
                    <View className="flex-1">
                        <Text className="paragraph-semibold text-dark-100">{item.label}</Text>
                        <Text className="body-medium text-dark-60" numberOfLines={1}>
                            {renderAddressLine(item)}
                        </Text>
                        {renderAddressDetail(item) ? (
                            <Text className="caption text-dark-40" numberOfLines={1}>
                                {renderAddressDetail(item)}
                            </Text>
                        ) : null}
                    </View>
                    <View
                        className="size-5 rounded-full border-2 items-center justify-center"
                        style={{ borderColor: isSelected ? "#FE8C00" : "#CBD5F5" }}
                    >
                        {isSelected ? <View className="size-3 rounded-full bg-primary" /> : null}
                    </View>
                </Pressable>
            );
        },
        [selectedId],
    );

    const keyExtractor = useCallback((item: Address) => item.id, []);

    const headerSubtitle = useMemo(() => subtitle || "", [subtitle]);

    return (
        <>
            <Pressable className="gap-1" onPress={() => setSheetVisible(true)}>
                <Text className="text-xs font-ezra-bold tracking-[2px] text-primary">
                    {t("deliverTo.eyebrow").toUpperCase()}
                </Text>
                <Text className="body-medium text-dark-60" numberOfLines={1}>
                    {headerSubtitle}
                </Text>
            </Pressable>

            <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
                <Pressable className="flex-1 bg-black/40" onPress={() => setSheetVisible(false)} />
                <View className="bg-white rounded-t-[32px] p-5 gap-4 max-h-[75%]">
                    <View className="h-1 w-16 bg-gray-200 rounded-full self-center" />
                    <Text className="h4-bold text-dark-100">{t("deliverTo.modalTitle")}</Text>
                    {addresses.length ? (
                        <FlatList
                            data={addresses}
                            keyExtractor={keyExtractor}
                            renderItem={renderItem}
                            contentContainerStyle={{ paddingBottom: 16 }}
                        />
                    ) : (
                        <View className="py-10 items-center gap-2">
                            <Text className="paragraph-semibold text-dark-80">{t("deliverTo.emptyTitle")}</Text>
                            <Text className="body-medium text-dark-60 text-center">{t("deliverTo.emptySubtitle")}</Text>
                        </View>
                    )}
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            className="flex-1 rounded-full border border-gray-200 py-3 items-center"
                            onPress={openManageAddresses}
                        >
                            <Text className="paragraph-semibold text-dark-80">{t("deliverTo.manage")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!selectedId}
                            className={cn(
                                "flex-1 rounded-full py-3 items-center",
                                selectedId ? "bg-primary" : "bg-gray-200",
                            )}
                            onPress={handleUseAddress}
                        >
                            <Text className="paragraph-semibold text-white">{t("deliverTo.useThis")}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
};

export default DeliverToHeader;


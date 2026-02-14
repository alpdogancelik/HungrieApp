import { useCallback, useEffect, useMemo, useState } from "react";
import { DeviceEventEmitter, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
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
                <Pressable onPress={() => setSelectedId(item.id)} style={[styles.addressItem, isSelected ? styles.addressItemSelected : styles.addressItemIdle]}>
                    <View style={styles.addressItemContent}>
                        <Text style={styles.addressLabel}>{item.label}</Text>
                        <Text style={styles.addressLine} numberOfLines={1}>
                            {renderAddressLine(item)}
                        </Text>
                        {renderAddressDetail(item) ? (
                            <Text style={styles.addressDetail} numberOfLines={1}>
                                {renderAddressDetail(item)}
                            </Text>
                        ) : null}
                    </View>
                    <View style={[styles.radioOuter, { borderColor: isSelected ? "#FE8C00" : "#CBD5E1" }]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
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
            <Pressable style={styles.headerTrigger} onPress={() => setSheetVisible(true)}>
                <Text style={styles.headerEyebrow}>
                    {t("deliverTo.eyebrow").toUpperCase()}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {headerSubtitle}
                </Text>
            </Pressable>

            <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
                <View style={styles.modalBackdrop}>
                    <Pressable style={styles.modalDismissArea} onPress={() => setSheetVisible(false)} />
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>{t("deliverTo.modalTitle")}</Text>
                    {addresses.length ? (
                        <FlatList
                            data={addresses}
                            keyExtractor={keyExtractor}
                            renderItem={renderItem}
                            contentContainerStyle={{ paddingBottom: 16 }}
                        />
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>{t("deliverTo.emptyTitle")}</Text>
                            <Text style={styles.emptySubtitle}>{t("deliverTo.emptySubtitle")}</Text>
                        </View>
                    )}
                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={styles.manageButton}
                            onPress={openManageAddresses}
                        >
                            <Text style={styles.manageButtonText}>{t("deliverTo.manage")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!selectedId}
                            style={[styles.useButton, selectedId ? styles.useButtonEnabled : styles.useButtonDisabled]}
                            onPress={handleUseAddress}
                        >
                            <Text style={styles.useButtonText}>{t("deliverTo.useThis")}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    headerTrigger: {
        rowGap: 4,
    },
    headerEyebrow: {
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 2,
        color: "#FE8C00",
        fontFamily: "ChairoSans-Bold",
    },
    headerSubtitle: {
        fontSize: 14,
        lineHeight: 20,
        color: "#475569",
        fontFamily: "ChairoSans",
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        justifyContent: "flex-end",
    },
    modalDismissArea: {
        flex: 1,
    },
    modalSheet: {
        maxHeight: "75%",
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 20,
        rowGap: 16,
    },
    modalHandle: {
        height: 4,
        width: 64,
        borderRadius: 999,
        backgroundColor: "#E5E7EB",
        alignSelf: "center",
    },
    modalTitle: {
        fontSize: 20,
        lineHeight: 24,
        color: "#111827",
        fontFamily: "ChairoSans-Bold",
    },
    addressItem: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 12,
    },
    addressItemSelected: {
        borderColor: "#FE8C00",
        backgroundColor: "rgba(254, 140, 0, 0.05)",
    },
    addressItemIdle: {
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
    },
    addressItemContent: {
        flex: 1,
    },
    addressLabel: {
        fontSize: 16,
        lineHeight: 22,
        color: "#111827",
        fontFamily: "ChairoSans-SemiBold",
    },
    addressLine: {
        fontSize: 14,
        lineHeight: 20,
        color: "#4B5563",
        fontFamily: "ChairoSans",
    },
    addressDetail: {
        fontSize: 12,
        lineHeight: 16,
        color: "#94A3B8",
        fontFamily: "ChairoSans",
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: "#FE8C00",
    },
    emptyState: {
        paddingVertical: 40,
        alignItems: "center",
        rowGap: 8,
    },
    emptyTitle: {
        fontSize: 16,
        lineHeight: 22,
        color: "#1F2937",
        fontFamily: "ChairoSans-SemiBold",
    },
    emptySubtitle: {
        fontSize: 14,
        lineHeight: 20,
        color: "#475569",
        textAlign: "center",
        fontFamily: "ChairoSans",
    },
    actionsRow: {
        flexDirection: "row",
        columnGap: 12,
    },
    manageButton: {
        flex: 1,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingVertical: 12,
        alignItems: "center",
    },
    manageButtonText: {
        fontSize: 16,
        lineHeight: 22,
        color: "#1F2937",
        fontFamily: "ChairoSans-SemiBold",
    },
    useButton: {
        flex: 1,
        borderRadius: 999,
        paddingVertical: 12,
        alignItems: "center",
    },
    useButtonEnabled: {
        backgroundColor: "#FE8C00",
    },
    useButtonDisabled: {
        backgroundColor: "#E5E7EB",
    },
    useButtonText: {
        fontSize: 16,
        lineHeight: 22,
        color: "#FFFFFF",
        fontFamily: "ChairoSans-SemiBold",
    },
});

export default DeliverToHeader;

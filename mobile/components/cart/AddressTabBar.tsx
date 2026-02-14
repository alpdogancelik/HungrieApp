import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Address } from "@/src/domain/types";

const ADDRESS_SKELETON_COUNT = 3;
const ADDRESS_SKELETONS = Array.from({ length: ADDRESS_SKELETON_COUNT }, (_, index) => index);

const ADDRESS_TAB_SKELETON_STYLE = {
    width: 90,
    height: 40,
    borderRadius: 9999,
    backgroundColor: "#E2E8F0",
    opacity: 0.6,
};
const styles = StyleSheet.create({
    root: { backgroundColor: "#F8F6F2", paddingVertical: 12, paddingHorizontal: 24 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    tabText: { fontFamily: "ChairoSans", fontSize: 15, color: "#1E293B" },
    addText: { fontFamily: "ChairoSans", fontSize: 15, color: "#FE8C00" },
});

type Props = {
    addresses?: Address[];
    loading: boolean;
    selectedAddressId: string;
    onSelect: (id: string | number) => void;
    onAddAddress: () => void;
};

const AddressTabBar = ({ addresses, loading, selectedAddressId, onSelect, onAddAddress }: Props) => {
    const list = addresses ?? [];
    const hasAddresses = list.length > 0;
    const tabContent = hasAddresses
        ? list.map((address) => {
              const isActive = String(address.id) === selectedAddressId;
              return (
                <TouchableOpacity
                    key={address.id}
                    className="px-4 py-2 rounded-full border"
                    style={[
                        styles.tab,
                        {
                            borderColor: isActive ? "#FE8C00" : "#CBD5F5",
                            backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF",
                        },
                    ]}
                    onPress={() => onSelect(address.id)}
                >
                    <Text className="paragraph-semibold text-dark-80" style={styles.tabText}>{address.label}</Text>
                </TouchableOpacity>
            );
        })
        : loading
            ? ADDRESS_SKELETONS.map((skeleton) => <View key={`address-tab-${skeleton}`} style={ADDRESS_TAB_SKELETON_STYLE} />)
            : [
                <TouchableOpacity
                    key="address-tab-empty"
                    className="px-4 py-2 rounded-full border border-dashed border-gray-300"
                    style={styles.tab}
                    onPress={onAddAddress}
                >
                    <Text className="paragraph-semibold text-primary" style={styles.addText}>Add address</Text>
                </TouchableOpacity>,
            ];

    return (
        <View className="bg-[#F8F6F2] py-3" style={styles.root}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {tabContent}
            </ScrollView>
        </View>
    );
};

export default AddressTabBar;

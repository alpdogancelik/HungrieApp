import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { Address } from "@/src/domain/types";
import { ADDRESS_PILL_SKELETON_STYLE, ADDRESS_SKELETONS } from "./addressConstants";
import Icon from "@/components/Icon";

type Props = {
    addresses?: Address[];
    loading: boolean;
    selectedAddressId: string;
    onSelect: (id: string | number) => void;
    onManageAddresses: () => void;
    onAddAddress: () => void;
};

const AddressSummary = ({
    addresses,
    loading,
    selectedAddressId,
    onSelect,
    onManageAddresses,
    onAddAddress,
}: Props) => {
    const list = addresses ?? [];
    const hasAddresses = list.length > 0;
    const activeLabel = list.find((addr) => String(addr.id) === selectedAddressId)?.label || "Select address";

    const addressChips = hasAddresses
        ? list.map((address) => {
              const isActive = String(address.id) === selectedAddressId;
              return (
                  <TouchableOpacity
                      key={address.id}
                      className="px-4 py-2 rounded-2xl border"
                      style={{
                          borderColor: isActive ? "#FF8C42" : "#E2E8F0",
                          backgroundColor: isActive ? "#FFF1E7" : "transparent",
                      }}
                      onPress={() => onSelect(address.id)}
                  >
                      <Text className="paragraph-semibold text-dark-80">{address.label}</Text>
                  </TouchableOpacity>
              );
          })
        : loading
            ? ADDRESS_SKELETONS.map((skeleton) => <View key={`address-pill-${skeleton}`} style={ADDRESS_PILL_SKELETON_STYLE} />)
            : [
                  <TouchableOpacity
                      key="add-address-pill"
                      className="px-4 py-2 rounded-2xl border border-dashed border-gray-300"
                      onPress={onAddAddress}
                  >
                      <Text className="paragraph-semibold text-primary">Add address</Text>
                  </TouchableOpacity>,
              ];

    return (
        <View className="gap-5 pt-4" style={{ paddingHorizontal: 24 }}>
            <View className="gap-2">
                <TouchableOpacity className="flex-row items-center gap-3 bg-white rounded-3xl px-4 py-3 border border-gray-100" activeOpacity={0.9}>
                    <View className="size-10 rounded-2xl bg-primary/10 items-center justify-center">
                        <Icon name="location" size={18} color="#FF8C42" />
                    </View>
                    <View className="flex-1">
                        <Text className="body-medium text-dark-60">Deliver to</Text>
                        <Text className="paragraph-semibold text-dark-100" numberOfLines={1}>
                            {activeLabel}
                        </Text>
                    </View>
                    <Icon name="arrowDown" size={16} color="#0F172A" />
                </TouchableOpacity>
                <Text className="text-4xl font-ezra-bold text-dark-100 mt-2">Order</Text>
                <Text className="body-medium text-dark-60">Campus cravings, ready in minutes.</Text>
            </View>

            <View style={{ minHeight: 52 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-3">{addressChips}</View>
                </ScrollView>
                {!loading && (
                    <TouchableOpacity className="mt-3 self-start" onPress={onManageAddresses}>
                        <Text className="paragraph-semibold text-primary">Manage addresses</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

export default AddressSummary;


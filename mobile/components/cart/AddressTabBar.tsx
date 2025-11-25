import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { Address } from "@/src/domain/types";
import { ADDRESS_SKELETONS, ADDRESS_TAB_SKELETON_STYLE } from "./addressConstants";

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
                      style={{
                          borderColor: isActive ? "#FE8C00" : "#CBD5F5",
                          backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF",
                      }}
                      onPress={() => onSelect(address.id)}
                  >
                      <Text className="paragraph-semibold text-dark-80">{address.label}</Text>
                  </TouchableOpacity>
              );
          })
        : loading
            ? ADDRESS_SKELETONS.map((skeleton) => <View key={`address-tab-${skeleton}`} style={ADDRESS_TAB_SKELETON_STYLE} />)
            : [
                  <TouchableOpacity
                      key="address-tab-empty"
                      className="px-4 py-2 rounded-full border border-dashed border-gray-300"
                      onPress={onAddAddress}
                  >
                      <Text className="paragraph-semibold text-primary">Add address</Text>
                  </TouchableOpacity>,
              ];

    return (
        <View className="bg-[#F8F6F2] py-3" style={{ paddingHorizontal: 24 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {tabContent}
            </ScrollView>
        </View>
    );
};

export default AddressTabBar;

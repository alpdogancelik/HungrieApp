import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Address } from "@/src/domain/types";

const ADDRESS_SKELETON_COUNT = 3;
const ADDRESS_SKELETONS = Array.from({ length: ADDRESS_SKELETON_COUNT }, (_, index) => index);

const ADDRESS_PILL_SKELETON_STYLE = {
    width: 110,
    height: 44,
    borderRadius: 24,
    backgroundColor: "#E2E8F0",
    opacity: 0.6,
};

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
    const { t } = useTranslation();
    const list = addresses ?? [];
    const hasAddresses = list.length > 0;

    const addressChips = hasAddresses
        ? list.map((address) => {
              const isActive = String(address.id) === selectedAddressId;
              return (
                  <TouchableOpacity
                      key={address.id}
                      className="px-4 py-2 rounded-2xl border"
                      style={{
                          borderColor: isActive ? "#FE8C00" : "#E2E8F0",
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
        <View className="gap-4 pt-2" style={{ paddingLeft: 24, paddingRight: 14 }}>
            <View style={{ minHeight: 52 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-3">{addressChips}</View>
                </ScrollView>
                {!loading && (
                    <TouchableOpacity className="mt-3 self-start" onPress={onManageAddresses}>
                        <Text className="paragraph-semibold text-primary">{t("deliverTo.manage")}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

export default AddressSummary;

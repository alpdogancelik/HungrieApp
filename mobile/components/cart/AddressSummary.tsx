import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import type { Address } from "@/src/domain/types";
import Icon from "@/components/Icon";
import { makeShadow } from "@/src/lib/shadowStyle";

const ADDRESS_SKELETON_COUNT = 3;
const ADDRESS_SKELETONS = Array.from({ length: ADDRESS_SKELETON_COUNT }, (_, index) => index);

const ADDRESS_PILL_SKELETON_STYLE = {
    width: 110,
    height: 44,
    borderRadius: 24,
    backgroundColor: "#E2E8F0",
    opacity: 0.6,
};
const styles = StyleSheet.create({
    root: { paddingLeft: 24, paddingRight: 14, paddingTop: 8 },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#EEE7DE",
        paddingHorizontal: 16,
        paddingVertical: 14,
        rowGap: 14,
        ...makeShadow({ color: "#0F172A", offsetY: 8, blurRadius: 20, opacity: 0.06, elevation: 4 }),
    },
    chipsWrap: { minHeight: 44 },
    chipsRow: { flexDirection: "row", columnGap: 10, paddingRight: 12 },
    chip: {
        minHeight: 40,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
    },
    chipText: { fontFamily: "ChairoSans", fontSize: 15, color: "#1E293B" },
    manageBtn: { flexDirection: "row", alignItems: "center", columnGap: 8, alignSelf: "flex-end" },
    manageText: { fontFamily: "ChairoSans", fontSize: 15, color: "#FE8C00" },
});

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
                      style={[
                          styles.chip,
                          {
                              borderColor: isActive ? "#FE8C00" : "#E2E8F0",
                              backgroundColor: isActive ? "#FFF9F2" : "#FFFFFF",
                          },
                      ]}
                      onPress={() => onSelect(address.id)}
                  >
                      <Icon name={isActive ? "location" : "home"} size={18} color={isActive ? "#FE8C00" : "#94A3B8"} />
                      <Text className="paragraph-semibold text-dark-80" style={styles.chipText}>{address.label}</Text>
                  </TouchableOpacity>
              );
          })
        : loading
            ? ADDRESS_SKELETONS.map((skeleton) => <View key={`address-pill-${skeleton}`} style={ADDRESS_PILL_SKELETON_STYLE} />)
            : [
                  <TouchableOpacity key="add-address-pill" style={styles.chip} onPress={onAddAddress}>
                      <Icon name="plus" size={16} color="#FE8C00" />
                      <Text className="paragraph-semibold text-primary" style={styles.manageText}>Add address</Text>
                  </TouchableOpacity>,
              ];

    return (
        <View style={styles.root}>
            <View style={styles.card}>
                <View style={styles.chipsWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                        {addressChips}
                    </ScrollView>
                </View>
                {!loading ? (
                    <TouchableOpacity style={styles.manageBtn} onPress={onManageAddresses}>
                        <Text className="paragraph-semibold text-primary" style={styles.manageText}>{t("deliverTo.manage")}</Text>
                        <Ionicons name="chevron-forward" size={16} color="#FE8C00" />
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
};

export default AddressSummary;

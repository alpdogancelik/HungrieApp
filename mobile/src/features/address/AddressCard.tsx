import { memo, useMemo, useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import type { Address } from "@/src/domain/types";

type Props = {
    address: Address;
    onEdit: (address: Address) => void;
    onDelete: (address: Address) => void;
    onSetDefault: (address: Address) => void;
};

const AddressCard = ({ address, onEdit, onDelete, onSetDefault }: Props) => {
    const [menuVisible, setMenuVisible] = useState(false);
    const buildingLine = useMemo(() => {
        const parts = [address.line1, address.block].filter(Boolean);
        return parts.join(", ");
    }, [address.block, address.line1]);

    const detailLine = useMemo(() => {
        const parts = [address.room, address.city, address.country].filter(Boolean);
        return parts.join(", ");
    }, [address.city, address.country, address.room]);

    const toggleMenu = () => setMenuVisible((prev) => !prev);
    const closeMenu = () => setMenuVisible(false);

    const handleEdit = () => {
        closeMenu();
        onEdit(address);
    };

    const handleDelete = () => {
        closeMenu();
        onDelete(address);
    };

    const handleSetDefault = () => {
        closeMenu();
        onSetDefault(address);
    };

    return (
        <View className="bg-white border border-gray-100 rounded-3xl px-4 py-4 gap-3 shadow-sm shadow-black/5">
            <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                        <Text className="paragraph-semibold text-dark-100 flex-shrink">{address.label}</Text>
                        {address.isDefault ? (
                            <View className="bg-primary/10 rounded-full px-3 py-1">
                                <Text className="caption text-primary">Default</Text>
                            </View>
                        ) : null}
                    </View>
                    <Text className="body-medium text-dark-60" numberOfLines={1}>
                        {buildingLine}
                    </Text>
                    <Text className="body-medium text-dark-60" numberOfLines={1}>
                        {detailLine}
                    </Text>
                </View>
                <TouchableOpacity
                    accessibilityLabel="Open address actions"
                    className="size-10 rounded-full bg-gray-50 items-center justify-center border border-gray-100"
                    onPress={toggleMenu}
                >
                    <Text className="text-xl text-dark-40">⋮</Text>
                </TouchableOpacity>
            </View>

            <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={closeMenu}>
                <View className="flex-1 justify-end bg-black/40">
                    <Pressable className="flex-1" onPress={closeMenu} />
                    <View className="bg-white rounded-t-3xl p-5 gap-2 shadow-2xl">
                        <Text className="h4-bold text-dark-100 mb-2">Address actions</Text>
                        <TouchableOpacity className="py-3" onPress={handleEdit}>
                            <Text className="paragraph-semibold text-dark-100">Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="py-3" disabled={address.isDefault} onPress={handleSetDefault}>
                            <Text className={`paragraph-semibold ${address.isDefault ? "text-dark-40" : "text-dark-80"}`}>
                                {address.isDefault ? "Already default" : "Set as default"}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity className="py-3" onPress={handleDelete}>
                            <Text className="paragraph-semibold text-red-500">Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default memo(AddressCard);

import { memo, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.addressContent}>
                    <View style={styles.labelRow}>
                        <Text style={styles.labelText}>{address.label}</Text>
                        {address.isDefault ? (
                            <View style={styles.defaultBadge}>
                                <Text style={styles.defaultBadgeText}>Default</Text>
                            </View>
                        ) : null}
                    </View>
                    <Text style={styles.addressLine} numberOfLines={1}>
                        {buildingLine}
                    </Text>
                    <Text style={styles.addressLine} numberOfLines={1}>
                        {detailLine}
                    </Text>
                </View>
                <TouchableOpacity
                    accessibilityLabel="Open address actions"
                    style={styles.menuButton}
                    onPress={toggleMenu}
                >
                    <Text style={styles.menuButtonText}>⋮</Text>
                </TouchableOpacity>
            </View>

            <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={closeMenu}>
                <View style={styles.sheetBackdrop}>
                    <Pressable style={styles.sheetDismissArea} onPress={closeMenu} />
                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Address actions</Text>
                        <TouchableOpacity style={styles.sheetAction} onPress={handleEdit}>
                            <Text style={styles.sheetActionText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sheetAction} disabled={address.isDefault} onPress={handleSetDefault}>
                            <Text style={address.isDefault ? styles.sheetActionDisabledText : styles.sheetActionSecondaryText}>
                                {address.isDefault ? "Already default" : "Set as default"}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sheetAction} onPress={handleDelete}>
                            <Text style={styles.sheetActionDeleteText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 16,
        rowGap: 12,
        shadowColor: "#000000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        columnGap: 12,
    },
    addressContent: {
        flex: 1,
        rowGap: 4,
    },
    labelRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 8,
    },
    labelText: {
        flexShrink: 1,
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: "#111827",
    },
    defaultBadge: {
        backgroundColor: "#FE8C001A",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    defaultBadgeText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "500",
        color: "#FE8C00",
    },
    addressLine: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "500",
        color: "#6B7280",
    },
    menuButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#F9FAFB",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        alignItems: "center",
        justifyContent: "center",
    },
    menuButtonText: {
        fontSize: 20,
        lineHeight: 24,
        color: "#9CA3AF",
    },
    sheetBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
    },
    sheetDismissArea: {
        flex: 1,
    },
    sheet: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 28,
        rowGap: 8,
    },
    sheetTitle: {
        marginBottom: 8,
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "700",
        color: "#111827",
    },
    sheetAction: {
        paddingVertical: 12,
    },
    sheetActionText: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: "#111827",
    },
    sheetActionSecondaryText: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: "#374151",
    },
    sheetActionDisabledText: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: "#9CA3AF",
    },
    sheetActionDeleteText: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "700",
        color: "#EF4444",
    },
});

export default memo(AddressCard);

import { Ionicons } from "@expo/vector-icons";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Address } from "@/src/domain/types";
import { useTheme } from "@/src/theme/themeContext";

const ORANGE = "#FF5A00";
const DESTRUCTIVE = "#E52521";

type Props = {
    address: Address;
    isFirst: boolean;
    isLast: boolean;
    onEdit: (address: Address) => void;
    onDelete: (address: Address) => void;
    onSetDefault: (address: Address) => void;
};

const composeLine = (parts: Array<string | undefined>) => {
    const values: string[] = [];
    const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    parts.forEach((part) => {
        const value = String(part || "").trim();
        if (!value) return;
        const candidate = normalize(value);
        const composed = normalize(values.join(" "));
        if (!candidate || (composed && (composed.includes(candidate) || candidate.includes(composed)))) return;
        values.push(value);
    });
    return values.join(", ");
};

const AddressCard = ({ address, isFirst, isLast, onEdit, onDelete, onSetDefault }: Props) => {
    const { t, i18n } = useTranslation();
    const { variant } = useTheme();
    const insets = useSafeAreaInsets();
    const dark = variant === "dark";
    const styles = useMemo(() => createStyles(dark), [dark]);
    const isTurkish = i18n.language?.startsWith("tr");
    const [menuVisible, setMenuVisible] = useState(false);
    const resolveCopy = (key: string, tr: string, en: string) => {
        const fallback = isTurkish ? tr : en;
        const translated = t(key, { defaultValue: fallback });
        return translated === key ? fallback : translated;
    };
    const copy = {
        defaultBadge: resolveCopy("address.manage.defaultBadge", "Varsayılan", "Default"),
        openActions: resolveCopy("address.manage.openActions", "Adres işlemlerini aç", "Open address actions"),
        edit: resolveCopy("address.manage.edit", "Adresi düzenle", "Edit address"),
        setDefault: resolveCopy("address.manage.setDefault", "Varsayılan yap", "Set as default"),
        delete: resolveCopy("address.manage.delete", "Adresi sil", "Delete address"),
        cancel: resolveCopy("common.cancel", "İptal", "Cancel"),
    };
    const buildingLine = composeLine([address.line1, address.block, address.room]);
    const locationLine = composeLine([address.city, address.country]);

    const closeMenu = () => setMenuVisible(false);
    const runAction = (action: (value: Address) => void) => {
        closeMenu();
        action(address);
    };

    return (
        <View style={[styles.groupRow, isFirst && styles.firstRow, isLast && styles.lastRow]}>
            <Pressable
                accessibilityLabel={`${copy.edit}: ${address.label}`}
                accessibilityRole="button"
                onPress={() => onEdit(address)}
                style={styles.rowPressable}
            >
                <View style={styles.iconColumn}>
                    <Ionicons color={styles.iconColor.color} name="location-outline" size={20} />
                </View>
                <View style={styles.addressContent}>
                    <View style={styles.labelRow}>
                        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.labelText}>{address.label}</Text>
                        {address.isDefault ? <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>{copy.defaultBadge}</Text></View> : null}
                    </View>
                    {buildingLine ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.addressLine}>{buildingLine}</Text> : null}
                    {locationLine ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.addressLine}>{locationLine}</Text> : null}
                </View>
                <Pressable
                    accessibilityLabel={`${copy.openActions}: ${address.label}`}
                    accessibilityRole="button"
                    hitSlop={2}
                    onPress={(event) => {
                        event.stopPropagation();
                        setMenuVisible(true);
                    }}
                    style={styles.menuButton}
                >
                    <Ionicons color={styles.secondary.color} name="ellipsis-vertical" size={19} />
                </Pressable>
            </Pressable>
            {!isLast ? <View style={styles.divider} /> : null}

            <Modal animationType="slide" onRequestClose={closeMenu} transparent visible={menuVisible}>
                <View style={styles.sheetBackdrop}>
                    <Pressable accessibilityLabel={copy.cancel} onPress={closeMenu} style={styles.sheetDismissArea} />
                    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                        <View style={styles.sheetHandle} />
                        <Text numberOfLines={1} style={styles.sheetTitle}>{address.label}</Text>
                        <Pressable accessibilityRole="button" onPress={() => runAction(onEdit)} style={styles.sheetAction}>
                            <Ionicons color={styles.primary.color} name="pencil-outline" size={20} />
                            <Text style={styles.sheetActionText}>{copy.edit}</Text>
                        </Pressable>
                        {!address.isDefault ? <Pressable accessibilityRole="button" onPress={() => runAction(onSetDefault)} style={styles.sheetAction}>
                            <Ionicons color={styles.primary.color} name="checkmark-circle-outline" size={20} />
                            <Text style={styles.sheetActionText}>{copy.setDefault}</Text>
                        </Pressable> : null}
                        <Pressable accessibilityRole="button" onPress={() => runAction(onDelete)} style={styles.sheetAction}>
                            <Ionicons color={DESTRUCTIVE} name="trash-outline" size={20} />
                            <Text style={styles.sheetActionDeleteText}>{copy.delete}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" onPress={closeMenu} style={styles.cancelButton}>
                            <Text style={styles.cancelText}>{copy.cancel}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const createStyles = (dark: boolean) => {
    const colors = {
        surface: dark ? "#171A20" : "#FFFFFF",
        elevated: dark ? "#1C2027" : "#FFFFFF",
        primary: dark ? "#F5F7FA" : "#111318",
        secondary: dark ? "#98A2B3" : "#667085",
        border: dark ? "#2A2E35" : "#EAECF0",
        pressed: dark ? "#22262E" : "#F5F6F8",
        badge: dark ? "#3A251C" : "#FFF1E7",
    };

    return StyleSheet.create({
        primary: { color: colors.primary },
        secondary: { color: colors.secondary },
        iconColor: { color: dark ? "#D0D5DD" : "#344054" },
        groupRow: { minHeight: 90, backgroundColor: colors.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border, overflow: "hidden" },
        firstRow: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
        lastRow: { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
        rowPressable: { minHeight: 90, paddingLeft: 14, paddingRight: 6, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
        iconColumn: { width: 30, alignItems: "flex-start", justifyContent: "center" },
        addressContent: { flex: 1, minWidth: 0, marginLeft: 10 },
        labelRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
        labelText: { flexShrink: 1, color: colors.primary, fontSize: 16, lineHeight: 21, fontWeight: "600" },
        defaultBadge: { height: 23, borderRadius: 999, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.badge },
        defaultBadgeText: { color: ORANGE, fontSize: 11.5, lineHeight: 14, fontWeight: "600" },
        addressLine: { color: colors.secondary, fontSize: 13.5, lineHeight: 18 },
        menuButton: { flexShrink: 0, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
        divider: { position: "absolute", left: 58, right: 14, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2, 6, 23, 0.48)" },
        sheetDismissArea: { flex: 1 },
        sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.elevated },
        sheetHandle: { width: 42, height: 5, borderRadius: 3, marginBottom: 15, alignSelf: "center", backgroundColor: colors.border },
        sheetTitle: { marginBottom: 8, color: colors.primary, fontSize: 20, lineHeight: 25, fontWeight: "700" },
        sheetAction: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 8 },
        sheetActionText: { color: colors.primary, fontSize: 16, lineHeight: 21, fontWeight: "500" },
        sheetActionDeleteText: { color: DESTRUCTIVE, fontSize: 16, lineHeight: 21, fontWeight: "500" },
        cancelButton: { minHeight: 48, marginTop: 6, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.pressed },
        cancelText: { color: colors.primary, fontSize: 16, lineHeight: 21, fontWeight: "600" },
    });
};

export default memo(AddressCard);

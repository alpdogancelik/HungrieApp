import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useMenuItemImage } from "@/src/features/restaurantMenu/hooks/useMenuItemImage";

import { formatTry } from "./menuUtils";
import type { MenuEntry } from "./types";

type Props = {
    item: MenuEntry;
    category: string;
    cuisine?: string;
    locale: "tr" | "en";
    disabled?: boolean;
    colors: {
        text: string;
        secondary: string;
        border: string;
        imageFallback: string;
    };
    onOpen: (item: MenuEntry, imageUrl?: string) => void;
    onAdd: (item: MenuEntry, imageUrl?: string) => void;
};

const MenuItemRow = ({ item, category, cuisine, locale, disabled, colors, onOpen, onAdd }: Props) => {
    const imageResolution = useMenuItemImage({
        name: item.name,
        category,
        cuisine,
        explicitImageUrl: item.image_url || item.imageUrl,
    });
    const candidates = imageResolution.candidates.map((candidate) => candidate.url);
    const [candidateIndex, setCandidateIndex] = useState(0);
    const activeImageUrl = candidates[candidateIndex];

    useEffect(() => setCandidateIndex(0), [item.id]);

    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(item, activeImageUrl || imageResolution.bestImageUrl || undefined)}
            style={[styles.row, { borderBottomColor: colors.border }]}
        >
            <View style={styles.copy}>
                <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                {item.description ? (
                    <Text numberOfLines={2} style={[styles.description, { color: colors.secondary }]}>{item.description}</Text>
                ) : null}
                <Text style={styles.price}>{formatTry(item.price, locale)}</Text>
            </View>

            <View style={[styles.imageFrame, { backgroundColor: colors.imageFallback }]}>
                {activeImageUrl ? (
                    <Image
                        cachePolicy="memory-disk"
                        contentFit="cover"
                        onError={() => setCandidateIndex((current) => current + 1)}
                        source={{ uri: activeImageUrl }}
                        style={styles.image}
                        transition={160}
                    />
                ) : (
                    <Ionicons color={colors.secondary} name="restaurant-outline" size={24} />
                )}
                <Pressable
                    accessibilityLabel={locale === "tr" ? `${item.name} sepete ekle` : `Add ${item.name} to cart`}
                    accessibilityRole="button"
                    disabled={disabled}
                    hitSlop={9}
                    onPress={(event) => {
                        event.stopPropagation();
                        onAdd(item, activeImageUrl || imageResolution.bestImageUrl || undefined);
                    }}
                    style={[styles.addButton, disabled && styles.addButtonDisabled]}
                >
                    <Ionicons color="#FFFFFF" name="add" size={19} />
                </Pressable>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    row: {
        minHeight: 104,
        flexDirection: "row",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 14,
    },
    copy: {
        flex: 1,
        minWidth: 0,
    },
    name: {
        fontSize: 14.5,
        lineHeight: 18,
        fontWeight: "600",
    },
    description: {
        marginTop: 4,
        fontSize: 11.5,
        lineHeight: 15.5,
    },
    price: {
        marginTop: 7,
        color: "#FF5A1F",
        fontSize: 15,
        lineHeight: 18,
        fontWeight: "700",
    },
    imageFrame: {
        width: 72,
        height: 72,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
    },
    image: {
        width: "100%",
        height: "100%",
        borderRadius: 9,
    },
    addButton: {
        position: "absolute",
        right: -4,
        bottom: -4,
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: "#FFFFFF",
        backgroundColor: "#FF5A1F",
        alignItems: "center",
        justifyContent: "center",
    },
    addButtonDisabled: {
        opacity: 0.5,
    },
});

export default memo(MenuItemRow);

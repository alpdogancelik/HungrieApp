import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "@/components/Icon";
import type { OrderReviewItemSnapshot, OrderReviewRatingBreakdown } from "@/src/domain/types";

type OrderReviewSheetProps = {
    visible: boolean;
    submitting?: boolean;
    items: OrderReviewItemSnapshot[];
    errorText?: string | null;
    onClose: () => void;
    onSubmit: (payload: { ratings: OrderReviewRatingBreakdown; comment?: string }) => void | Promise<void>;
};

const STAR_VALUES: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

const OrderReviewSheet = ({ visible, submitting = false, items, errorText, onClose, onSubmit }: OrderReviewSheetProps) => {
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const [ratings, setRatings] = useState<Partial<OrderReviewRatingBreakdown>>({});
    const [comment, setComment] = useState("");

    useEffect(() => {
        if (!visible) return;
        setRatings({});
        setComment("");
    }, [visible]);

    const allRatingsSelected =
        [ratings.speed, ratings.taste, ratings.value].every((value) => [1, 2, 3, 4, 5].includes(Number(value)));
    const submitDisabled = !allRatingsSelected || submitting;
    const hasDraftChanges = Boolean(comment.trim()) || Boolean(ratings.speed || ratings.taste || ratings.value);

    const ratingRows = useMemo(
        () => [
            { id: "speed" as const, label: "Teslimat hızı" },
            { id: "taste" as const, label: "Lezzet" },
            { id: "value" as const, label: "Fiyat/performans" },
        ],
        [],
    );

    const handleRequestClose = () => {
        if (submitting) return;
        if (Platform.OS === "web") {
            onClose();
            return;
        }
        if (!hasDraftChanges) {
            onClose();
            return;
        }
        Alert.alert("Degerlendirme kapatilsin mi?", "Girdiginiz puanlar kaybolacak.", [
            { text: "Duzenlemeye devam et", style: "cancel" },
            { text: "Kapat", style: "destructive", onPress: onClose },
        ]);
    };

    const handleSubmit = () => {
        if (submitDisabled) return;
        onSubmit({
            ratings: {
                speed: ratings.speed as 1 | 2 | 3 | 4 | 5,
                taste: ratings.taste as 1 | 2 | 3 | 4 | 5,
                value: ratings.value as 1 | 2 | 3 | 4 | 5,
            },
            comment: comment.trim() || undefined,
        });
    };

    if (!visible) return null;

    return (
        <Modal
            visible
            transparent
            statusBarTranslucent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={handleRequestClose}
        >
            <View style={styles.modalRoot}>
                <Pressable style={styles.backdrop} onPress={handleRequestClose} />
                <KeyboardAvoidingView
                    style={styles.keyboardAvoiding}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 12 : 0}
                >
                    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
                        <Pressable style={[styles.sheet, { maxHeight: Math.max(340, screenHeight * 0.82) }]} onPress={() => undefined}>
                            <ScrollView
                                bounces={false}
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={styles.sheetContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={styles.headerRow}>
                                    <Text style={styles.title}>Deneyimini değerlendir</Text>
                                    <TouchableOpacity
                                        onPress={handleRequestClose}
                                        disabled={submitting}
                                        accessibilityRole="button"
                                        accessibilityLabel="Kapat"
                                        style={styles.closeButton}
                                    >
                                        <Icon name="close" size={18} color="#475569" />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.itemsWrap}>
                                    <Text style={styles.itemsTitle}>Bu sipariste:</Text>
                                    {items.length ? (
                                        items.slice(0, 8).map((item, index) => (
                                            <Text key={`${item.menuItemId || item.name}-${index}`} style={styles.itemText}>
                                                {`- ${Number(item.quantity || 1)}x ${item.name}`}
                                            </Text>
                                        ))
                                    ) : (
                                        <Text style={styles.itemsEmpty}>Urun detayi bulunamadi.</Text>
                                    )}
                                </View>

                                <View style={styles.ratingGroup}>
                                    {ratingRows.map((row) => (
                                        <View key={row.id} style={styles.ratingRow}>
                                            <Text style={styles.ratingLabel}>{row.label}</Text>
                                            <View style={styles.starsRow}>
                                                {STAR_VALUES.map((value) => {
                                                    const filled = value <= Number(ratings[row.id] || 0);
                                                    return (
                                                        <Pressable
                                                            key={`${row.id}-${value}`}
                                                            onPress={() => setRatings((prev) => ({ ...prev, [row.id]: value }))}
                                                            style={styles.starButton}
                                                        >
                                                            <Icon name="star" size={22} color={filled ? "#FE8C00" : "#CBD5E1"} />
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    ))}
                                </View>

                                <TextInput
                                    multiline
                                    placeholder="Sipariş deneyimini kısaca anlat..."
                                    placeholderTextColor="#94A3B8"
                                    value={comment}
                                    onChangeText={(text) => setComment(text.slice(0, 500))}
                                    style={styles.commentInput}
                                    textAlignVertical="top"
                                />
                                {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

                                <View style={styles.actionsRow}>
                                    <TouchableOpacity style={styles.cancelButton} onPress={handleRequestClose} disabled={submitting}>
                                        <Text style={styles.cancelText}>Vazgeç</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.submitButton, submitDisabled ? styles.submitButtonDisabled : null]}
                                        disabled={submitDisabled}
                                        onPress={handleSubmit}
                                    >
                                        <Text style={styles.submitText}>{submitting ? "Gönderiliyor..." : "Gönder"}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </Pressable>
                    </SafeAreaView>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
        justifyContent: "flex-end",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.42)",
    },
    keyboardAvoiding: {
        justifyContent: "flex-end",
    },
    safeArea: {
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        overflow: "hidden",
    },
    sheetContent: {
        paddingHorizontal: 24,
        paddingTop: 18,
        paddingBottom: 16,
        gap: 14,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 22,
        color: "#0F172A",
        flex: 1,
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        alignItems: "center",
        justifyContent: "center",
    },
    itemsWrap: {
        borderRadius: 16,
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 4,
    },
    itemsTitle: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#0F172A",
    },
    itemText: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#475569",
    },
    itemsEmpty: {
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#94A3B8",
    },
    ratingGroup: {
        gap: 10,
    },
    ratingRow: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
    },
    ratingLabel: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#0F172A",
    },
    starsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    starButton: {
        paddingVertical: 2,
    },
    commentInput: {
        minHeight: 96,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 14,
        backgroundColor: "#FFFFFF",
    },
    errorText: {
        marginTop: -2,
        fontFamily: "ChairoSans",
        fontSize: 12,
        color: "#B91C1C",
    },
    actionsRow: {
        flexDirection: "row",
        columnGap: 10,
    },
    cancelButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        alignItems: "center",
        justifyContent: "center",
    },
    cancelText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#475569",
    },
    submitButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FE8C00",
    },
    submitButtonDisabled: {
        backgroundColor: "#CBD5E1",
    },
    submitText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: "#FFFFFF",
    },
});

export default OrderReviewSheet;

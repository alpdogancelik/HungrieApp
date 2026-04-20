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
import { useTranslation } from "react-i18next";

import Icon from "@/components/Icon";

type ReviewSheetProps = {
    visible: boolean;
    submitting?: boolean;
    initialRating?: number;
    initialComment?: string;
    onClose: () => void;
    onSubmit: (payload: { rating: 1 | 2 | 3 | 4 | 5; comment?: string }) => void | Promise<void>;
    placeholder?: string;
};

const STAR_VALUES: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

const ReviewSheet = ({
    visible,
    submitting = false,
    initialRating = 0,
    initialComment = "",
    onClose,
    onSubmit,
    placeholder,
}: ReviewSheetProps) => {
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const copy = {
        title: isTurkish ? "Deneyimini payla\u015f" : "Share your experience",
        close: isTurkish ? "Kapat" : "Close",
        cancel: isTurkish ? "Vazge\u00e7" : "Cancel",
        abandon: isTurkish ? "De\u011ferlendirmeden vazge\u00e7" : "Close without reviewing",
        submit: isTurkish ? "G\u00f6nder" : "Submit",
        submitting: isTurkish ? "G\u00f6nderiliyor..." : "Submitting...",
        placeholder: isTurkish ? "Teslimattan sonra bu \u00fcr\u00fcn nas\u0131ld\u0131?" : "Tell others about this item...",
        discardTitle: isTurkish ? "De\u011ferlendirme kapat\u0131ls\u0131n m\u0131?" : "Discard this review?",
        discardBody: isTurkish
            ? "Yapt\u0131\u011f\u0131n de\u011fi\u015fiklikler kaybolacak."
            : "Your current rating/comment will be lost.",
        keepEditing: isTurkish ? "D\u00fczenlemeye devam et" : "Keep editing",
        discard: isTurkish ? "Vazge\u00e7 ve kapat" : "Discard and close",
    };

    const [rating, setRating] = useState<number>(initialRating);
    const [comment, setComment] = useState(initialComment);

    useEffect(() => {
        if (!visible) return;
        setRating(initialRating);
        setComment(initialComment || "");
    }, [initialComment, initialRating, visible]);

    const disabled = rating === 0 || submitting;
    const hasDraftChanges =
        rating !== Number(initialRating || 0) || comment.trim() !== String(initialComment || "").trim();

    const handleRequestClose = () => {
        if (submitting) return;
        if (!hasDraftChanges) {
            onClose();
            return;
        }

        Alert.alert(copy.discardTitle, copy.discardBody, [
            { text: copy.keepEditing, style: "cancel" },
            {
                text: copy.discard,
                style: "destructive",
                onPress: onClose,
            },
        ]);
    };

    const handleSubmit = () => {
        if (rating < 1 || rating > 5) return;
        onSubmit({ rating: rating as 1 | 2 | 3 | 4 | 5, comment });
    };

    const stars = useMemo(
        () =>
            STAR_VALUES.map((value) => {
                const filled = value <= rating;
                return (
                    <Pressable key={value} onPress={() => setRating(value)} style={styles.starButton}>
                        <Icon name="star" size={24} color={filled ? "#FE8C00" : "#CBD5E1"} />
                    </Pressable>
                );
            }),
        [rating],
    );

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
                        <Pressable style={[styles.sheet, { maxHeight: Math.max(280, screenHeight * 0.8) }]} onPress={() => undefined}>
                            <ScrollView
                                bounces={false}
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={styles.sheetContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={styles.headerRow}>
                                    <Text style={styles.title}>{copy.title}</Text>
                                    <TouchableOpacity
                                        onPress={handleRequestClose}
                                        disabled={submitting}
                                        accessibilityRole="button"
                                        accessibilityLabel={copy.close}
                                        style={styles.closeButton}
                                    >
                                        <Icon name="close" size={18} color="#475569" />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.starsRow}>{stars}</View>
                                <TextInput
                                    multiline
                                    placeholder={placeholder || copy.placeholder}
                                    placeholderTextColor="#94A3B8"
                                    value={comment}
                                    onChangeText={(text) => setComment(text.slice(0, 500))}
                                    style={styles.commentInput}
                                    textAlignVertical="top"
                                />
                                <View style={styles.actionsRow}>
                                    <TouchableOpacity style={styles.cancelButton} onPress={handleRequestClose} disabled={submitting}>
                                        <Text style={styles.cancelText}>{copy.cancel}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.submitButton, disabled ? styles.submitButtonDisabled : null]}
                                        disabled={disabled}
                                        onPress={handleSubmit}
                                    >
                                        <Text style={styles.submitText}>{submitting ? copy.submitting : copy.submit}</Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    onPress={handleRequestClose}
                                    disabled={submitting}
                                    style={styles.abandonButton}
                                >
                                    <Text style={styles.abandonText}>{copy.abandon}</Text>
                                </TouchableOpacity>
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
        paddingBottom: 14,
        gap: 14,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 22,
        color: "#0F172A",
        flex: 1,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
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
    starsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 8,
    },
    starButton: {
        paddingVertical: 2,
    },
    commentInput: {
        minHeight: 100,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 14,
        backgroundColor: "#FFFFFF",
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
    abandonButton: {
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 2,
    },
    abandonText: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: "#64748B",
        textDecorationLine: "underline",
    },
});

export default ReviewSheet;

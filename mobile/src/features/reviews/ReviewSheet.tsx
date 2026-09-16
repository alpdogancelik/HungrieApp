import { useEffect, useMemo, useState } from "react";
import { createAdaptiveStyleSheet } from "@/src/theme/adaptiveStyles";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import Icon from "@/components/Icon";
import { useTheme } from "@/src/theme/themeContext";

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
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const isTurkish = i18n.language?.toLowerCase().startsWith("tr");
    const copy = {
        title: isTurkish ? "Deneyimini payla\u015f" : "Share your experience",
        subtitle: isTurkish ? "Bu ürünü nasıl buldun?" : "How was this item?",
        close: isTurkish ? "Kapat" : "Close",
        cancel: isTurkish ? "Vazge\u00e7" : "Cancel",
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
                        <Icon name="star" size={28} color={filled ? "#FE8C00" : "#CBD5E1"} />
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
            animationType="slide"
            presentationStyle="overFullScreen"
            onRequestClose={handleRequestClose}
        >
            <View style={styles.modalRoot}>
                <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={handleRequestClose} />
                <KeyboardAvoidingView
                    style={styles.keyboardAvoiding}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={0}
                >
                    <Pressable style={[styles.sheet, { maxHeight: Math.max(280, screenHeight * 0.78), backgroundColor: theme.colors.surfaceElevated }]} onPress={() => undefined}>
                            <ScrollView
                                bounces={false}
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={[styles.sheetHandle, { backgroundColor: theme.colors.border }]} />
                                <View style={styles.headerRow}>
                                    <View style={styles.headerCopy}>
                                        <Text style={[styles.title, { color: theme.colors.ink }]}>{copy.title}</Text>
                                        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{copy.subtitle}</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleRequestClose}
                                        disabled={submitting}
                                        accessibilityRole="button"
                                        accessibilityLabel={copy.close}
                                        style={[styles.closeButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}
                                    >
                                        <Icon name="close" size={18} color={theme.colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.starsRow}>{stars}</View>
                                <TextInput
                                    multiline
                                    placeholder={placeholder || copy.placeholder}
                                    placeholderTextColor={theme.colors.muted}
                                    value={comment}
                                    onChangeText={(text) => setComment(text.slice(0, 500))}
                                    style={[styles.commentInput, { color: theme.colors.ink, backgroundColor: theme.colors.input, borderColor: theme.colors.border }]}
                                    textAlignVertical="top"
                                />
                                <View style={styles.actionsGroup}>
                                    <TouchableOpacity
                                        style={[styles.submitButton, disabled ? styles.submitButtonDisabled : null]}
                                        disabled={disabled}
                                        onPress={handleSubmit}
                                    >
                                        <Text style={styles.submitText}>{submitting ? copy.submitting : copy.submit}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.cancelButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={handleRequestClose} disabled={submitting}>
                                        <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>{copy.cancel}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </Pressable>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = createAdaptiveStyleSheet({
    modalRoot: {
        flex: 1,
        justifyContent: "flex-end",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.42)",
    },
    keyboardAvoiding: {
        flex: 1,
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: "hidden",
    },
    sheetContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
        gap: 16,
    },
    sheetHandle: {
        width: 42,
        height: 5,
        borderRadius: 3,
        alignSelf: "center",
        marginBottom: 1,
    },
    title: {
        fontFamily: "ChairoSans",
        fontSize: 20,
        lineHeight: 25,
        fontWeight: "700",
        color: "#0F172A",
    },
    subtitle: {
        marginTop: 2,
        fontFamily: "ChairoSans",
        fontSize: 13.5,
        lineHeight: 18,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        columnGap: 12,
    },
    headerCopy: {
        flex: 1,
        minWidth: 0,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        alignItems: "center",
        justifyContent: "center",
    },
    starsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 4,
    },
    starButton: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    commentInput: {
        minHeight: 112,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: "#0F172A",
        fontFamily: "ChairoSans",
        fontSize: 14,
        backgroundColor: "#FFFFFF",
    },
    actionsGroup: {
        gap: 8,
    },
    cancelButton: {
        minHeight: 48,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    cancelText: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 20,
        fontWeight: "600",
        color: "#475569",
    },
    submitButton: {
        minHeight: 54,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FE8C00",
    },
    submitButtonDisabled: {
        backgroundColor: "#CBD5E1",
    },
    submitText: {
        fontFamily: "ChairoSans",
        fontSize: 16,
        lineHeight: 20,
        fontWeight: "600",
        color: "#FFFFFF",
    },
});

export default ReviewSheet;

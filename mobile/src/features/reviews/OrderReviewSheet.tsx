import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { MealReaction, ReviewItemSnapshot, ReviewRating } from "@hungrie/domain";
import { useReducedMotion } from "@/src/lib/useReducedMotion";
import { useTheme } from "@/src/theme/themeContext";
import { CustomerReviewForm, getCustomerReviewCopy, groupReviewItems, normalizeReviewComment, reviewCommentLength, validateCustomerReviewForm } from "./customerReviewUiModel";

export type OrderReviewSheetValue = Omit<CustomerReviewForm, "tasteRating" | "speedRating"> & { tasteRating: ReviewRating; speedRating: ReviewRating };
type Props = { visible: boolean; restaurantName: string; items: ReviewItemSnapshot[]; submitting?: boolean; errorText?: string | null; onClose: () => void; onDiscard?: () => void | Promise<void>; onSubmit: (value: OrderReviewSheetValue) => void | Promise<void> };
const STARS: ReviewRating[] = [1, 2, 3, 4, 5];
const EMPTY_FORM: CustomerReviewForm = { tasteRating: null, speedRating: null, comment: "", mealReactions: [] };

export default function OrderReviewSheet({ visible, restaurantName, items, submitting = false, errorText, onClose, onDiscard, onSubmit }: Props) {
    const { i18n } = useTranslation();
    const copy = useMemo(() => getCustomerReviewCopy(i18n.language?.toLowerCase().startsWith("tr") ?? false), [i18n.language]);
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const insets = useSafeAreaInsets();
    const { height, width, fontScale } = useWindowDimensions();
    const groupedItems = useMemo(() => groupReviewItems(items as any), [items]);
    const [form, setForm] = useState<CustomerReviewForm>(EMPTY_FORM);
    const [discarding, setDiscarding] = useState(false);
    const [validation, setValidation] = useState<string | null>(null);
    const tasteRef = useRef<View>(null);
    const speedRef = useRef<View>(null);

    useEffect(() => { if (visible) { setForm(EMPTY_FORM); setDiscarding(false); setValidation(null); } }, [visible]);
    const dirty = Boolean(form.tasteRating || form.speedRating || form.comment || form.mealReactions.length);
    const narrow = width < 380 || fontScale > 1.25;
    const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);
    const requestClose = () => { if (submitting) return; if (dirty) setDiscarding(true); else onClose(); };
    const confirmDiscard = async () => { await onDiscard?.(); setDiscarding(false); onClose(); };
    const rate = (field: "tasteRating" | "speedRating", label: string, value: ReviewRating) => {
        setForm((current) => ({ ...current, [field]: value })); setValidation(null); announce(copy.starAnnouncement(label, value));
    };
    const react = (menuItemId: string, reaction: MealReaction) => setForm((current) => {
        const existing = current.mealReactions.find((entry) => entry.menuItemId === menuItemId)?.reaction;
        return { ...current, mealReactions: existing === reaction ? current.mealReactions.filter((entry) => entry.menuItemId !== menuItemId) : [...current.mealReactions.filter((entry) => entry.menuItemId !== menuItemId), { menuItemId, reaction }] };
    });
    const focusRating = (ref: React.RefObject<View | null>, message: string) => { const node = findNodeHandle(ref.current); if (node) AccessibilityInfo.setAccessibilityFocus(node); announce(message); };
    const submit = () => {
        if (submitting) return;
        const issue = validateCustomerReviewForm(form);
        if (issue) {
            const message = issue === "taste_required" ? copy.selectTaste : issue === "speed_required" ? copy.selectSpeed : copy.invalid;
            setValidation(message);
            if (issue === "taste_required") focusRating(tasteRef, message); else if (issue === "speed_required") focusRating(speedRef, message); else announce(message);
            return;
        }
        void onSubmit({ tasteRating: form.tasteRating!, speedRating: form.speedRating!, comment: normalizeReviewComment(form.comment), mealReactions: form.mealReactions });
    };
    const rating = (field: "tasteRating" | "speedRating", label: string, help?: string, ref?: React.RefObject<View | null>) => (
        <View ref={ref} style={[styles.ratingCard, { borderColor: theme.colors.border }]}>
            <View style={styles.labelRow}><Text style={[styles.ratingLabel, { color: theme.colors.ink }]}>{label}</Text><Text style={[styles.required, { color: theme.colors.textSecondary }]}>{copy.required}</Text></View>
            {help ? <Text style={[styles.help, { color: theme.colors.textSecondary }]}>{help}</Text> : null}
            <View accessibilityRole="radiogroup" style={styles.stars}>{STARS.map((value) => { const selected = form[field] === value; const filled = value <= Number(form[field] || 0); return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={copy.starLabel(label, value)} accessibilityState={{ selected }} onPress={() => rate(field, label, value)} style={({ pressed }) => [styles.star, pressed && { backgroundColor: theme.colors.surfaceMuted }]}><Ionicons name={filled ? "star" : "star-outline"} size={26} color={filled ? theme.colors.primary : theme.colors.textSecondary} /></Pressable>; })}<Text accessibilityLiveRegion="polite" style={[styles.ratingValue, { color: theme.colors.ink }]}>{form[field] ? `${form[field]} / 5` : "— / 5"}</Text></View>
        </View>
    );
    if (!visible) return null;
    return <Modal visible transparent statusBarTranslucent animationType={reduceMotion ? "none" : "slide"} presentationStyle="overFullScreen" onRequestClose={requestClose}>
        <View style={styles.root}>
            <Pressable accessible={false} style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={requestClose} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined} style={styles.keyboard}>
                <View style={[styles.sheet, { backgroundColor: theme.colors.surfaceElevated, maxHeight: Math.max(420, height * .92), width: "100%", maxWidth: Platform.OS === "web" ? 560 : undefined }]}>
                    <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
                    <View style={styles.header}><View style={styles.headerCopy}><Text style={[styles.title, { color: theme.colors.ink }]}>{copy.title}</Text><Text style={[styles.context, { color: theme.colors.textSecondary }]}>{copy.context(restaurantName)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={copy.close} disabled={submitting} onPress={requestClose} style={[styles.close, { borderColor: theme.colors.border }]}><Ionicons name="close" size={22} color={theme.colors.ink} /></Pressable></View>
                    <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {rating("tasteRating", copy.taste, undefined, tasteRef)}
                        {rating("speedRating", copy.speed, copy.speedHelp, speedRef)}
                        <View><Text style={[styles.sectionLabel, { color: theme.colors.ink }]}>{copy.comment}</Text><TextInput accessibilityLabel={copy.comment} multiline maxLength={1000} value={form.comment} onChangeText={(comment) => { setForm((current) => ({ ...current, comment: Array.from(comment).slice(0, 500).join("") })); setValidation(null); }} placeholder={copy.placeholder} placeholderTextColor={theme.colors.muted} style={[styles.comment, { color: theme.colors.ink, borderColor: theme.colors.border, backgroundColor: theme.colors.input }]} textAlignVertical="top" /><Text style={[styles.counter, { color: theme.colors.textSecondary }]}>{reviewCommentLength(form.comment)} / 500</Text></View>
                        <Text style={[styles.sectionLabel, { color: theme.colors.ink }]}>{copy.meals}</Text>
                        {groupedItems.map((item) => { const selected = form.mealReactions.find((entry) => entry.menuItemId === item.menuItemId)?.reaction; return <View key={item.menuItemId} style={[styles.meal, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}><Text style={[styles.mealName, { color: theme.colors.ink }]}>{item.quantity}× {item.name}</Text><View style={[styles.reactions, narrow && styles.reactionsNarrow]}>{(["liked", "disliked"] as MealReaction[]).map((reaction) => { const active = selected === reaction; const label = reaction === "liked" ? copy.liked : copy.disliked; return <Pressable key={reaction} accessibilityRole="button" accessibilityLabel={`${label}: ${item.name}`} accessibilityState={{ selected: active }} onPress={() => react(item.menuItemId, reaction)} style={[styles.reaction, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.surfaceMuted : theme.colors.surface }]}><Ionicons name={reaction === "liked" ? "thumbs-up-outline" : "thumbs-down-outline"} size={18} color={active ? theme.colors.primary : theme.colors.textSecondary} /><Text style={[styles.reactionText, { color: active ? theme.colors.primary : theme.colors.textSecondary }]}>{label}</Text>{active ? <Ionicons name="checkmark" size={17} color={theme.colors.primary} /> : null}</Pressable>; })}</View></View>; })}
                    </ScrollView>
                    {(validation || errorText) ? <View style={[styles.errorBanner, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}><Ionicons name="alert-circle-outline" size={19} color={theme.colors.danger} /><Text accessibilityLiveRegion="assertive" style={[styles.error, { color: theme.colors.danger }]}>{validation || errorText}</Text></View> : null}
                    <View style={[styles.footer, { borderColor: theme.colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}><Pressable accessibilityRole="button" disabled={submitting} onPress={requestClose} style={[styles.secondary, { borderColor: theme.colors.border }]}><Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>{copy.discard}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting} onPress={submit} style={[styles.primary, { backgroundColor: submitting ? theme.colors.muted : theme.colors.primary }]}>{submitting ? <Ionicons name="hourglass-outline" size={18} color={theme.colors.onPrimary} /> : null}<Text style={[styles.primaryText, { color: theme.colors.onPrimary }]}>{submitting ? copy.submitting : errorText ? copy.retry : copy.submit}</Text></Pressable></View>
                </View>
            </KeyboardAvoidingView>
            {discarding ? <View accessibilityViewIsModal style={[styles.confirm, { backgroundColor: theme.colors.overlay }]}><View style={[styles.confirmCard, { backgroundColor: theme.colors.surfaceElevated }]}><Text style={[styles.confirmTitle, { color: theme.colors.ink }]}>{copy.discardTitle}</Text><Text style={[styles.confirmBody, { color: theme.colors.textSecondary }]}>{copy.discardBody}</Text><Pressable accessibilityRole="button" onPress={() => setDiscarding(false)} style={[styles.confirmButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.ink }}>{copy.keepEditing}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void confirmDiscard()} style={[styles.confirmButton, { backgroundColor: theme.colors.danger }]}><Text style={{ color: theme.colors.onPrimary }}>{copy.discard}</Text></Pressable></View></View> : null}
        </View>
    </Modal>;
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end", alignItems: "center" }, backdrop: { ...StyleSheet.absoluteFillObject }, keyboard: { width: "100%", flex: 1, justifyContent: "flex-end", alignItems: "center" }, sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }, handle: { width: 42, height: 5, borderRadius: 3, alignSelf: "center", marginTop: 9 },
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 }, headerCopy: { flex: 1, minWidth: 0 }, title: { fontFamily: "ChairoSans", fontSize: 22, lineHeight: 29, fontWeight: "700" }, context: { fontFamily: "ChairoSans", fontSize: 14, lineHeight: 20, marginTop: 2 }, close: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: 20, paddingVertical: 8, gap: 14 }, ratingCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 5 }, labelRow: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }, ratingLabel: { fontFamily: "ChairoSans", fontSize: 17, lineHeight: 23, fontWeight: "700" }, required: { fontFamily: "ChairoSans", fontSize: 12 }, help: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18 }, stars: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 }, star: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }, ratingValue: { minWidth: 48, fontFamily: "ChairoSans", fontSize: 14, fontWeight: "700", marginLeft: 4 },
    sectionLabel: { fontFamily: "ChairoSans", fontSize: 16, lineHeight: 22, fontWeight: "700", marginBottom: 7 }, comment: { minHeight: 108, borderWidth: 1, borderRadius: 16, padding: 12, fontFamily: "ChairoSans", fontSize: 15, lineHeight: 21 }, counter: { textAlign: "right", fontFamily: "ChairoSans", fontSize: 12, marginTop: 4 }, meal: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 9 }, mealName: { fontFamily: "ChairoSans", fontSize: 15, lineHeight: 21, fontWeight: "600" }, reactions: { flexDirection: "row", gap: 8 }, reactionsNarrow: { flexDirection: "column" }, reaction: { minHeight: 44, flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, reactionText: { fontFamily: "ChairoSans", fontSize: 13, lineHeight: 18, fontWeight: "600" }, errorBanner: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }, error: { flex: 1, fontFamily: "ChairoSans", fontSize: 13, lineHeight: 19, fontWeight: "600" },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }, secondary: { minHeight: 48, minWidth: 140, flex: 1, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 10 }, secondaryText: { fontFamily: "ChairoSans", fontSize: 14, fontWeight: "600", textAlign: "center" }, primary: { minHeight: 48, minWidth: 170, flex: 1.4, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, padding: 10 }, primaryText: { fontFamily: "ChairoSans", fontSize: 15, fontWeight: "700", textAlign: "center" }, confirm: { ...StyleSheet.absoluteFillObject, justifyContent: "center", padding: 24 }, confirmCard: { borderRadius: 20, padding: 20, gap: 12, maxWidth: 420, width: "100%", alignSelf: "center" }, confirmTitle: { fontFamily: "ChairoSans", fontSize: 20, fontWeight: "700" }, confirmBody: { fontFamily: "ChairoSans", fontSize: 15, lineHeight: 21 }, confirmButton: { minHeight: 48, borderWidth: 1, borderColor: "transparent", borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 10 },
});

import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";

import { useTheme } from "@/src/theme/themeContext";
import { useAddressActions, useAddresses } from "./hooks";
import type { AddressFormNavigation, AddressFormScreenProps } from "./types";

const ORANGE = "#FF5A00";
const FOOTER_HEIGHT = 82;
const schema = z.object({
    label: z.string().min(2, "Enter a helpful label."),
    line1: z.string().min(3, "Address line is required."),
    block: z.string().optional(),
    room: z.string().optional(),
    city: z.string().min(2, "City is required."),
    country: z.string().min(2, "Country is required."),
    isDefault: z.boolean(),
});

type FormState = z.infer<typeof schema>;
type FormErrors = Partial<Record<keyof FormState, string>>;
type TextField = Exclude<keyof FormState, "isDefault">;

const DEFAULT_COUNTRY = "TRNC";

const buildInitialState = (options: { editing?: Partial<FormState>; defaultIsDefault: boolean }): FormState => ({
    label: options.editing?.label ?? "",
    line1: options.editing?.line1 ?? "",
    block: options.editing?.block ?? "",
    room: options.editing?.room ?? "",
    city: options.editing?.city ?? "",
    country: options.editing?.country ?? DEFAULT_COUNTRY,
    isDefault: options.editing?.isDefault ?? options.defaultIsDefault,
});

const AddressFormScreen = () => {
    const { variant } = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<AddressFormNavigation>();
    const route = useRoute<AddressFormScreenProps["route"]>();
    const { addresses } = useAddresses();
    const { createAddress, updateAddress, isMutating } = useAddressActions();
    const { t, i18n } = useTranslation();
    const dark = variant === "dark";
    const styles = useMemo(() => createStyles(dark), [dark]);
    const isTurkish = i18n.language?.startsWith("tr");
    const addressId = route.params?.addressId;
    const editingAddress = useMemo(() => addresses.find((address) => address.id === addressId), [addressId, addresses]);

    const [form, setForm] = useState<FormState>(() => buildInitialState({ editing: editingAddress, defaultIsDefault: addresses.length === 0 }));
    const [errors, setErrors] = useState<FormErrors>({});
    const [focusedField, setFocusedField] = useState<TextField | null>(null);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const labelRef = useRef<TextInput>(null);
    const line1Ref = useRef<TextInput>(null);
    const blockRef = useRef<TextInput>(null);
    const roomRef = useRef<TextInput>(null);
    const cityRef = useRef<TextInput>(null);

    useEffect(() => {
        setForm(buildInitialState({ editing: editingAddress, defaultIsDefault: addresses.length === 0 }));
    }, [editingAddress, addresses.length]);

    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
        const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handleChange = (field: keyof FormState, value: string | boolean) => {
        setForm((previous) => ({ ...previous, [field]: value }));
        setErrors((previous) => ({ ...previous, [field]: undefined }));
    };

    const handleSubmit = async () => {
        if (isMutating) return;
        const parsed = schema.safeParse(form);
        if (!parsed.success) {
            const nextErrors: FormErrors = {};
            const errorMessages: Partial<Record<keyof FormState, string>> = {
                label: t("address.form.errors.label"),
                line1: t("address.form.errors.line1"),
                city: t("address.form.errors.city"),
                country: t("address.form.errors.country"),
            };
            parsed.error.issues.forEach((issue) => {
                const path = issue.path[0] as keyof FormState;
                nextErrors[path] = errorMessages[path] || issue.message;
            });
            setErrors(nextErrors);
            return;
        }
        try {
            if (editingAddress) await updateAddress({ ...editingAddress, ...parsed.data });
            else await createAddress(parsed.data);
            navigation.goBack();
        } catch {
            Alert.alert(t("address.form.saveError", "Unable to save address"), t("misc.manageSoon"));
        }
    };

    const screenTitle = editingAddress ? t("address.form.titleEdit") : t("address.form.titleAdd");
    const saveLabel = editingAddress
        ? t("address.form.saveChanges", { defaultValue: isTurkish ? "Değişiklikleri kaydet" : "Save changes" })
        : t("address.form.save");
    const optionalLabel = t("address.form.optional", { defaultValue: isTurkish ? "İsteğe bağlı" : "Optional" });
    const nextFieldRefByName: Partial<Record<TextField, RefObject<TextInput | null>>> = {
        label: line1Ref,
        line1: blockRef,
        block: roomRef,
        room: cityRef,
    };

    const renderField = ({
        field,
        inputRef,
        label,
        optional,
        placeholder,
    }: {
        field: TextField;
        inputRef: RefObject<TextInput | null>;
        label: string;
        optional?: boolean;
        placeholder: string;
    }) => (
        <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
                <Text numberOfLines={1} style={styles.fieldLabel}>{label}</Text>
                {optional ? <Text numberOfLines={1} style={styles.optionalLabel}>{optionalLabel}</Text> : null}
            </View>
            <TextInput
                accessibilityLabel={label}
                autoCapitalize="words"
                blurOnSubmit={field === "city"}
                keyboardType="default"
                onBlur={() => setFocusedField((current) => current === field ? null : current)}
                onChangeText={(text) => handleChange(field, text)}
                onFocus={() => setFocusedField(field)}
                onSubmitEditing={() => {
                    if (field === "city") {
                        Keyboard.dismiss();
                        void handleSubmit();
                        return;
                    }
                    nextFieldRefByName[field]?.current?.focus();
                }}
                placeholder={placeholder}
                placeholderTextColor={styles.placeholder.color}
                ref={inputRef}
                returnKeyType={field === "city" ? "done" : "next"}
                style={[styles.fieldInput, focusedField === field && styles.fieldInputFocused, errors[field] && styles.fieldInputError]}
                value={form[field]}
            />
            {errors[field] ? <Text style={styles.fieldError}>{errors[field]}</Text> : null}
        </View>
    );

    return (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
            <View style={styles.header}>
                <Pressable accessibilityLabel={t("common.goBack")} accessibilityRole="button" hitSlop={4} onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons color={styles.primary.color} name="chevron-back" size={20} />
                </Pressable>
                <Text numberOfLines={1} style={styles.headerTitle}>{screenTitle}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.flex}>
                <ScrollView
                    contentContainerStyle={[styles.content, { paddingBottom: keyboardVisible ? 24 : FOOTER_HEIGHT + insets.bottom + 20 }]}
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View accessibilityLabel={t("address.form.sectionTitle")} style={styles.helperCard}>
                        <View style={styles.helperIcon}><Ionicons color={ORANGE} name="location-outline" size={19} /></View>
                        <View style={styles.helperCopy}>
                            <Text style={styles.helperTitle}>{t("address.form.sectionTitle")}</Text>
                            <Text numberOfLines={2} style={styles.helperDescription}>{t("address.form.sectionSubtitle")}</Text>
                        </View>
                    </View>

                    <View style={styles.fieldsStack}>
                        {renderField({ field: "label", inputRef: labelRef, label: t("address.form.fields.label"), placeholder: t("address.form.fields.labelPlaceholder") })}
                        {renderField({ field: "line1", inputRef: line1Ref, label: t("address.form.fields.line1"), placeholder: t("address.form.fields.line1Placeholder") })}
                        {renderField({ field: "block", inputRef: blockRef, label: t("address.form.fields.block"), optional: true, placeholder: t("address.form.fields.blockPlaceholder") })}
                        {renderField({ field: "room", inputRef: roomRef, label: t("address.form.fields.room"), optional: true, placeholder: t("address.form.fields.roomPlaceholder") })}
                        {renderField({ field: "city", inputRef: cityRef, label: t("address.form.fields.city"), placeholder: t("address.form.fields.cityPlaceholder") })}
                    </View>

                    <Pressable
                        accessibilityLabel={t("address.form.makeDefault")}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: form.isDefault }}
                        onPress={() => handleChange("isDefault", !form.isDefault)}
                        style={styles.defaultCard}
                    >
                        <View style={styles.defaultContent}>
                            <Text style={styles.defaultTitle}>{t("address.form.makeDefault")}</Text>
                            <Text numberOfLines={2} style={styles.defaultHint}>{t("address.form.makeDefaultHint")}</Text>
                        </View>
                        <View style={styles.switchHitbox}>
                            <View style={[styles.switchTrack, form.isDefault && styles.switchTrackActive]}>
                                <View style={[styles.switchThumb, form.isDefault && styles.switchThumbActive]} />
                            </View>
                        </View>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>

            {!keyboardVisible ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                <Pressable accessibilityRole="button" disabled={isMutating} onPress={() => void handleSubmit()} style={[styles.saveButton, isMutating && styles.saveButtonDisabled]}>
                    {isMutating ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                    <Text style={[styles.saveButtonText, isMutating && styles.saveButtonDisabledText]}>{isMutating ? t("address.form.saving") : saveLabel}</Text>
                </Pressable>
            </View> : null}
        </SafeAreaView>
    );
};

const createStyles = (dark: boolean) => {
    const colors = {
        page: dark ? "#0F1115" : "#FAFBFC",
        surface: dark ? "#171A20" : "#FFFFFF",
        primary: dark ? "#F5F7FA" : "#111318",
        secondary: dark ? "#98A2B3" : "#667085",
        tertiary: dark ? "#778293" : "#98A2B3",
        border: dark ? "#2A2E35" : "#EAECF0",
        inputBorder: dark ? "#343942" : "#DDE2EA",
        disabled: dark ? "#343942" : "#E4E7EC",
    };

    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.page },
        flex: { flex: 1 },
        primary: { color: colors.primary },
        placeholder: { color: colors.tertiary },
        header: { height: 54, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", backgroundColor: colors.page },
        backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
        headerTitle: { flex: 1, color: colors.primary, fontSize: 21, lineHeight: 26, fontWeight: "700", textAlign: "center" },
        headerSpacer: { width: 44, height: 44 },
        content: { paddingHorizontal: 22, paddingTop: 20 },
        helperCard: { minHeight: 74, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface },
        helperIcon: { width: 42, height: 42, borderRadius: 21, flexShrink: 0, alignItems: "center", justifyContent: "center", backgroundColor: dark ? "#3A251C" : "#FFF1E7" },
        helperCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
        helperTitle: { color: colors.primary, fontSize: 15, lineHeight: 19, fontWeight: "600" },
        helperDescription: { marginTop: 2, color: colors.secondary, fontSize: 13, lineHeight: 18 },
        fieldsStack: { marginTop: 22, gap: 16 },
        fieldGroup: { gap: 6 },
        fieldLabelRow: { height: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
        fieldLabel: { flexShrink: 1, color: colors.primary, fontSize: 13.5, lineHeight: 18, fontWeight: "600" },
        optionalLabel: { flexShrink: 0, color: colors.tertiary, fontSize: 12, lineHeight: 16 },
        fieldInput: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, color: colors.primary, fontSize: 14, fontWeight: "400" },
        fieldInputFocused: { borderColor: ORANGE },
        fieldInputError: { borderColor: "#D92D20" },
        fieldError: { marginTop: -2, color: "#D92D20", fontSize: 11.5, lineHeight: 16, fontWeight: "500" },
        defaultCard: { minHeight: 66, marginTop: 22, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingLeft: 14, paddingRight: 7, paddingVertical: 9, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface },
        defaultContent: { flex: 1, minWidth: 0, paddingRight: 8 },
        defaultTitle: { color: colors.primary, fontSize: 14.5, lineHeight: 19, fontWeight: "600" },
        defaultHint: { marginTop: 2, color: colors.secondary, fontSize: 12.5, lineHeight: 17 },
        switchHitbox: { width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center" },
        switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: "center", backgroundColor: "#D0D5DD" },
        switchTrackActive: { backgroundColor: ORANGE },
        switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", transform: [{ translateX: 0 }] },
        switchThumbActive: { transform: [{ translateX: 18 }] },
        footer: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: FOOTER_HEIGHT, paddingTop: 14, paddingHorizontal: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.page },
        saveButton: { height: 54, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: ORANGE },
        saveButtonDisabled: { backgroundColor: colors.disabled },
        saveButtonText: { color: "#FFFFFF", fontSize: 16, lineHeight: 20, fontWeight: "600" },
        saveButtonDisabledText: { color: colors.tertiary },
    });
};

export default AddressFormScreen;

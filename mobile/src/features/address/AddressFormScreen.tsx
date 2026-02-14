import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAddressActions, useAddresses } from "./hooks";
import type { AddressFormNavigation, AddressFormScreenProps } from "./types";
import Icon from "@/components/Icon";
import OnlineLocation from "@/assets/illustrations/Online Location.svg";

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
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<AddressFormNavigation>();
    const route = useRoute<AddressFormScreenProps["route"]>();
    const { addresses } = useAddresses();
    const { createAddress, updateAddress, isMutating } = useAddressActions();
    const { t } = useTranslation();
    const addressId = route.params?.addressId;
    const editingAddress = useMemo(() => addresses.find((address) => address.id === addressId), [addressId, addresses]);

    const [form, setForm] = useState<FormState>(() =>
        buildInitialState({
            editing: editingAddress,
            defaultIsDefault: addresses.length === 0,
        }),
    );
    const [errors, setErrors] = useState<FormErrors>({});
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        setForm(
            buildInitialState({
                editing: editingAddress,
                defaultIsDefault: addresses.length === 0,
            }),
        );
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
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const handleSubmit = async () => {
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
            if (editingAddress) {
                await updateAddress({ ...editingAddress, ...parsed.data });
            } else {
                await createAddress(parsed.data);
            }
            navigation.goBack();
        } catch (error: any) {
            Alert.alert(t("address.form.saveError", "Unable to save address"), error?.message ?? t("misc.manageSoon"));
        }
    };

    const screenTitle = editingAddress ? t("address.form.titleEdit") : t("address.form.titleAdd");

    const renderField = (
        label: string,
        field: keyof FormState,
        placeholder: string,
        keyboardType: "default" | "numeric" | "email-address" = "default",
        placeholderColor = "#94A3B8",
    ) => (
        <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
                value={form[field] as string}
                onChangeText={(text) => handleChange(field, text)}
                placeholder={placeholder}
                keyboardType={keyboardType}
                style={styles.fieldInput}
                placeholderTextColor={placeholderColor}
                autoCapitalize="words"
            />
            {errors[field] ? <Text style={styles.fieldError}>{errors[field]}</Text> : null}
        </View>
    );

    return (
        <SafeAreaView style={styles.screen}>
            <KeyboardAvoidingView
                style={styles.flex1}
                behavior={Platform.select({ ios: "padding", android: undefined })}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    style={styles.flex1}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <LinearGradient
                        colors={["#0B1220", "#0E1A36"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0.6 }}
                        style={styles.hero}
                    >
                        <View style={styles.heroRow}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => navigation.goBack()}
                                accessibilityRole="button"
                                accessibilityLabel={t("common.goBack")}
                            >
                                <Icon name="arrowBack" size={18} color="#FFFFFF" />
                            </TouchableOpacity>

                            <View style={styles.heroContent}>
                                <Text style={styles.heroEyebrow}>{screenTitle}</Text>
                                <Text style={styles.heroTitle}>{t("address.form.heroTitle")}</Text>
                                <Text style={styles.heroSubtitle}>{t("address.form.heroSubtitle")}</Text>
                            </View>

                            <OnlineLocation width={140} height={140} style={styles.heroImage} />
                        </View>
                    </LinearGradient>

                    <View style={styles.formContainer}>
                        <View style={styles.formCard}>
                            <View style={styles.formHeading}>
                                <Text style={styles.formTitle}>{t("address.form.sectionTitle")}</Text>
                                <Text style={styles.formSubtitle}>{t("address.form.sectionSubtitle")}</Text>
                            </View>

                            <View style={styles.fieldsStack}>
                                {renderField(
                                    t("address.form.fields.label"),
                                    "label",
                                    t("address.form.fields.labelPlaceholder"),
                                )}
                                {renderField(
                                    t("address.form.fields.line1"),
                                    "line1",
                                    t("address.form.fields.line1Placeholder"),
                                )}
                                {renderField(
                                    t("address.form.fields.block"),
                                    "block",
                                    t("address.form.fields.blockPlaceholder"),
                                )}
                                {renderField(
                                    t("address.form.fields.room"),
                                    "room",
                                    t("address.form.fields.roomPlaceholder"),
                                )}
                                {renderField(
                                    t("address.form.fields.city"),
                                    "city",
                                    t("address.form.fields.cityPlaceholder"),
                                    "default",
                                    "#A7B0C2",
                                )}
                            </View>

                            <View style={styles.defaultCard}>
                                <View style={styles.defaultContent}>
                                    <Text style={styles.defaultTitle}>{t("address.form.makeDefault")}</Text>
                                    <Text style={styles.defaultHint}>{t("address.form.makeDefaultHint")}</Text>
                                </View>
                                <Switch
                                    value={form.isDefault}
                                    onValueChange={(value) => handleChange("isDefault", value)}
                                    trackColor={{ false: "#CBD5E1", true: "#FE8C00" }}
                                    thumbColor="#fff"
                                />
                            </View>
                        </View>
                    </View>
                </ScrollView>

                <View
                    style={[
                        styles.footer,
                        { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom + 8, 16) },
                    ]}
                >
                    <TouchableOpacity
                        disabled={isMutating}
                        style={[styles.saveButton, isMutating ? styles.saveButtonDisabled : styles.saveButtonEnabled]}
                        onPress={handleSubmit}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.saveButtonText}>
                            {isMutating ? t("address.form.saving") : t("address.form.save")}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#0B1220",
    },
    flex1: {
        flex: 1,
    },
    hero: {
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 86,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
    },
    heroRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        columnGap: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.25)",
        alignItems: "center",
        justifyContent: "center",
    },
    heroContent: {
        flex: 1,
        rowGap: 6,
    },
    heroEyebrow: {
        color: "rgba(255, 255, 255, 0.6)",
        letterSpacing: 3.5,
        textTransform: "uppercase",
        fontSize: 11,
        lineHeight: 14,
        fontFamily: "ChairoSans-SemiBold",
    },
    heroTitle: {
        color: "#FFFFFF",
        fontSize: 30,
        lineHeight: 36,
        fontFamily: "ChairoSans-Bold",
    },
    heroSubtitle: {
        color: "rgba(255, 255, 255, 0.75)",
        fontSize: 15,
        lineHeight: 22,
        fontFamily: "ChairoSans",
    },
    heroImage: {
        opacity: 0.95,
        marginTop: -10,
    },
    formContainer: {
        marginTop: -40,
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    formCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        rowGap: 24,
        shadowColor: "#FE8C00",
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
    },
    formHeading: {
        rowGap: 4,
    },
    formTitle: {
        fontSize: 22,
        lineHeight: 28,
        color: "#111827",
        fontFamily: "ChairoSans-Bold",
    },
    formSubtitle: {
        fontSize: 15,
        lineHeight: 22,
        color: "#6B7280",
        fontFamily: "ChairoSans",
    },
    fieldsStack: {
        rowGap: 20,
    },
    fieldGroup: {
        rowGap: 8,
    },
    fieldLabel: {
        fontSize: 16,
        lineHeight: 22,
        color: "#111827",
        fontFamily: "ChairoSans-SemiBold",
    },
    fieldInput: {
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        color: "#111827",
        fontSize: 16,
        lineHeight: 22,
        fontFamily: "ChairoSans",
    },
    fieldError: {
        fontSize: 12,
        lineHeight: 16,
        color: "#EF4444",
        fontFamily: "ChairoSans",
    },
    defaultCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    defaultContent: {
        flex: 1,
        paddingRight: 16,
    },
    defaultTitle: {
        fontSize: 16,
        lineHeight: 22,
        color: "#111827",
        fontFamily: "ChairoSans-SemiBold",
    },
    defaultHint: {
        marginTop: 2,
        fontSize: 14,
        lineHeight: 20,
        color: "#6B7280",
        fontFamily: "ChairoSans",
    },
    footer: {
        paddingHorizontal: 24,
        paddingTop: 8,
    },
    saveButton: {
        borderRadius: 999,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#FE8C00",
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    saveButtonEnabled: {
        backgroundColor: "#FE8C00",
    },
    saveButtonDisabled: {
        backgroundColor: "#D1D5DB",
    },
    saveButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        lineHeight: 22,
        fontFamily: "ChairoSans-SemiBold",
    },
});

export default AddressFormScreen;

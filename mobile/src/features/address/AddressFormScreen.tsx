import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { z } from "zod";
import { useAddressActions, useAddresses } from "./hooks";
import type { AddressFormNavigation, AddressFormScreenProps } from "./types";
import Icon from "@/components/Icon";
import GodzillaBlocks from "@/assets/godzilla/VCTRLY-godzila-play-toy-block-brick.svg";

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
    const navigation = useNavigation<AddressFormNavigation>();
    const route = useRoute<AddressFormScreenProps["route"]>();
    const { addresses } = useAddresses();
    const { createAddress, updateAddress, isMutating } = useAddressActions();
    const addressId = route.params?.addressId;
    const editingAddress = useMemo(() => addresses.find((address) => address.id === addressId), [addressId, addresses]);

    const [form, setForm] = useState<FormState>(() =>
        buildInitialState({
            editing: editingAddress,
            defaultIsDefault: addresses.length === 0,
        }),
    );
    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        setForm(
            buildInitialState({
                editing: editingAddress,
                defaultIsDefault: addresses.length === 0,
            }),
        );
    }, [editingAddress, addresses.length]);

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
            parsed.error.issues.forEach((issue) => {
                const path = issue.path[0] as keyof FormState;
                nextErrors[path] = issue.message;
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
            Alert.alert("Unable to save address", error?.message ?? "Please try again.");
        }
    };

    const screenTitle = editingAddress ? "Edit address" : "Add new address";

    const renderField = (
        label: string,
        field: keyof FormState,
        placeholder: string,
        keyboardType: "default" | "numeric" | "email-address" = "default",
        placeholderColor = "#94A3B8",
    ) => (
        <View className="gap-2">
            <Text className="paragraph-semibold text-dark-100">{label}</Text>
            <TextInput
                value={form[field] as string}
                onChangeText={(text) => handleChange(field, text)}
                placeholder={placeholder}
                keyboardType={keyboardType}
                className="bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-200 text-dark-100"
                placeholderTextColor={placeholderColor}
                autoCapitalize="words"
            />
            {errors[field] ? <Text className="caption text-red-500">{errors[field]}</Text> : null}
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-[#0B1220]">
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.select({ ios: "padding", android: undefined })}
                keyboardVerticalOffset={80}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ paddingBottom: 72 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <LinearGradient
                        colors={["#0B1220", "#0E1A36"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0.6 }}
                        style={{
                            paddingHorizontal: 20,
                            paddingTop: 24,
                            paddingBottom: 120,
                            borderBottomLeftRadius: 32,
                            borderBottomRightRadius: 32,
                        }}
                    >
                        <View className="flex-row items-start gap-4">
                            <TouchableOpacity
                                className="size-10 rounded-full bg-white/10 items-center justify-center border border-white/25"
                                onPress={() => navigation.goBack()}
                                accessibilityRole="button"
                                accessibilityLabel="Go back"
                            >
                                <Icon name="arrowBack" size={18} color="#FFFFFF" />
                            </TouchableOpacity>

                            <View className="flex-1 gap-1.5">
                                <Text className="text-white/60 tracking-[6px] uppercase text-[11px]">{screenTitle}</Text>
                                <Text className="text-white text-3xl font-ezra-bold leading-9">
                                    Nail the drop-off label.
                                </Text>
                                <Text className="text-white/75 body-medium">
                                    A crisp label and city hint help riders find you faster.
                                </Text>
                            </View>

                            <GodzillaBlocks width={132} height={132} style={{ opacity: 0.9, marginTop: -6 }} />
                        </View>
                    </LinearGradient>

                    <View className="-mt-14 px-5 pb-4">
                        <View className="bg-white rounded-3xl p-5 gap-6 shadow-xl shadow-primary/10 border border-gray-100">
                            <View className="gap-1">
                                <Text className="h4-bold text-dark-100">Delivery details</Text>
                                <Text className="body-medium text-dark-60">
                                    Keep it simple, but specific enough for your courier.
                                </Text>
                            </View>

                            <View className="gap-5">
                                {renderField("- Address Label", "label", "Dorm A - Room 204")}
                                {renderField("Address line", "line1", "Campus Residences")}
                                {renderField("Block / Building", "block", "Block A")}
                                {renderField("Room", "room", "Room 204")}
                                {renderField(
                                    "City",
                                    "city",
                                    "(for example, Kalkanli Guzelyurt)",
                                    "default",
                                    "#A7B0C2",
                                )}
                            </View>

                            <View className="flex-row items-center justify-between bg-gray-50 rounded-2xl px-4 py-4 border border-gray-200">
                                <View className="flex-1 pr-4">
                                    <Text className="paragraph-semibold text-dark-100">Make default</Text>
                                    <Text className="body-medium text-dark-60">
                                        This address will appear first at checkout.
                                    </Text>
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

                <View className="px-6 pb-8">
                    <TouchableOpacity
                        disabled={isMutating}
                        className={`rounded-full py-4 items-center shadow-lg shadow-primary/30 ${
                            isMutating ? "bg-gray-300" : "bg-primary"
                        }`}
                        onPress={handleSubmit}
                        activeOpacity={0.9}
                    >
                        <Text className="paragraph-semibold text-white">{isMutating ? "Saving..." : "Save address"}</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default AddressFormScreen;

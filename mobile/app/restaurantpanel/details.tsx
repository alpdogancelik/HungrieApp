import { SafeAreaView } from "react-native-safe-area-context";
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Switch,
    Alert,
    ActivityIndicator,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";

const RestaurantDetails = () => {
    const { isAuthenticated } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: "",
        imageUrl: "",
        address: "",
        cuisine: "",
        description: "",
        isActive: true,
    });

    const canSave = useMemo(() => Boolean(form.name.trim()), [form.name]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (!isAuthenticated || !firestore) {
                setLoading(false);
                return;
            }
            const owned = await getOwnedRestaurantId();
            if (!mounted) return;
            if (!owned) {
                setLoading(false);
                return;
            }
            setRestaurantId(owned);
            const snap = await getDoc(doc(firestore, "restaurants", owned)).catch(() => null);
            if (snap?.exists()) {
                const data = snap.data() || {};
                setForm({
                    name: data.name || "",
                    imageUrl: data.imageUrl || data.image_url || "",
                    address: data.address || "",
                    cuisine: data.cuisine || "",
                    description: data.description || "",
                    isActive: data.isActive !== false,
                });
            }
            setLoading(false);
        };
        load();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    const handleChange = (key: keyof typeof form, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        if (!restaurantId || !firestore) return;
        if (!canSave) {
            Alert.alert("Eksik bilgi", "Lütfen restoran adı girin.");
            return;
        }
        try {
            setSaving(true);
            await updateDoc(doc(firestore, "restaurants", restaurantId), {
                name: form.name.trim(),
                imageUrl: form.imageUrl.trim(),
                address: form.address.trim(),
                cuisine: form.cuisine.trim(),
                description: form.description.trim(),
                isActive: !!form.isActive,
                updatedAt: Date.now(),
            });
            Alert.alert("Kaydedildi", "Restoran bilgileri güncellendi.");
        } catch (err: any) {
            Alert.alert("Kaydedilemedi", err?.message || "Lütfen tekrar deneyin.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
                    <ActivityIndicator color="#FE8C00" />
                    <Text style={{ marginTop: 8, color: "#475569", fontFamily: "ChairoSans" }}>Yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>Restaurant Details</Text>
                <Text style={styles.subtitle}>Update name, image, address, cuisine, description, and status.</Text>

                <View style={styles.field}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                        value={form.name}
                        onChangeText={(v) => handleChange("name", v)}
                        placeholder="Restaurant name"
                        placeholderTextColor="#94A3B8"
                        style={styles.input}
                    />
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Image URL</Text>
                    <TextInput
                        value={form.imageUrl}
                        onChangeText={(v) => handleChange("imageUrl", v)}
                        placeholder="https://..."
                        placeholderTextColor="#94A3B8"
                        style={styles.input}
                        autoCapitalize="none"
                    />
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Address</Text>
                    <TextInput
                        value={form.address}
                        onChangeText={(v) => handleChange("address", v)}
                        placeholder="Address"
                        placeholderTextColor="#94A3B8"
                        style={[styles.input, { minHeight: 48 }]}
                        multiline
                    />
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Cuisine</Text>
                    <TextInput
                        value={form.cuisine}
                        onChangeText={(v) => handleChange("cuisine", v)}
                        placeholder="e.g. Pizza, Burger"
                        placeholderTextColor="#94A3B8"
                        style={styles.input}
                    />
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                        value={form.description}
                        onChangeText={(v) => handleChange("description", v)}
                        placeholder="Short description"
                        placeholderTextColor="#94A3B8"
                        style={[styles.input, { minHeight: 80 }]}
                        multiline
                    />
                </View>

                <View style={[styles.field, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                    <View>
                        <Text style={styles.label}>Is Active</Text>
                        <Text style={styles.helper}>Toggle to show/hide restaurant for customers.</Text>
                    </View>
                    <Switch
                        value={form.isActive}
                        onValueChange={(v) => handleChange("isActive", v)}
                        thumbColor={form.isActive ? "#FE8C00" : "#E2E8F0"}
                        trackColor={{ false: "#E2E8F0", true: "#FFE7C2" }}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.saveButton, { opacity: saving || !canSave ? 0.7 : 1 }]}
                    onPress={handleSave}
                    disabled={saving || !canSave}
                >
                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveLabel}>Save changes</Text>}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#FFF6EC", padding: 16 },
    container: { paddingBottom: 40, gap: 14 },
    title: { fontFamily: "ChairoSans", fontSize: 22, color: "#0F172A", letterSpacing: -0.2 },
    subtitle: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    field: { gap: 6 },
    label: { fontFamily: "ChairoSans", fontSize: 14, color: "#0F172A" },
    helper: { fontFamily: "ChairoSans", fontSize: 12, color: "#64748B" },
    input: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: "ChairoSans",
        color: "#0F172A",
    },
    saveButton: {
        marginTop: 8,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: "#FE8C00",
        alignItems: "center",
    },
    saveLabel: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 15 },
});

export default RestaurantDetails;

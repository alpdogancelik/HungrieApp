import { SafeAreaView } from "react-native-safe-area-context";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    TextInput,
    Switch,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";

import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";

type MenuItem = {
    id: string;
    name: string;
    price?: number;
    categories?: string[];
    visible?: boolean;
};

type Category = {
    id: string;
    name: string;
};

const RestaurantMenuManager = () => {
    const { isAuthenticated } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [search, setSearch] = useState("");
    const [newCategoryName, setNewCategoryName] = useState("");
    const scrollViewRef = useRef<ScrollView | null>(null);

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

            try {
                const catSnap = await getDocs(
                    query(collection(firestore, "categories"), where("restaurantId", "==", owned)),
                );
                const catList: Category[] = catSnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id }));
                setCategories(catList);

                const menuSnap = await getDocs(query(collection(firestore, "menus"), where("restaurantId", "==", owned)));
                const menuList: MenuItem[] = menuSnap.docs.map((d) => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        name: data.name || d.id,
                        price: Number(data.price || 0),
                        categories: Array.isArray(data.categories) ? data.categories.map(String) : [],
                        visible: data.visible !== false,
                    };
                });
                setItems(menuList);
            } catch (err) {
                Alert.alert("Could not load menu", (err as any)?.message || "Please try again.");
            } finally {
                setLoading(false);
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    const toggleCategory = (itemId: string, categoryId: string) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== itemId) return item;
                const current = item.categories || [];
                const exists = current.includes(categoryId);
                const nextCategories = exists ? current.filter((c) => c !== categoryId) : [...current, categoryId];
                return { ...item, categories: nextCategories };
            }),
        );
    };

    const handleUpdateField = (itemId: string, field: keyof MenuItem, value: string | number | boolean) => {
        setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
    };

    const handleSaveItem = async (item: MenuItem) => {
        if (!firestore || !restaurantId) return;
        try {
            setSavingId(item.id);
            await updateDoc(doc(firestore, "menus", item.id), {
                categories: item.categories || [],
                name: item.name || "",
                price: Number(item.price || 0),
                visible: item.visible !== false,
                updatedAt: Date.now(),
            });
            Alert.alert("Saved", `${item.name} updated.`);
        } catch (err: any) {
            Alert.alert("Could not save", err?.message || "Please try again.");
        } finally {
            setSavingId(null);
        }
    };

    const handleAddCategory = async () => {
        if (!restaurantId || !firestore) return;
        const name = newCategoryName.trim();
        if (!name) {
            Alert.alert("Missing name", "Please enter a category name.");
            return;
        }
        try {
            const ref = await addDoc(collection(firestore, "categories"), {
                name,
                restaurantId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            setCategories((prev) => [...prev, { id: ref.id, name }]);
            setNewCategoryName("");
        } catch (err: any) {
            Alert.alert("Could not add", err?.message || "Please try again.");
        }
    };

    const handleUpdateCategory = async (cat: Category, nextName: string) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, "categories", cat.id), { name: nextName.trim() || cat.name, updatedAt: Date.now() });
            setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name: nextName } : c)));
        } catch (err: any) {
            Alert.alert("Could not update", err?.message || "Please try again.");
        }
    };

    const handleDeleteCategory = async (catId: string) => {
        if (!firestore) return;
        try {
            await deleteDoc(doc(firestore, "categories", catId));
            setCategories((prev) => prev.filter((c) => c.id !== catId));
            setItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    categories: (item.categories || []).filter((c) => c !== catId),
                })),
            );
        } catch (err: any) {
            Alert.alert("Could not delete", err?.message || "Please try again.");
        }
    };

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return items;
        return items.filter((item) => item.name.toLowerCase().includes(term));
    }, [items, search]);
    const itemCount = filteredItems.length;

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>Menu & Categories</Text>
                <Text style={styles.subtitle}>Assign items to categories. Toggle categories for each item and save.</Text>

                {/* Top-level quick actions */}
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.chipButton, styles.chipPrimary]}
                        onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
                    >
                        <Text style={styles.chipLabelPrimary}>Edit products</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.chipButton, styles.chipOutline]}
                        onPress={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    >
                        <Text style={styles.chipLabelOutline}>Edit categories</Text>
                    </TouchableOpacity>
                </View>

                <TextInput
                    placeholder="Search meals by name"
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={setSearch}
                    style={styles.searchInput}
                />

                {loading ? (
                    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
                        <ActivityIndicator color="#FE8C00" />
                        <Text style={styles.helper}>Loading menu…</Text>
                    </View>
                ) : itemCount === 0 ? (
                    <Text style={styles.helper}>No menu items found for this restaurant.</Text>
                ) : (
                    filteredItems.map((item) => (
                        <View key={item.id} style={styles.card}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <View>
                                    <TextInput
                                        value={item.name}
                                        onChangeText={(v) => handleUpdateField(item.id, "name", v)}
                                        placeholder="Name"
                                        placeholderTextColor="#94A3B8"
                                        style={styles.itemInput}
                                    />
                                    <TextInput
                                        value={String(item.price ?? 0)}
                                        onChangeText={(v) => handleUpdateField(item.id, "price", Number(v) || 0)}
                                        placeholder="Price"
                                        placeholderTextColor="#94A3B8"
                                        style={[styles.itemInput, { marginTop: 6 }]}
                                        keyboardType="numeric"
                                    />
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.saveButton,
                                        { opacity: savingId === item.id ? 0.7 : 1, paddingHorizontal: 14, paddingVertical: 10 },
                                    ]}
                                    disabled={savingId === item.id}
                                    onPress={() => handleSaveItem(item)}
                                >
                                    {savingId === item.id ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <Text style={styles.saveLabel}>Save</Text>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <Text style={[styles.label, { marginTop: 8 }]}>Categories</Text>
                            <View style={styles.pillRow}>
                                {categories.map((cat) => {
                                    const active = item.categories?.includes(cat.id);
                                    return (
                                        <TouchableOpacity
                                            key={`${item.id}-cat-${cat.id}`}
                                            style={[styles.pill, active ? styles.pillActive : null]}
                                            onPress={() => toggleCategory(item.id, cat.id)}
                                        >
                                            <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>
                                                {cat.name || cat.id}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                                {!categories.length ? <Text style={styles.helper}>No categories yet.</Text> : null}
                            </View>
                            <Text style={styles.helper}>
                                Assigned to:{" "}
                                {(item.categories || [])
                                    .map((cId) => categories.find((c) => c.id === cId)?.name || cId)
                                    .join(", ") || "None"}
                            </Text>

                            <View style={[styles.fieldRow, { marginTop: 8 }]}>
                                <View>
                                    <Text style={styles.label}>Visible</Text>
                                    <Text style={styles.helper}>Hide or show this item to customers.</Text>
                                </View>
                                <Switch
                                    value={item.visible !== false}
                                    onValueChange={(v) => handleUpdateField(item.id, "visible", v)}
                                    thumbColor={item.visible !== false ? "#FE8C00" : "#E2E8F0"}
                                    trackColor={{ false: "#E2E8F0", true: "#FFE7C2" }}
                                />
                            </View>
                        </View>
                    ))
                )}

                <View style={styles.categoryCard}>
                    <View style={[styles.actionRow, { marginTop: 0 }]}>
                        <TouchableOpacity
                            style={[styles.chipButton, styles.chipPrimary]}
                            onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
                        >
                            <Text style={styles.chipLabelPrimary}>Edit products</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.chipButton, styles.chipOutline]}
                            onPress={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                        >
                            <Text style={styles.chipLabelOutline}>Edit categories</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.sectionTitle}>Categories</Text>
                    <Text style={styles.helper}>Add, rename, or delete categories.</Text>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 }}>
                        <TextInput
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            placeholder="New category name"
                            placeholderTextColor="#94A3B8"
                            style={[styles.input, { flex: 1 }]}
                        />
                        <TouchableOpacity style={[styles.saveButton, { paddingHorizontal: 14, paddingVertical: 10 }]} onPress={handleAddCategory}>
                            <Text style={styles.saveLabel}>Add</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{ marginTop: 10, gap: 10 }}>
                        {categories.map((cat) => (
                            <View key={cat.id} style={styles.categoryRow}>
                                <TextInput
                                    value={cat.name}
                                    onChangeText={(v) => setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name: v } : c)))}
                                    onEndEditing={(e) => handleUpdateCategory(cat, e.nativeEvent.text)}
                                    placeholder="Category name"
                                    placeholderTextColor="#94A3B8"
                                    style={[styles.input, { flex: 1 }]}
                                />
                                <TouchableOpacity
                                    style={[styles.deleteButton]}
                                    onPress={() => handleDeleteCategory(cat.id)}
                                >
                                    <Text style={styles.deleteLabel}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                        {!categories.length ? <Text style={styles.helper}>No categories created yet.</Text> : null}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#FFF6EC", padding: 16 },
    container: { paddingBottom: 40, gap: 14 },
    title: { fontFamily: "ChairoSans", fontSize: 22, color: "#0F172A", letterSpacing: -0.2 },
    subtitle: { fontFamily: "ChairoSans", fontSize: 14, color: "#475569" },
    searchInput: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: "ChairoSans",
        color: "#0F172A",
    },
    helper: { fontFamily: "ChairoSans", fontSize: 12, color: "#64748B", marginTop: 4 },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 4 },
    chipButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: "center",
        borderWidth: 1,
    },
    chipPrimary: { backgroundColor: "#FE8C00", borderColor: "#FE8C00" },
    chipOutline: { backgroundColor: "rgba(254,140,0,0.08)", borderColor: "#FE8C00" },
    chipLabelPrimary: { fontFamily: "ChairoSans", color: "#FFFFFF", fontSize: 14 },
    chipLabelOutline: { fontFamily: "ChairoSans", color: "#C2410C", fontSize: 14 },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "#E2E8F0",
        padding: 12,
        gap: 8,
    },
    itemName: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    itemInput: {
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontFamily: "ChairoSans",
        color: "#0F172A",
        minWidth: 160,
    },
    label: { fontFamily: "ChairoSans", fontSize: 13, color: "#0F172A" },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
    },
    pillActive: { borderColor: "#FE8C00", backgroundColor: "rgba(254,140,0,0.12)" },
    pillLabel: { fontFamily: "ChairoSans", fontSize: 13, color: "#475569" },
    pillLabelActive: { color: "#FE8C00" },
    saveButton: {
        backgroundColor: "#FE8C00",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#FE8C00",
    },
    saveLabel: { color: "#FFFFFF", fontFamily: "ChairoSans", fontSize: 14 },
    fieldRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    categoryCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "#E2E8F0",
        padding: 12,
        gap: 10,
    },
    sectionTitle: { fontFamily: "ChairoSans", fontSize: 16, color: "#0F172A" },
    input: {
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontFamily: "ChairoSans",
        color: "#0F172A",
    },
    categoryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    deleteButton: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E11D48",
        backgroundColor: "rgba(225,29,72,0.08)",
    },
    deleteLabel: { fontFamily: "ChairoSans", fontSize: 13, color: "#9F1239" },
});

export default RestaurantMenuManager;

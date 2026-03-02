import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useRouter } from "expo-router";

import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import {
    PanelButton,
    PanelCard,
    PanelEmptyState,
    PanelLoadingState,
    PanelShell,
    panelDesign,
} from "@/src/features/restaurantPanel/ui";
import { LanguageSwitch } from "@/components/panel";
import { useRestaurantPanelLocale } from "@/src/features/restaurantPanel/panelLocale";

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
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isPhone = width < 420;
    const { isAuthenticated } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [search, setSearch] = useState("");
    const [newCategoryName, setNewCategoryName] = useState("");
    const scrollViewRef = useRef<ScrollView | null>(null);
    const { locale, setLocale, t } = useRestaurantPanelLocale(restaurantId);

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
                const catList: Category[] = catSnap.docs.map((snapshot) => {
                    const data = snapshot.data() as any;
                    return { id: snapshot.id, name: String(data.name || snapshot.id) };
                });
                setCategories(catList);

                const menuSnap = await getDocs(query(collection(firestore, "menus"), where("restaurantId", "==", owned)));
                const menuList: MenuItem[] = menuSnap.docs.map((snapshot) => {
                    const data = snapshot.data() as any;
                    return {
                        id: snapshot.id,
                        name: String(data.name || snapshot.id),
                        price: Number(data.price || 0),
                        categories: Array.isArray(data.categories) ? data.categories.map(String) : [],
                        visible: data.visible !== false,
                    };
                });
                setItems(menuList);
            } catch (err) {
                Alert.alert(
                    t("menu.loadFailedTitle"),
                    (err as any)?.message || t("common.tryAgain"),
                );
            } finally {
                setLoading(false);
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, [isAuthenticated]);

    const categoryById = useMemo(() => {
        return categories.reduce<Record<string, string>>((acc, category) => {
            acc[category.id] = category.name;
            return acc;
        }, {});
    }, [categories]);

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return items;
        return items.filter((item) => item.name.toLowerCase().includes(term));
    }, [items, search]);

    const toggleCategory = (itemId: string, categoryId: string) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== itemId) return item;
                const current = item.categories || [];
                const exists = current.includes(categoryId);
                const nextCategories = exists ? current.filter((currentId) => currentId !== categoryId) : [...current, categoryId];
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
            Alert.alert(t("menu.savedTitle"), t("menu.savedBody", { name: item.name }));
        } catch (err: any) {
            Alert.alert(
                t("menu.saveFailedTitle"),
                err?.message || t("common.tryAgain"),
            );
        } finally {
            setSavingId(null);
        }
    };

    const handleAddCategory = async () => {
        if (!restaurantId || !firestore) return;
        const name = newCategoryName.trim();
        if (!name) {
            Alert.alert(t("menu.missingNameTitle"), t("menu.missingNameBody"));
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
            Alert.alert(
                t("menu.addFailedTitle"),
                err?.message || t("common.tryAgain"),
            );
        }
    };

    const handleUpdateCategory = async (category: Category, nextName: string) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, "categories", category.id), {
                name: nextName.trim() || category.name,
                updatedAt: Date.now(),
            });
            setCategories((prev) =>
                prev.map((current) => (current.id === category.id ? { ...current, name: nextName } : current)),
            );
        } catch (err: any) {
            Alert.alert(
                t("menu.updateFailedTitle"),
                err?.message || t("common.tryAgain"),
            );
        }
    };

    const handleDeleteCategory = async (categoryId: string) => {
        if (!firestore) return;
        try {
            await deleteDoc(doc(firestore, "categories", categoryId));
            setCategories((prev) => prev.filter((category) => category.id !== categoryId));
            setItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    categories: (item.categories || []).filter((currentId) => currentId !== categoryId),
                })),
            );
        } catch (err: any) {
            Alert.alert(
                t("menu.deleteFailedTitle"),
                err?.message || t("common.tryAgain"),
            );
        }
    };

    return (
        <PanelShell
            kicker={t("common.restaurantHub")}
            title={t("menu.title")}
            subtitle={t("menu.subtitle")}
            onBackPress={isPhone ? undefined : () => router.push("/restaurantpanel")}
            backLabel={isPhone ? undefined : t("button.backToPanel")}
            backAccessibilityLabel={isPhone ? undefined : t("a11y.backToPanel")}
            right={
                isPhone ? (
                    <View style={styles.mobileHeaderTools}>
                        <PanelButton
                            label={t("button.backToPanel")}
                            variant="outline"
                            onPress={() => router.push("/restaurantpanel")}
                            accessibilityLabel={t("a11y.backToPanel")}
                            style={styles.mobileHeaderBackButton}
                        />
                        <LanguageSwitch
                            locale={locale}
                            onChange={(next) => void setLocale(next)}
                            getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })}
                        />
                    </View>
                ) : (
                    <LanguageSwitch
                        locale={locale}
                        onChange={(next) => void setLocale(next)}
                        getAccessibilityLabel={(next) => t("a11y.switchLanguage", { value: next.toUpperCase() })}
                    />
                )
            }
            noScroll
        >
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <PanelCard compact>
                    <View style={styles.quickActionRow}>
                        <PanelButton
                            label={t("menu.products")}
                            variant="outline"
                            onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
                            style={[styles.quickActionButton, isPhone ? styles.quickActionButtonPhone : null]}
                            accessibilityLabel={t("a11y.scrollToProducts")}
                        />
                        <PanelButton
                            label={t("menu.categories")}
                            variant="ghost"
                            onPress={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                            style={[styles.quickActionButton, isPhone ? styles.quickActionButtonPhone : null]}
                            accessibilityLabel={t("a11y.scrollToCategories")}
                        />
                    </View>

                    <TextInput
                        placeholder={t("menu.search")}
                        placeholderTextColor="#8895AA"
                        value={search}
                        onChangeText={setSearch}
                        style={styles.searchInput}
                        accessibilityLabel={t("a11y.searchMenuItems")}
                    />
                </PanelCard>

                {loading ? (
                    <PanelLoadingState title={t("loading.menuTitle")} description={t("loading.menuDescription")} />
                ) : !filteredItems.length ? (
                    <PanelEmptyState
                        title={t("menu.emptyTitle")}
                        description={t("menu.emptyDescription")}
                    />
                ) : (
                    filteredItems.map((item) => (
                        <PanelCard key={item.id} title={item.name} subtitle={t("menu.itemCardSubtitle")}>
                            <View style={[styles.fieldGrid, isPhone ? styles.fieldGridPhone : null]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>{t("menu.fieldName")}</Text>
                                    <TextInput
                                        value={item.name}
                                        onChangeText={(value) => handleUpdateField(item.id, "name", value)}
                                        placeholder={t("menu.fieldName")}
                                        placeholderTextColor="#8895AA"
                                        style={styles.input}
                                        accessibilityLabel={t("a11y.menuItemName", { name: item.name })}
                                    />
                                </View>
                                <View style={[styles.priceBlock, isPhone ? styles.priceBlockPhone : null]}>
                                    <Text style={styles.label}>{t("menu.fieldPrice")}</Text>
                                    <TextInput
                                        value={String(item.price ?? 0)}
                                        onChangeText={(value) => handleUpdateField(item.id, "price", Number(value) || 0)}
                                        placeholder="0"
                                        placeholderTextColor="#8895AA"
                                        style={styles.input}
                                        keyboardType="numeric"
                                        accessibilityLabel={t("a11y.menuItemPrice", { name: item.name })}
                                    />
                                </View>
                            </View>

                            <Text style={styles.label}>{t("menu.fieldCategories")}</Text>
                            <View style={styles.pillRow}>
                                {categories.map((category) => {
                                    const active = item.categories?.includes(category.id);
                                    return (
                                        <TouchableOpacity
                                            key={`${item.id}-cat-${category.id}`}
                                            style={[styles.pill, active ? styles.pillActive : null]}
                                            onPress={() => toggleCategory(item.id, category.id)}
                                            accessibilityRole="button"
                                            accessibilityLabel={t("a11y.toggleCategory", { category: category.name, item: item.name })}
                                        >
                                            <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>
                                                {category.name || category.id}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={styles.helper}>
                                {t("menu.assigned", { value: (item.categories || []).map((id) => categoryById[id] || id).join(", ") || t("common.none") })}
                            </Text>

                            <View style={styles.switchRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>{t("menu.visible")}</Text>
                                    <Text style={styles.helper}>{t("menu.visibleHint")}</Text>
                                </View>
                                <Switch
                                    value={item.visible !== false}
                                    onValueChange={(value) => handleUpdateField(item.id, "visible", value)}
                                    thumbColor={item.visible !== false ? panelDesign.colors.primary : "#E2E8F0"}
                                    trackColor={{ false: "#DCE3EE", true: "#FFE4C4" }}
                                />
                            </View>

                            <PanelButton
                                label={t("menu.saveItem")}
                                onPress={() => handleSaveItem(item)}
                                loading={savingId === item.id}
                                disabled={savingId === item.id}
                                accessibilityLabel={t("a11y.saveMenuItem", { name: item.name })}
                            />
                        </PanelCard>
                    ))
                )}

                <PanelCard title={t("menu.categoriesTitle")} subtitle={t("menu.categoriesSubtitle")}>
                    <View style={[styles.categoryAddRow, isPhone ? styles.categoryAddRowPhone : null]}>
                        <TextInput
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            placeholder={t("menu.newCategoryPlaceholder")}
                            placeholderTextColor="#8895AA"
                            style={[styles.input, { flex: 1 }]}
                            accessibilityLabel={t("a11y.newCategoryName")}
                        />
                        <PanelButton
                            label={t("menu.addCategory")}
                            variant="outline"
                            onPress={handleAddCategory}
                            accessibilityLabel={t("a11y.addCategory")}
                            style={isPhone ? styles.categoryAddButtonPhone : null}
                        />
                    </View>

                    {!categories.length ? (
                        <PanelEmptyState
                            title={t("menu.noCategoriesTitle")}
                            description={t("menu.noCategoriesDescription")}
                        />
                    ) : (
                        <View style={styles.categoryList}>
                            {categories.map((category) => (
                                <View key={category.id} style={[styles.categoryRow, isPhone ? styles.categoryRowPhone : null]}>
                                    <TextInput
                                        value={category.name}
                                        onChangeText={(value) =>
                                            setCategories((prev) =>
                                                prev.map((current) =>
                                                    current.id === category.id ? { ...current, name: value } : current,
                                                ),
                                            )
                                        }
                                        onEndEditing={(event) => handleUpdateCategory(category, event.nativeEvent.text)}
                                        placeholder={t("menu.categoryNamePlaceholder")}
                                        placeholderTextColor="#8895AA"
                                        style={[styles.input, { flex: 1 }]}
                                        accessibilityLabel={t("a11y.categoryName", { name: category.name })}
                                    />
                                    <PanelButton
                                        label={t("menu.deleteCategory")}
                                        variant="danger"
                                        onPress={() => handleDeleteCategory(category.id)}
                                        accessibilityLabel={t("a11y.deleteCategory", { name: category.name })}
                                        style={isPhone ? styles.categoryDeleteButtonPhone : null}
                                    />
                                </View>
                            ))}
                        </View>
                    )}
                </PanelCard>
            </ScrollView>
        </PanelShell>
    );
};

const styles = StyleSheet.create({
    mobileHeaderTools: {
        width: "100%",
        gap: 10,
        alignItems: "flex-start",
    },
    mobileHeaderBackButton: {
        width: "100%",
    },
    scrollContent: {
        paddingBottom: panelDesign.spacing.xl,
        gap: panelDesign.spacing.md,
    },
    quickActionRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    quickActionButton: {
        flexGrow: 1,
        minWidth: 140,
    },
    quickActionButtonPhone: {
        minWidth: 0,
        width: "100%",
    },
    searchInput: {
        minHeight: 46,
        borderRadius: panelDesign.radius.md,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: panelDesign.colors.text,
        fontFamily: "ChairoSans",
        fontSize: 16,
    },
    fieldGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    fieldGridPhone: {
        flexDirection: "column",
    },
    priceBlock: {
        minWidth: 140,
        flexGrow: 1,
    },
    priceBlockPhone: {
        minWidth: 0,
    },
    label: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: panelDesign.colors.text,
        marginBottom: 4,
    },
    input: {
        minHeight: 44,
        borderRadius: panelDesign.radius.md,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 12,
        paddingVertical: 9,
        color: panelDesign.colors.text,
        fontFamily: "ChairoSans",
        fontSize: 15,
    },
    pillRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    pill: {
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        borderRadius: 999,
        backgroundColor: panelDesign.colors.backgroundSoft,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    pillActive: {
        borderColor: panelDesign.colors.primary,
        backgroundColor: panelDesign.colors.primarySoft,
    },
    pillLabel: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        color: panelDesign.colors.muted,
    },
    pillLabelActive: {
        color: "#A34700",
    },
    helper: {
        fontFamily: "ChairoSans",
        fontSize: 13,
        color: panelDesign.colors.muted,
    },
    switchRow: {
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        borderRadius: panelDesign.radius.md,
        backgroundColor: panelDesign.colors.backgroundSoft,
        padding: panelDesign.spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: panelDesign.spacing.sm,
    },
    categoryAddRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    categoryAddRowPhone: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    categoryAddButtonPhone: {
        width: "100%",
    },
    categoryList: {
        gap: 8,
    },
    categoryRow: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
    },
    categoryRowPhone: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    categoryDeleteButtonPhone: {
        width: "100%",
    },
});

export default RestaurantMenuManager;

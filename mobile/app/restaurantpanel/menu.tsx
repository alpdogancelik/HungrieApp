import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useFocusEffect } from "@react-navigation/native";
import { Redirect, useRouter } from "expo-router";

import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/firebaseAuth";
import useAuthStore from "@/store/auth.store";
import {
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

type MenuView = "products" | "categories";

const RestaurantMenuManager = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isPhone = width < 420;
    const { isAuthenticated, isLoading: authLoading } = useAuthStore();
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [redirectTo, setRedirectTo] = useState<"/sign-in" | null>(null);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [search, setSearch] = useState("");
    const [showAddProductForm, setShowAddProductForm] = useState(false);
    const [newItemName, setNewItemName] = useState("");
    const [newItemPrice, setNewItemPrice] = useState("");
    const [newItemCategories, setNewItemCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [activeView, setActiveView] = useState<MenuView>("products");
    const [showScrollTop, setShowScrollTop] = useState(false);
    const listRef = useRef<FlatList<MenuItem> | null>(null);
    const { locale, ready, setLocale, t } = useRestaurantPanelLocale(restaurantId);
    const localeReady = !restaurantId || ready;

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (authLoading) return;
            if (!isAuthenticated || !firestore) {
                if (mounted) {
                    setRedirectTo("/sign-in");
                    setLoading(false);
                }
                return;
            }
            if (mounted) {
                setRedirectTo(null);
            }
            if (!firestore) {
                setLoading(false);
                return;
            }
            const owned = await getOwnedRestaurantId();
            if (!mounted) return;
            if (!owned) {
                setRedirectTo("/sign-in");
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
    }, [authLoading, isAuthenticated]);

    useFocusEffect(
        useCallback(() => {
            return () => {
                setItems([]);
                setCategories([]);
                setSearch("");
                setShowAddProductForm(false);
                setNewItemName("");
                setNewItemPrice("");
                setNewItemCategories([]);
                setNewCategoryName("");
                setActiveView("products");
                setShowScrollTop(false);
                setSavingId(null);
                setDeletingId(null);
                setLoading(true);
            };
        }, []),
    );

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

    const toggleNewItemCategory = (categoryId: string) => {
        setNewItemCategories((prev) =>
            prev.includes(categoryId) ? prev.filter((currentId) => currentId !== categoryId) : [...prev, categoryId],
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

    const handleAddProduct = async () => {
        if (!restaurantId || !firestore) return;
        const name = newItemName.trim();
        if (!name) {
            Alert.alert(t("menu.missingProductNameTitle"), t("menu.missingProductNameBody"));
            return;
        }

        try {
            const price = Number(newItemPrice || 0);
            const ref = await addDoc(collection(firestore, "menus"), {
                restaurantId,
                name,
                price: Number.isFinite(price) ? price : 0,
                categories: newItemCategories,
                visible: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            setItems((prev) => [
                {
                    id: ref.id,
                    name,
                    price: Number.isFinite(price) ? price : 0,
                    categories: newItemCategories,
                    visible: true,
                },
                ...prev,
            ]);
            setNewItemName("");
            setNewItemPrice("");
            setNewItemCategories([]);
            setShowAddProductForm(false);
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch (err: any) {
            Alert.alert(t("menu.addFailedTitle"), err?.message || t("common.tryAgain"));
        }
    };

    const handleDeleteItem = async (item: MenuItem) => {
        Alert.alert(
            t("menu.deleteItemConfirmTitle"),
            t("menu.deleteItemConfirmBody", { name: item.name }),
            [
                {
                    text: t("orders.cancel"),
                    style: "cancel",
                },
                {
                    text: t("orders.confirm"),
                    style: "destructive",
                    onPress: async () => {
                        if (!firestore) return;
                        try {
                            setDeletingId(item.id);
                            await deleteDoc(doc(firestore, "menus", item.id));
                            setItems((prev) => prev.filter((current) => current.id !== item.id));
                        } catch (err: any) {
                            Alert.alert(t("menu.deleteItemFailedTitle"), err?.message || t("common.tryAgain"));
                        } finally {
                            setDeletingId(null);
                        }
                    },
                },
            ],
        );
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

    const handleScrollTop = () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    if (redirectTo) {
        return <Redirect href={redirectTo} />;
    }

    const topControls = (
        <PanelCard compact>
            <TouchableOpacity
                onPress={() => setShowAddProductForm(true)}
                accessibilityRole="button"
                accessibilityLabel={t("a11y.addProduct")}
                activeOpacity={0.82}
                style={styles.addProductToggleButton}
            >
                <Text style={styles.addProductToggleButtonText}>{t("menu.addProduct")}</Text>
            </TouchableOpacity>

            <View style={styles.quickActionRow}>
                <TouchableOpacity
                    onPress={() => {
                        setActiveView("products");
                        listRef.current?.scrollToOffset({ offset: 0, animated: true });
                    }}
                    activeOpacity={0.82}
                    style={[
                        styles.quickActionToggle,
                        styles.quickActionButton,
                        isPhone ? styles.quickActionButtonPhone : null,
                        activeView === "products" ? styles.quickActionToggleActive : null,
                    ]}
                    accessibilityLabel={t("a11y.scrollToProducts")}
                >
                    <Text
                        style={[
                            styles.quickActionToggleText,
                            activeView === "products" ? styles.quickActionToggleTextActive : null,
                        ]}
                    >
                        {t("menu.products")}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => {
                        setActiveView("categories");
                        listRef.current?.scrollToOffset({ offset: 0, animated: true });
                    }}
                    activeOpacity={0.82}
                    style={[
                        styles.quickActionToggle,
                        styles.quickActionButton,
                        isPhone ? styles.quickActionButtonPhone : null,
                        activeView === "categories" ? styles.quickActionToggleActive : null,
                    ]}
                    accessibilityLabel={t("a11y.scrollToCategories")}
                >
                    <Text
                        style={[
                            styles.quickActionToggleText,
                            activeView === "categories" ? styles.quickActionToggleTextActive : null,
                        ]}
                    >
                        {t("menu.categories")}
                    </Text>
                </TouchableOpacity>
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
    );

    const renderFooter = () => (
        <View>
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
                    <TouchableOpacity
                        onPress={handleAddCategory}
                        activeOpacity={0.82}
                        accessibilityLabel={t("a11y.addCategory")}
                        style={[styles.categoryAddButton, isPhone ? styles.categoryAddButtonPhone : null]}
                    >
                        <Text style={styles.categoryAddButtonText}>{t("menu.addCategory")}</Text>
                    </TouchableOpacity>
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
                                <TouchableOpacity
                                    onPress={() => handleDeleteCategory(category.id)}
                                    activeOpacity={0.82}
                                    accessibilityLabel={t("a11y.deleteCategory", { name: category.name })}
                                    style={[styles.categoryDeleteButton, isPhone ? styles.categoryDeleteButtonPhone : null]}
                                >
                                    <Text style={styles.categoryDeleteButtonText}>{t("menu.deleteCategory")}</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
            </PanelCard>
        </View>
    );

    const renderItem = ({ item }: { item: MenuItem }) => (
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

            <View style={[styles.itemActionRow, isPhone ? styles.itemActionRowPhone : null]}>
                <TouchableOpacity
                    onPress={() => handleSaveItem(item)}
                    disabled={savingId === item.id || deletingId === item.id}
                    accessibilityLabel={t("a11y.saveMenuItem", { name: item.name })}
                    activeOpacity={0.82}
                    style={[
                        styles.saveItemButton,
                        (savingId === item.id || deletingId === item.id) ? styles.saveItemButtonDisabled : null,
                    ]}
                >
                    <Text style={styles.saveItemButtonText}>
                        {savingId === item.id ? `${t("menu.saveItem")}...` : t("menu.saveItem")}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => handleDeleteItem(item)}
                    disabled={deletingId === item.id || savingId === item.id}
                    accessibilityLabel={t("a11y.deleteMenuItem", { name: item.name })}
                    activeOpacity={0.82}
                    style={[
                        styles.deleteItemButton,
                        (deletingId === item.id || savingId === item.id) ? styles.saveItemButtonDisabled : null,
                    ]}
                >
                    <Text style={styles.deleteItemButtonText}>
                        {deletingId === item.id ? `${t("menu.deleteItem")}...` : t("menu.deleteItem")}
                    </Text>
                </TouchableOpacity>
            </View>
        </PanelCard>
    );

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
                        <TouchableOpacity
                            onPress={() => router.push("/restaurantpanel")}
                            activeOpacity={0.82}
                            accessibilityLabel={t("a11y.backToPanel")}
                            style={styles.mobileHeaderBackButton}
                        >
                            <View style={styles.mobileHeaderBackButtonContent}>
                                <View style={styles.mobileHeaderBackButtonIconWrap}>
                                    <Feather name="chevron-left" size={15} color="#B94900" />
                                </View>
                                <Text style={styles.mobileHeaderBackButtonText}>{t("button.backToPanel")}</Text>
                            </View>
                        </TouchableOpacity>
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
            <View style={styles.listWrap}>
                {topControls}

                <FlatList
                ref={listRef}
                data={loading || !localeReady ? [] : activeView === "products" ? filteredItems : []}
                renderItem={activeView === "products" ? renderItem : undefined}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                    loading || !localeReady ? (
                        <PanelLoadingState title={t("loading.menuTitle")} description={t("loading.menuDescription")} />
                    ) : activeView === "products" ? (
                        <PanelEmptyState
                            title={t("menu.emptyTitle")}
                            description={t("menu.emptyDescription")}
                        />
                    ) : null
                }
                ListFooterComponent={activeView === "categories" ? renderFooter : null}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={(event) => {
                    const nextVisible = event.nativeEvent.contentOffset.y > 260;
                    if (nextVisible !== showScrollTop) {
                        setShowScrollTop(nextVisible);
                    }
                }}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={5}
                />
            </View>

            <Modal
                visible={showAddProductForm}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setShowAddProductForm(false);
                    setNewItemName("");
                    setNewItemPrice("");
                    setNewItemCategories([]);
                }}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {
                        setShowAddProductForm(false);
                        setNewItemName("");
                        setNewItemPrice("");
                        setNewItemCategories([]);
                    }}
                    style={styles.modalOverlay}
                >
                    <TouchableOpacity activeOpacity={1} onPress={() => undefined} style={styles.modalCardWrap}>
                        <PanelCard title={t("menu.addProduct")} subtitle={t("menu.itemCardSubtitle")} style={styles.modalCard}>
                            <ScrollView
                                style={styles.modalContentScroll}
                                contentContainerStyle={styles.modalContentScrollBody}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                <View style={styles.addProductForm}>
                                    <View style={[styles.addProductRow, isPhone ? styles.addProductRowPhone : null]}>
                                        <View style={styles.addProductField}>
                                            <Text style={styles.label}>{t("menu.fieldName")}</Text>
                                            <TextInput
                                                value={newItemName}
                                                onChangeText={setNewItemName}
                                                placeholder={t("menu.newProductNamePlaceholder")}
                                                placeholderTextColor="#8895AA"
                                                style={[styles.input, styles.addProductNameInput]}
                                                accessibilityLabel={t("a11y.newProductName")}
                                            />
                                        </View>
                                        <View style={[styles.addProductField, styles.addProductPriceField, isPhone ? styles.addProductPriceFieldPhone : null]}>
                                            <Text style={styles.label}>{t("menu.fieldPrice")}</Text>
                                            <TextInput
                                                value={newItemPrice}
                                                onChangeText={setNewItemPrice}
                                                placeholder={t("menu.newProductPricePlaceholder")}
                                                placeholderTextColor="#8895AA"
                                                style={[styles.input, styles.addProductPriceInput, isPhone ? styles.addProductPriceInputPhone : null]}
                                                keyboardType="numeric"
                                                accessibilityLabel={t("a11y.newProductPrice")}
                                            />
                                        </View>
                                    </View>

                                    {categories.length ? (
                                        <View style={styles.addProductCategoryBlock}>
                                            <Text style={styles.label}>{t("menu.fieldCategories")}</Text>
                                            <View style={styles.pillRow}>
                                                {categories.map((category) => {
                                                    const active = newItemCategories.includes(category.id);
                                                    return (
                                                        <TouchableOpacity
                                                            key={`new-item-cat-${category.id}`}
                                                            style={[styles.pill, active ? styles.pillActive : null]}
                                                            onPress={() => toggleNewItemCategory(category.id)}
                                                            accessibilityRole="button"
                                                            accessibilityLabel={t("a11y.toggleNewProductCategory", { category: category.name })}
                                                        >
                                                            <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]}>
                                                                {category.name || category.id}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                            <Text style={styles.helper}>
                                                {t("menu.assigned", { value: newItemCategories.map((id) => categoryById[id] || id).join(", ") || t("common.none") })}
                                            </Text>
                                        </View>
                                    ) : null}

                                    <View style={[styles.modalActionRow, isPhone ? styles.modalActionRowPhone : null]}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setShowAddProductForm(false);
                                                setNewItemName("");
                                                setNewItemPrice("");
                                                setNewItemCategories([]);
                                            }}
                                            accessibilityRole="button"
                                            accessibilityLabel={t("button.close")}
                                            activeOpacity={0.82}
                                            style={styles.modalCloseButton}
                                        >
                                            <Text style={styles.modalCloseButtonText}>{t("button.close")}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleAddProduct}
                                            accessibilityRole="button"
                                            accessibilityLabel={t("a11y.addProduct")}
                                            activeOpacity={0.82}
                                            style={styles.addProductButton}
                                        >
                                            <Text style={styles.addProductButtonText}>{t("menu.addProduct")}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </ScrollView>
                        </PanelCard>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {showScrollTop ? (
                <TouchableOpacity
                    onPress={handleScrollTop}
                    accessibilityRole="button"
                    accessibilityLabel="Go up"
                    activeOpacity={0.82}
                    style={styles.scrollTopButton}
                >
                    <Feather name="arrow-up" size={18} color="#FFFFFF" />
                    <Text style={styles.scrollTopButtonText}>Go up</Text>
                </TouchableOpacity>
            ) : null}
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
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#EE7A14",
        backgroundColor: "#FFF5EA",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    mobileHeaderBackButtonContent: {
        width: "100%",
        minHeight: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        paddingHorizontal: 18,
    },
    mobileHeaderBackButtonIconWrap: {
        position: "absolute",
        left: 0,
        top: "50%",
        marginTop: -7.5,
    },
    mobileHeaderBackButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 17,
        textAlign: "center",
        color: "#B94900",
        fontWeight: "600",
    },
    listWrap: {
        flex: 1,
        gap: panelDesign.spacing.md,
    },
    scrollContent: {
        paddingBottom: panelDesign.spacing.xl,
        gap: panelDesign.spacing.md,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(20, 16, 10, 0.28)",
        justifyContent: "center",
        padding: panelDesign.spacing.md,
    },
    modalCardWrap: {
        width: "100%",
        alignSelf: "center",
        maxWidth: 560,
        maxHeight: "88%",
    },
    modalCard: {
        width: "100%",
    },
    modalContentScroll: {
        maxHeight: "100%",
    },
    modalContentScrollBody: {
        paddingBottom: 2,
    },
    addProductRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    addProductForm: {
        gap: 10,
    },
    addProductRowPhone: {
        flexDirection: "column",
        alignItems: "stretch",
    },
    addProductToggleButton: {
        minHeight: 44,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    addProductToggleButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: "#FFFFFF",
    },
    addProductCategoryBlock: {
        gap: 8,
        marginTop: 4,
    },
    addProductNameInput: {
        flex: 1,
    },
    addProductPriceInput: {
        width: 120,
    },
    addProductPriceInputPhone: {
        width: "100%",
    },
    addProductField: {
        flex: 1,
        minWidth: 0,
    },
    addProductPriceField: {
        maxWidth: 160,
    },
    addProductPriceFieldPhone: {
        maxWidth: "100%",
    },
    addProductButton: {
        minHeight: 44,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    addProductButtonPhone: {
        width: "100%",
    },
    modalActionRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 4,
    },
    modalActionRowPhone: {
        flexDirection: "column",
    },
    modalCloseButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: panelDesign.colors.border,
        backgroundColor: panelDesign.colors.backgroundSoft,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    modalCloseButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        color: panelDesign.colors.text,
    },
    addProductButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: "#FFFFFF",
    },
    scrollTopButton: {
        position: "absolute",
        right: panelDesign.spacing.md,
        bottom: panelDesign.spacing.lg,
        minHeight: 44,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    scrollTopButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        color: "#FFFFFF",
    },
    quickActionRow: {
        flexDirection: "row",
        gap: 8,
    },
    quickActionButton: {
        flex: 1,
        minWidth: 0,
    },
    quickActionButtonPhone: {
        flex: 1,
        minWidth: 0,
    },
    quickActionToggle: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E8D8C5",
        backgroundColor: "#FFF8F0",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    quickActionToggleActive: {
        borderColor: "#EE7A14",
        backgroundColor: "#FFF1E3",
    },
    quickActionToggleText: {
        fontFamily: "ChairoSans",
        fontSize: 15,
        lineHeight: 18,
        color: "#44556F",
        textAlign: "center",
        fontWeight: "600",
    },
    quickActionToggleTextActive: {
        color: "#C85B00",
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
    itemActionRow: {
        flexDirection: "row",
        gap: 8,
    },
    itemActionRowPhone: {
        flexDirection: "column",
    },
    saveItemButton: {
        flex: 1,
        minHeight: 46,
        borderRadius: 999,
        backgroundColor: "#FE8C00",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    saveItemButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: "#FFFFFF",
    },
    deleteItemButton: {
        flex: 1,
        minHeight: 46,
        borderRadius: 999,
        backgroundColor: panelDesign.colors.dangerSoft,
        borderWidth: 1,
        borderColor: "#EDC3CD",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    deleteItemButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: panelDesign.colors.danger,
    },
    saveItemButtonDisabled: {
        opacity: 0.55,
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
    categoryAddButton: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#EE7A14",
        backgroundColor: "#FFF5EA",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    categoryAddButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: "#B94900",
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
    categoryDeleteButton: {
        minHeight: 44,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#EDC3CD",
        backgroundColor: panelDesign.colors.dangerSoft,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    categoryDeleteButtonText: {
        fontFamily: "ChairoSans",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0.2,
        color: panelDesign.colors.danger,
    },
});

export default RestaurantMenuManager;

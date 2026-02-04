import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import {
    createMenuItem,
    getRestaurants,
    getRestaurantMenu,
    updateMenuItem,
} from "@/lib/firebase";

type MenuFormState = {
    name: string;
    price: string;
    description: string;
    imageUrl: string;
};

const INITIAL_FORM: MenuFormState = {
    name: "",
    price: "",
    description: "",
    imageUrl: "",
};

const MenuEditor = () => {
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(true);
    const [restaurantsError, setRestaurantsError] = useState<string | null>(null);

    const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
    const [menuItems, setMenuItems] = useState<any[]>([]);
    const [menuLoading, setMenuLoading] = useState(false);
    const [menuError, setMenuError] = useState<string | null>(null);

    const [form, setForm] = useState<MenuFormState>(INITIAL_FORM);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const selectedRestaurant = useMemo(
        () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null,
        [restaurants, selectedRestaurantId],
    );

    const resetForm = useCallback(() => {
        setForm(INITIAL_FORM);
        setEditingItemId(null);
    }, []);

    const loadRestaurants = useCallback(async () => {
        setRestaurantsLoading(true);
        setRestaurantsError(null);
        try {
            const list = await getRestaurants();
            setRestaurants(list);
            if (!selectedRestaurantId && list.length > 0) {
                setSelectedRestaurantId(String(list[0].id));
            }
        } catch (error: any) {
            setRestaurantsError(error?.message || "Unable to load restaurants.");
        } finally {
            setRestaurantsLoading(false);
        }
    }, [selectedRestaurantId]);

    const loadMenu = useCallback(
        async (restaurantId?: string | null) => {
            if (!restaurantId) return;
            setMenuLoading(true);
            setMenuError(null);
            try {
                const list = await getRestaurantMenu(String(restaurantId));
                setMenuItems(Array.isArray(list) ? list : []);
            } catch (error: any) {
                setMenuError(error?.message || "Unable to load menu items.");
            } finally {
                setMenuLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        loadRestaurants();
    }, [loadRestaurants]);

    useEffect(() => {
        loadMenu(selectedRestaurantId);
        resetForm();
    }, [selectedRestaurantId, loadMenu, resetForm]);

    const handleSelectRestaurant = (restaurantId: string) => {
        setSelectedRestaurantId(restaurantId);
    };

    const handleEditItem = (item: any) => {
        setEditingItemId(String(item.id));
        setForm({
            name: item.name || "",
            price: String(item.price ?? ""),
            description: item.description || "",
            imageUrl: item.imageUrl || item.image_url || "",
        });
    };

    const handleChange = (field: keyof MenuFormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        if (!selectedRestaurantId) {
            Alert.alert("Select a restaurant", "Choose a restaurant before saving menu items.");
            return;
        }
        if (!form.name || !form.price) {
            Alert.alert("Incomplete details", "Name and price are required.");
            return;
        }
        const parsedPrice = Number(form.price);
        if (Number.isNaN(parsedPrice)) {
            Alert.alert("Invalid price", "Enter a valid numeric price (e.g. 129.90).");
            return;
        }

        setSaving(true);
        try {
            if (editingItemId) {
                await updateMenuItem(editingItemId, {
                    name: form.name.trim(),
                    price: parsedPrice,
                    description: form.description.trim(),
                    imageUrl: form.imageUrl.trim(),
                });
                Alert.alert("Menu item updated", `${form.name} was updated successfully.`);
            } else {
                await createMenuItem(String(selectedRestaurantId), {
                    name: form.name.trim(),
                    price: parsedPrice,
                    description: form.description.trim(),
                    imageUrl: form.imageUrl.trim(),
                });
                Alert.alert("Menu item added", `${form.name} was added to the menu.`);
            }
            await loadMenu(selectedRestaurantId);
            resetForm();
        } catch (error: any) {
            Alert.alert("Unable to save item", error?.message || "Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <View className="gap-5">
            <View className="gap-1">
                <Text className="text-2xl font-ezra-bold text-dark-100">Menu management</Text>
                <Text className="text-base text-dark-60">
                    Curate every restaurant menu, keep pricing accurate, and update hero images from one place.
                </Text>
            </View>

            <View className="gap-3">
                <Text className="text-xs uppercase tracking-[3px] text-dark-60">Restaurants</Text>
                {restaurantsLoading ? (
                    <View className="rounded-3xl border border-gray-100 bg-white/90 p-4 items-center justify-center">
                        <ActivityIndicator color="#FE8C00" />
                    </View>
                ) : restaurantsError ? (
                    <View className="rounded-3xl border border-red-100 bg-red-50 p-4">
                        <Text className="text-base font-ezra-semibold text-red-900">{restaurantsError}</Text>
                        <TouchableOpacity
                            className="mt-2 self-start rounded-full bg-red-600 px-4 py-2"
                            onPress={loadRestaurants}
                        >
                            <Text className="text-white text-sm font-ezra-semibold">Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 12, paddingVertical: 2 }}
                    >
                        {restaurants.map((restaurant) => {
                            const active = String(restaurant.id) === selectedRestaurantId;
                            return (
                                <TouchableOpacity
                                    key={restaurant.id}
                                    onPress={() => handleSelectRestaurant(String(restaurant.id))}
                                    className={`rounded-2xl border px-4 py-3 ${
                                        active
                                            ? "bg-dark-100 border-dark-100"
                                            : "bg-white/95 border-gray-100"
                                    }`}
                                >
                                    <Text
                                        className={`text-base font-ezra-semibold ${
                                            active ? "text-white" : "text-dark-80"
                                        }`}
                                    >
                                        {restaurant.name || "Restaurant"}
                                    </Text>
                                    {restaurant.cuisine && (
                                        <Text className={`text-xs ${active ? "text-white/70" : "text-dark-60"}`}>
                                            {restaurant.cuisine}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}
            </View>

            <View className="gap-3">
                <Text className="text-xs uppercase tracking-[3px] text-dark-60">
                    {selectedRestaurant ? selectedRestaurant.name : "Menu"}
                </Text>
                {menuLoading ? (
                    <View className="rounded-3xl border border-gray-100 bg-white/90 p-6 items-center justify-center">
                        <ActivityIndicator color="#FE8C00" />
                        <Text className="mt-2 text-sm text-dark-60">Loading menu items...</Text>
                    </View>
                ) : menuError ? (
                    <View className="rounded-3xl border border-red-100 bg-red-50 p-4">
                        <Text className="text-base font-ezra-semibold text-red-900">{menuError}</Text>
                        <TouchableOpacity
                            className="mt-2 self-start rounded-full bg-red-600 px-4 py-2"
                            onPress={() => loadMenu(selectedRestaurantId)}
                        >
                            <Text className="text-white text-sm font-ezra-semibold">Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : menuItems.length === 0 ? (
                    <View className="rounded-3xl border border-dashed border-gray-200 bg-white/80 p-6 items-center">
                        <Text className="text-base font-ezra-semibold text-dark-80">No menu items yet</Text>
                        <Text className="mt-1 text-sm text-dark-60">
                            Start by adding signature dishes below.
                        </Text>
                    </View>
                ) : (
                    <View className="gap-3">
                        {menuItems.map((item) => (
                            <View
                                key={item.id}
                                className="rounded-3xl border border-gray-100 bg-white/95 p-4 flex-row gap-4 items-center"
                            >
                                {item.imageUrl || item.image_url ? (
                                    <Image
                                        source={{ uri: item.imageUrl || item.image_url }}
                                        className="h-16 w-16 rounded-2xl bg-gray-100"
                                    />
                                ) : (
                                    <View className="h-16 w-16 rounded-2xl bg-gray-100 items-center justify-center">
                                        <Text className="text-xs text-dark-60">No image</Text>
                                    </View>
                                )}
                                <View className="flex-1">
                                    <Text className="text-base font-ezra-semibold text-dark-100">
                                        {item.name || "Menu item"}
                                    </Text>
                                    {item.description && (
                                        <Text className="text-sm text-dark-60" numberOfLines={2}>
                                            {item.description}
                                        </Text>
                                    )}
                                    <Text className="text-sm font-ezra-semibold text-primary-dark mt-1">
                                        TRY {Number(item.price || 0).toFixed(2)}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => handleEditItem(item)}
                                    className="rounded-full border border-dark-100 px-4 py-2"
                                >
                                    <Text className="text-sm font-ezra-semibold text-dark-100">Edit</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            <View className="gap-4 rounded-3xl border border-gray-100 bg-white/95 p-5">
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="text-lg font-ezra-bold text-dark-100">
                            {editingItemId ? "Update menu item" : "Add menu item"}
                        </Text>
                        <Text className="text-sm text-dark-60">
                            {editingItemId ? "Edit details and save to update this dish." : "Fill out the details below to add a new dish."}
                        </Text>
                    </View>
                    {editingItemId && (
                        <TouchableOpacity onPress={resetForm}>
                            <Text className="text-sm font-ezra-semibold text-primary-dark">New item</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View className="gap-3">
                    <View>
                        <Text className="text-xs uppercase tracking-[3px] text-dark-60">Dish name</Text>
                        <TextInput
                            value={form.name}
                            onChangeText={(value) => handleChange("name", value)}
                            placeholder="Campus Smash Burger"
                            className="mt-1 rounded-2xl border border-gray-100 px-4 py-3 text-dark-100"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>
                    <View className="flex-row gap-3">
                        <View className="flex-1">
                            <Text className="text-xs uppercase tracking-[3px] text-dark-60">Price (TRY)</Text>
                            <TextInput
                                value={form.price}
                                onChangeText={(value) => handleChange("price", value)}
                                placeholder="149.90"
                                keyboardType="decimal-pad"
                                className="mt-1 rounded-2xl border border-gray-100 px-4 py-3 text-dark-100"
                                placeholderTextColor="#94A3B8"
                            />
                        </View>
                    </View>
                    <View>
                        <Text className="text-xs uppercase tracking-[3px] text-dark-60">Description</Text>
                        <TextInput
                            value={form.description}
                            onChangeText={(value) => handleChange("description", value)}
                            placeholder="Add the hero details students care about."
                            className="mt-1 rounded-2xl border border-gray-100 px-4 py-3 text-dark-100"
                            placeholderTextColor="#94A3B8"
                            multiline
                        />
                    </View>
                    <View>
                        <Text className="text-xs uppercase tracking-[3px] text-dark-60">Image URL</Text>
                        <TextInput
                            value={form.imageUrl}
                            onChangeText={(value) => handleChange("imageUrl", value)}
                            placeholder="https://images.unsplash.com/..."
                            className="mt-1 rounded-2xl border border-gray-100 px-4 py-3 text-dark-100"
                            placeholderTextColor="#94A3B8"
                        />
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={saving}
                    className={`rounded-2xl bg-primary-dark px-4 py-3 ${saving ? "opacity-70" : "opacity-100"}`}
                >
                    <Text className="text-center text-base font-ezra-semibold text-white">
                        {saving ? "Saving..." : editingItemId ? "Update item" : "Add item"}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default MenuEditor;


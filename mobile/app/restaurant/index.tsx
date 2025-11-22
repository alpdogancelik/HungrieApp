import { useCallback, useEffect, useMemo, useState } from "react";

import {

    ActivityIndicator,

    Alert,

    Image,

    ScrollView,

    Switch,

    Text,

    TextInput,

    TouchableOpacity,

    View,

} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import useServerResource from "@/lib/useServerResource";

import OrderCard from "@/components/OrderCard";

import type { OrderStatus, RestaurantOrder } from "@/type";

import { subscribeRestaurantAlerts } from "@/src/services/order";

import * as Haptics from "expo-haptics";

import {

    createMenuItem as createMenuItemDocument,

    createRestaurant as createRestaurantDocument,

    getOwnerRestaurants as getOwnerRestaurantsAppwrite,

    getRestaurantMenu as getRestaurantMenuAppwrite,

    getRestaurantOrders as getRestaurantOrdersAppwrite,

    updateOrderStatus as updateOrderStatusAppwrite,

} from "@/lib/firebaseAuth";

import { getHiddenItemsForRestaurant, setMenuItemVisibility } from "@/lib/menuVisibility";

import { searchFoodImages, type PexelsImage } from "@/lib/pexels";
import { images } from "@/constants/mediaCatalog";
import { resolveRestaurantImageSource } from "@/lib/assets";



type RestaurantFormState = {

    name: string;

    cuisine: string;

    description: string;

    imageUrl: string;

};



type MenuFormState = {

    name: string;

    price: string;

    description: string;

    imageUrl: string;

};



type OwnerRestaurant = {

    id?: string | number;

    $id?: string;

    name: string;

    cuisine?: string;

    description?: string;

    deliveryFee?: string | number;

    deliveryTime?: string | number;

    imageUrl?: string;

};



const EmptyState = ({ message }: { message: string }) => (

    <View className="items-center justify-center py-10">

        <Image source={images.emptyState} className="w-32 h-32" resizeMode="contain" />

        <Text className="body-medium text-dark-60 mt-4">{message}</Text>

    </View>

);



const InputField = ({

    label,

    value,

    placeholder,

    onChangeText,

    multiline = false,

}: {

    label: string;

    value: string;

    placeholder: string;

    multiline?: boolean;

    onChangeText: (text: string) => void;

}) => (

    <View className="gap-2">

        <Text className="paragraph-semibold text-dark-80">{label}</Text>

        <TextInput

            className="border border-gray-100 rounded-2xl px-4 py-3 text-dark-100"

            placeholder={placeholder}

            placeholderTextColor="#94A3B8"

            value={value}

            multiline={multiline}

            onChangeText={onChangeText}

        />

    </View>

);



type MenuRowProps = {

    item: any;

    visible: boolean;

    onToggleVisibility?: (nextValue: boolean) => void;

};



const MenuRow = ({ item, visible, onToggleVisibility }: MenuRowProps) => {

    const price = Number(item.price || 0).toFixed(2);

    const img = item.imageUrl || item.image_url;

    return (

        <View className="flex-row items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3">

            <View className="size-16 rounded-2xl overflow-hidden bg-gray-100">

                <Image

                    source={img ? { uri: img } : images.burgerOne}

                    className="w-full h-full"

                    resizeMode="cover"

                />

            </View>

            <View className="flex-1">

                <Text className="paragraph-semibold text-dark-100" numberOfLines={1}>{item.name || "Menu item"}</Text>

                <Text className="body-medium text-dark-60" numberOfLines={1}>{item.description || "Listed on delivery menu"}</Text>

            </View>

            <View className="items-end gap-2">

                <Text className="paragraph-semibold text-dark-100">TRY {price}</Text>

                <View className="items-center gap-1">

                    <Text className={`body-medium ${visible ? "text-primary" : "text-red-500"}`}>

                        {visible ? "GÃ¶rÃ¼nÃ¼r" : "Gizli"}

                    </Text>

                    <Switch

                        value={visible}

                        onValueChange={(value) => onToggleVisibility?.(value)}

                    />

                </View>

            </View>

        </View>

    );

};



const resolveRestaurantImage = (value?: string | number) => {
    const resolved = resolveRestaurantImageSource(value);
    if (typeof resolved === "number") return resolved;
    if (resolved) return { uri: resolved };
    return images.logo;
};



const RestaurantConsole = () => {

    const { data: ownerRestaurants, loading: restaurantsLoading, refetch: refetchRestaurants } = useServerResource({ fn: getOwnerRestaurantsAppwrite });

    const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);

    const [restaurantForm, setRestaurantForm] = useState<RestaurantFormState>({ name: "", cuisine: "", description: "", imageUrl: "" });

    const [menuForm, setMenuForm] = useState<MenuFormState>({ name: "", price: "", description: "", imageUrl: "" });

    const [creatingRestaurant, setCreatingRestaurant] = useState(false);

    const [creatingMenuItem, setCreatingMenuItem] = useState(false);

    const [imageResults, setImageResults] = useState<PexelsImage[]>([]);

    const [searchingImages, setSearchingImages] = useState(false);

    const [hiddenItems, setHiddenItems] = useState<Record<string, boolean>>({});



    const fetchMenu = useCallback(async (restaurantId?: string) => {

        if (!restaurantId) return [];

        return getRestaurantMenuAppwrite({ restaurantId });

    }, []);



    const fetchOrders = useCallback(async (restaurantId?: string) => {

        if (!restaurantId) return [];

        return getRestaurantOrdersAppwrite(restaurantId);

    }, []);



    const { data: menuItems, loading: menuLoading, refetch: refetchMenu } = useServerResource<any[], string>({

        fn: fetchMenu,

        immediate: false,

        skipAlert: true,

    });

    const { data: restaurantOrders, loading: ordersLoading, refetch: refetchOrders } = useServerResource<any[], string>({

        fn: fetchOrders,

        immediate: false,

        skipAlert: true,

    });



    useEffect(() => {

        if (ownerRestaurants?.length && !activeRestaurantId) {

            const firstId = String(ownerRestaurants[0].id ?? ownerRestaurants[0].$id);

            setActiveRestaurantId(firstId);

        }

    }, [ownerRestaurants, activeRestaurantId]);



    useEffect(() => {

        if (activeRestaurantId) {

            refetchMenu(activeRestaurantId);

            refetchOrders(activeRestaurantId);

        }

    }, [activeRestaurantId, refetchMenu, refetchOrders]);



    useEffect(() => {
        if (!activeRestaurantId) {
            setHiddenItems({});
            return;
        }
        getHiddenItemsForRestaurant(activeRestaurantId)
            .then((map) => setHiddenItems(map))
            .catch(() => setHiddenItems({}));
    }, [activeRestaurantId, menuItems]);

    useEffect(() => {
        const unsubscribe = subscribeRestaurantAlerts(({ orderId }) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
            Alert.alert("Yeni hatÄ±rlatma", `#${orderId} numaralÄ± sipariÅŸ iÃ§in mÃ¼ÅŸteri sizi uyardÄ±.`);
        });
        return () => {
            unsubscribe();
        };
    }, []);

    const activeRestaurant = useMemo<OwnerRestaurant | null>(() => {

        if (!ownerRestaurants?.length || !activeRestaurantId) return null;

        return ownerRestaurants.find((rest: OwnerRestaurant) => String(rest.id ?? rest.$id) === activeRestaurantId) || null;

    }, [ownerRestaurants, activeRestaurantId]);



    const stats = useMemo(() => {

        const orders = restaurantOrders || [];

        const revenue = orders.reduce((sum, order: RestaurantOrder) => sum + Number(order.total || 0), 0);

        const pending = orders.filter((order: RestaurantOrder) => order.status === "pending").length;

        const ready = orders.filter((order: RestaurantOrder) => order.status === "ready").length;

        return {

            revenue: revenue.toFixed(2),

            orderCount: orders.length,

            pending,

            ready,

        };

    }, [restaurantOrders]);



    const decoratedMenuItems = useMemo(

        () =>

            (menuItems || []).map((item: any) => {

                const id = String(item.$id ?? item.id ?? item.name);

                return { ...item, visible: !hiddenItems[id] };

            }),

        [menuItems, hiddenItems],

    );



    const handleCreateRestaurant = async () => {

        if (!restaurantForm.name.trim()) {

            return Alert.alert("Add restaurant", "Name field is required.");

        }

        try {

            setCreatingRestaurant(true);

            await createRestaurantDocument({ ...restaurantForm });

            setRestaurantForm({ name: "", cuisine: "", description: "", imageUrl: "" });

            await refetchRestaurants();

        } catch (error: any) {

            Alert.alert("Unable to create restaurant", error?.message || "Please try again.");

        } finally {

            setCreatingRestaurant(false);

        }

    };



    const handleAddMenuItem = async () => {

        if (!activeRestaurantId) {

            return Alert.alert("Select restaurant", "Choose a restaurant before adding menu items.");

        }

        if (!menuForm.name.trim() || !menuForm.price.trim()) {

            return Alert.alert("Missing fields", "Item name and price are required.");

        }

        try {

            setCreatingMenuItem(true);

            await createMenuItemDocument(activeRestaurantId, menuForm);

            setMenuForm({ name: "", price: "", description: "", imageUrl: "" });

            setImageResults([]);

            await refetchMenu(activeRestaurantId);

        } catch (error: any) {

            Alert.alert("Unable to add item", error?.message || "Try again.");

        } finally {

            setCreatingMenuItem(false);

        }

    };



    const handleToggleMenuVisibility = async (itemId: string, nextVisible: boolean) => {

        if (!activeRestaurantId) return;

        try {

            await setMenuItemVisibility(activeRestaurantId, itemId, nextVisible);

            setHiddenItems((prev) => {

                const updated = { ...prev };

                if (nextVisible) {

                    delete updated[itemId];

                } else {

                    updated[itemId] = true;

                }

                return updated;

            });

        } catch (error: any) {

            Alert.alert("GÃ¶rÃ¼nÃ¼rlÃ¼k gÃ¼ncellenemedi", error?.message || "LÃ¼tfen tekrar deneyin.");

        }

    };



    const handleSearchImages = async () => {

        if (!menuForm.name.trim()) {

            Alert.alert("Add item name", "Enter the item name before searching images.");

            return;

        }

        try {

            setSearchingImages(true);

            const photos = await searchFoodImages(menuForm.name);

            setImageResults(photos);

        } catch (error: any) {

            Alert.alert("Pexels error", error?.message || "Unable to load images right now.");

        } finally {

            setSearchingImages(false);

        }

    };



    const handleStatusChange = async (orderId: string, status: OrderStatus) => {

        try {

            await updateOrderStatusAppwrite(orderId, status);

            if (activeRestaurantId) {

                await refetchOrders(activeRestaurantId);

            }

        } catch (error: any) {

            Alert.alert("Update failed", error?.message || "Could not update order status.");

        }

    };



    return (

        <SafeAreaView className="flex-1 bg-gray-50">

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>

                <View className="px-5 pt-6 gap-6">

                    <View className="gap-1">

                        <Text className="small-bold text-primary">Restaurant console</Text>

                        <Text className="text-3xl font-ezra-bold text-dark-100">Basit panel ile sipariÅŸi yÃ¶net</Text>

                        <Text className="body-medium text-dark-60">Gereksiz modÃ¼ller kapatÄ±ldÄ±; sadece restoran, menÃ¼ ve sipariÅŸ akÄ±ÅŸÄ± kaldÄ±.</Text>

                    </View>



                    <View className="bg-dark-100 rounded-3xl p-5 gap-4">

                        <Text className="text-white/70 text-xs uppercase tracking-[4px]">active restaurant</Text>

                        <Text className="text-3xl font-ezra-bold text-white">{activeRestaurant?.name || "No restaurant selected"}</Text>

                        <View className="flex-row gap-4">

                            <View className="flex-1 bg-white/10 rounded-2xl p-3">

                                <Text className="text-white/70 text-xs uppercase">Orders</Text>

                                <Text className="text-2xl font-ezra-bold text-white">{stats.orderCount}</Text>

                            </View>

                            <View className="flex-1 bg-white/10 rounded-2xl p-3">

                                <Text className="text-white/70 text-xs uppercase">Revenue</Text>

                                <Text className="text-2xl font-ezra-bold text-white">TRY {stats.revenue}</Text>

                            </View>

                        </View>

                    </View>



                    <View className="gap-4">

                        <Text className="section-title">Your restaurants</Text>

                        {restaurantsLoading ? (

                            <ActivityIndicator color="#FF8C42" />

                        ) : ownerRestaurants?.length ? (

                            <View className="gap-3">

                                {ownerRestaurants.map((restaurant: OwnerRestaurant) => {

                                    const id = String(restaurant.id ?? restaurant.$id);

                                    const isActive = id === activeRestaurantId;

                                    return (

                                        <TouchableOpacity

                                            key={id}

                                            className="flex-row items-center gap-4 rounded-3xl border p-4"

                                            style={{ borderColor: isActive ? "#FF8C42" : "#F1F5F9", backgroundColor: isActive ? "#FFF6EF" : "#FFFFFF" }}

                                            onPress={() => setActiveRestaurantId(id)}

                                        >

                                            <View className="size-16 rounded-2xl overflow-hidden bg-primary/10">

                                                <Image

                                                    source={resolveRestaurantImage(restaurant.imageUrl)}

                                                    className="w-full h-full"

                                                    resizeMode="cover"

                                                />

                                            </View>

                                            <View className="flex-1">

                                                <Text className="paragraph-semibold text-dark-100">{restaurant.name}</Text>

                                                <Text className="body-medium text-dark-60">{restaurant.cuisine || "Cuisine not set"}</Text>

                                            </View>

                                            <Text className="paragraph-semibold text-primary">{isActive ? "Selected" : "Manage"}</Text>

                                        </TouchableOpacity>

                                    );

                                })}

                            </View>

                        ) : (

                            <EmptyState message="HenÃ¼z restoran yok. AÅŸaÄŸÄ±dan ekleyebilirsin." />

                        )}

                    </View>



                    <View className="gap-4 bg-white rounded-3xl p-4 border border-gray-100">

                        <Text className="section-title">Register a new restaurant</Text>

                        <InputField label="Restaurant name" value={restaurantForm.name} placeholder="Ada Pizza" onChangeText={(text) => setRestaurantForm((prev) => ({ ...prev, name: text }))} />

                        <InputField label="Cuisine" value={restaurantForm.cuisine} placeholder="Fast Food" onChangeText={(text) => setRestaurantForm((prev) => ({ ...prev, cuisine: text }))} />

                        <InputField label="Description" value={restaurantForm.description} placeholder="Legendary burger joint on campus" multiline onChangeText={(text) => setRestaurantForm((prev) => ({ ...prev, description: text }))} />

                        <InputField label="Image URL" value={restaurantForm.imageUrl} placeholder="https://images..." onChangeText={(text) => setRestaurantForm((prev) => ({ ...prev, imageUrl: text }))} />

                        <TouchableOpacity className="custom-btn mt-2" onPress={handleCreateRestaurant} disabled={creatingRestaurant}>

                            {creatingRestaurant ? <ActivityIndicator color="#fff" /> : <Text className="paragraph-semibold text-white">Save restaurant</Text>}

                        </TouchableOpacity>

                    </View>



                    <View className="gap-4">

                        <Text className="section-title">Live orders</Text>

                        {ordersLoading ? (

                            <ActivityIndicator color="#FF8C42" />

                        ) : (restaurantOrders && restaurantOrders.length ? (

                            <View className="gap-3">

                                {restaurantOrders.map((order: RestaurantOrder) => (

                                    <OrderCard key={String(order.$id ?? order.id)} order={order} onAdvance={handleStatusChange} />

                                ))}

                            </View>

                        ) : (

                            <EmptyState message="Åžu an sipariÅŸ yok. Rahat bir nefes!" />

                        ))}

                    </View>





                    <View className="gap-4">

                        <Text className="section-title">Menu items</Text>

                        {menuLoading ? (

                            <ActivityIndicator color="#FF8C42" />

                        ) : decoratedMenuItems && decoratedMenuItems.length ? (

                            <View className="gap-3">

                                {decoratedMenuItems.map((item: any) => {

                                    const menuId = String(item.$id ?? item.id);

                                    return (

                                        <MenuRow

                                            key={menuId}

                                            item={item}

                                            visible={item.visible !== false}

                                            onToggleVisibility={(value) => handleToggleMenuVisibility(menuId, value)}

                                        />

                                    );

                                })}

                            </View>

                        ) : (

                            <EmptyState message="HenOz menO ??Yesi eklenmedi. Hemen ekle!" />

                        )}

                    </View>

                    <View className="gap-4 bg-white rounded-3xl p-4 border border-gray-100">

                        <Text className="section-title">Add a menu item</Text>

                        <InputField label="Item name" value={menuForm.name} placeholder="Spicy Chick'n Burger" onChangeText={(text) => setMenuForm((prev) => ({ ...prev, name: text }))} />

                        <InputField label="Price (TRY)" value={menuForm.price} placeholder="159.90" onChangeText={(text) => setMenuForm((prev) => ({ ...prev, price: text }))} />

                        <InputField label="Description" value={menuForm.description} placeholder="Add some tasting notes" multiline onChangeText={(text) => setMenuForm((prev) => ({ ...prev, description: text }))} />

                        <InputField label="Image URL" value={menuForm.imageUrl} placeholder="https://images..." onChangeText={(text) => setMenuForm((prev) => ({ ...prev, imageUrl: text }))} />

                        <View className="flex-row items-center gap-3">

                            <TouchableOpacity className="flex-1 rounded-2xl border border-primary px-4 py-3 items-center justify-center" onPress={handleSearchImages} disabled={searchingImages}>

                                {searchingImages ? (

                                    <ActivityIndicator color="#FF8C42" />

                                ) : (

                                    <Text className="paragraph-semibold text-primary">Search with Pexels</Text>

                                )}

                            </TouchableOpacity>

                            {imageResults.length > 0 && (

                                <TouchableOpacity className="px-4 py-3 rounded-2xl border border-gray-200" onPress={() => setImageResults([])}>

                                    <Text className="paragraph-semibold text-dark-60">Clear</Text>

                                </TouchableOpacity>

                            )}

                        </View>

                        {imageResults.length > 0 && (

                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>

                                <View className="flex-row gap-3 mt-2">

                                    {imageResults.map((photo) => (

                                        <TouchableOpacity

                                            key={photo.id}

                                            className={`size-20 rounded-2xl overflow-hidden border ${menuForm.imageUrl === photo.full ? "border-primary" : "border-transparent"}`}

                                            onPress={() => setMenuForm((prev) => ({ ...prev, imageUrl: photo.full }))}

                                        >

                                            <Image source={{ uri: photo.thumb }} className="w-full h-full" resizeMode="cover" />

                                        </TouchableOpacity>

                                    ))}

                                </View>

                            </ScrollView>

                        )}

                        <TouchableOpacity className="custom-btn mt-2" onPress={handleAddMenuItem} disabled={creatingMenuItem}>

                            {creatingMenuItem ? <ActivityIndicator color="#fff" /> : <Text className="paragraph-semibold text-white">Save menu item</Text>}

                        </TouchableOpacity>

                    </View>

                </View>

            </ScrollView>

        </SafeAreaView>

    );

};



export default RestaurantConsole;





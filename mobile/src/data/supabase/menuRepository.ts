import type { MenuRepository, PanelCategory, PanelMenuItem } from "@/src/data/contracts";
import { fromKurus, requireSupabase, slugifyCategory, throwIfError, toKurus } from "./utils";

const mapCategory = (row: any) => ({
    id: String(row.id || ""),
    name: row.name || "",
    slug: slugifyCategory(row.name || row.id),
    description: row.description || "",
    icon: row.icon || undefined,
});

const mapMenuItem = (row: any) => ({
    id: String(row.id || ""),
    $id: String(row.id || ""),
    restaurantId: row.restaurant_id || undefined,
    categoryId: row.category_id || undefined,
    categories: row.category_id ? [row.category_id] : [],
    name: row.name || "",
    description: row.description || "",
    price: fromKurus(row.price_kurus),
    imageUrl: row.image_url || "",
    image_url: row.image_url || "",
    ratingAverage: Number(row.rating_average || 0),
    ratingCount: Number(row.rating_count || 0),
    customizations: Array.isArray(row.customizations) ? row.customizations : [],
    visible: true,
});

export const getRestaurantCategories: MenuRepository["getRestaurantCategories"] = async (restaurantId) => {
    const rows = throwIfError(
        await requireSupabase()
            .from("active_categories")
            .select("*")
            .eq("restaurant_id", String(restaurantId))
            .order("sort_order", { ascending: true }),
    );
    return rows.map(mapCategory);
};

export const getRestaurantMenu: MenuRepository["getRestaurantMenu"] = async ({ restaurantId, categoryId }) => {
    let query = requireSupabase()
        .from("active_menu_items")
        .select("*")
        .eq("restaurant_id", String(restaurantId))
        .order("sort_order", { ascending: true });
    if (categoryId !== undefined && categoryId !== null) query = query.eq("category_id", String(categoryId));
    return throwIfError(await query).map(mapMenuItem);
};

export const getCategories: MenuRepository["getCategories"] = async () => {
    const restaurants = throwIfError(await requireSupabase().from("active_restaurants").select("id").limit(1));
    return restaurants?.[0]?.id ? getRestaurantCategories(restaurants[0].id) : [];
};

export const getMenu: MenuRepository["getMenu"] = async ({ category, query, limit }) => {
    const restaurants = throwIfError(await requireSupabase().from("active_restaurants").select("id").limit(1));
    if (!restaurants?.[0]?.id) return [];
    const categories = category ? await getRestaurantCategories(restaurants[0].id) : [];
    const categoryId = category
        ? categories.find((item: any) => String(item.name || "").toLowerCase() === String(category).toLowerCase())?.id
        : undefined;
    let items = await getRestaurantMenu({ restaurantId: restaurants[0].id, categoryId });
    if (query) {
        const term = String(query).toLowerCase();
        items = items.filter((item: any) => String(item.name || "").toLowerCase().includes(term));
    }
    return limit ? items.slice(0, limit) : items;
};

export const createMenuItem: MenuRepository["createMenuItem"] = async (restaurantId, payload) => {
    const categoryId = String(payload.categoryId || payload.category_id || payload.categories?.[0] || "");
    if (!categoryId) throw new Error("A category is required before creating a Supabase menu item.");
    const id = throwIfError(
        await requireSupabase().rpc("upsert_menu_item", {
            p_restaurant_id: String(restaurantId),
            p_menu_item_id: String(payload.id || ""),
            p_category_id: categoryId,
            p_name: String(payload.name || ""),
            p_price_kurus: toKurus(payload.price),
            p_description: String(payload.description || ""),
            p_image_url: String(payload.imageUrl || payload.image_url || ""),
            p_is_active: payload.visible !== false,
        }),
    );
    return { id, ...payload };
};

export const createAdminMenuItem = createMenuItem as MenuRepository["createAdminMenuItem"];
export const getAdminRestaurants: MenuRepository["getAdminRestaurants"] = async () =>
    throwIfError(await requireSupabase().from("active_restaurants").select("*")).map((row: any) => ({
        id: row.id,
        name: row.name,
        cuisine: row.cuisine,
        imageUrl: row.image_url,
    }));
export const getAdminRestaurantMenu: MenuRepository["getAdminRestaurantMenu"] = async (restaurantId) =>
    getRestaurantMenu({ restaurantId });

export const updateMenuItem: MenuRepository["updateMenuItem"] = async (itemId, updates) => {
    const existing = throwIfError(await requireSupabase().from("menu_items").select("*").eq("id", itemId).maybeSingle());
    if (!existing) throw new Error("Menu item not found.");
    await requireSupabase().rpc("upsert_menu_item", {
        p_restaurant_id: existing.restaurant_id,
        p_menu_item_id: itemId,
        p_category_id: updates.categoryId || updates.category_id || existing.category_id,
        p_name: updates.name ?? existing.name,
        p_price_kurus: updates.price !== undefined ? toKurus(updates.price) : existing.price_kurus,
        p_description: updates.description ?? existing.description,
        p_image_url: updates.imageUrl ?? updates.image_url ?? existing.image_url,
        p_is_active: updates.visible ?? existing.is_active,
    }).then(throwIfError);
};

export const getOwnedRestaurantMenuManagementData: MenuRepository["getOwnedRestaurantMenuManagementData"] = async () => {
    const memberships = throwIfError(await requireSupabase().from("my_restaurant_memberships").select("restaurant_id").limit(1));
    const restaurantId = memberships?.[0]?.restaurant_id;
    if (!restaurantId) return null;
    const [categories, items] = await Promise.all([getRestaurantCategories(restaurantId), getRestaurantMenu({ restaurantId })]);
    return { restaurantId, categories: categories as PanelCategory[], items: items as PanelMenuItem[] };
};

export const updatePanelMenuItem: MenuRepository["updatePanelMenuItem"] = async (item) => updateMenuItem(item.id, item);
export const createPanelCategory: MenuRepository["createPanelCategory"] = async (restaurantId, name) => {
    const id = throwIfError(
        await requireSupabase().rpc("upsert_category", {
            p_restaurant_id: restaurantId,
            p_category_id: "",
            p_name: name,
            p_is_active: true,
        }),
    );
    return { id, name, slug: slugifyCategory(name) };
};
export const createPanelMenuItem: MenuRepository["createPanelMenuItem"] = async (restaurantId, input) => {
    const categoryId = input.categories[0] || "";
    const id = await createMenuItem(restaurantId, { ...input, categoryId, visible: true });
    return { id: String(id.id), name: input.name, price: input.price, categories: input.categories, visible: true };
};
export const deletePanelMenuItem: MenuRepository["deletePanelMenuItem"] = async (itemId) => {
    await requireSupabase().rpc("set_menu_item_active", { p_menu_item_id: itemId, p_is_active: false }).then(throwIfError);
};
export const updatePanelCategory: MenuRepository["updatePanelCategory"] = async (categoryId, nextName) => {
    const existing = throwIfError(await requireSupabase().from("categories").select("*").eq("id", categoryId).maybeSingle());
    if (!existing) throw new Error("Category not found.");
    await requireSupabase().rpc("upsert_category", {
        p_restaurant_id: existing.restaurant_id,
        p_category_id: categoryId,
        p_name: nextName,
        p_description: existing.description,
        p_icon: existing.icon,
        p_sort_order: existing.sort_order,
        p_is_active: existing.is_active,
    }).then(throwIfError);
    return { id: categoryId, name: nextName, slug: slugifyCategory(nextName) };
};
export const deletePanelCategory: MenuRepository["deletePanelCategory"] = async (categoryId) => {
    await requireSupabase().rpc("set_category_active", { p_category_id: categoryId, p_is_active: false }).then(throwIfError);
};

export const supabaseMenuRepository: MenuRepository = {
    getCategories,
    getMenu,
    getRestaurantCategories,
    getRestaurantMenu,
    createMenuItem,
    createAdminMenuItem,
    getAdminRestaurants,
    getAdminRestaurantMenu,
    updateMenuItem,
    getOwnedRestaurantMenuManagementData,
    updatePanelMenuItem,
    createPanelCategory,
    createPanelMenuItem,
    deletePanelMenuItem,
    updatePanelCategory,
    deletePanelCategory,
};

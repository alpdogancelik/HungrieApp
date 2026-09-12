import type { MenuRepository, PanelCategory, PanelMenuItem } from "@/src/data/contracts";
import { fromKurus, requireCatalogSupabase, requireSupabase, slugifyCategory, throwIfError, toKurus } from "./utils";
import { invalidateCatalogCache, readCatalogCached } from "./publicCatalogCache";
import { measureDevelopment } from "@/src/lib/performanceMetrics";

const ACTIVE_CATEGORY_COLUMNS = "id,restaurant_id,name,description,icon,sort_order,created_at,updated_at";
const CATEGORY_MANAGEMENT_COLUMNS = `${ACTIVE_CATEGORY_COLUMNS},is_active`;
const ACTIVE_MENU_ITEM_COLUMNS = [
    "id", "restaurant_id", "category_id", "name", "description", "image_url", "price_kurus", "sort_order",
    "eta_minutes", "calories", "protein_grams", "rating_average", "rating_count", "customizations", "created_at", "updated_at",
].join(",");
const MENU_ITEM_MANAGEMENT_COLUMNS = `${ACTIVE_MENU_ITEM_COLUMNS},is_active`;
const ACTIVE_RESTAURANT_SUMMARY_COLUMNS = "id,name,cuisine,image_url";
const toCustomizationDefinitions = (value: unknown) =>
    (Array.isArray(value) ? value : []).map((item: any) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        price_kurus: item.price_kurus === undefined ? toKurus(item.price) : Number(item.price_kurus),
    }));

export const mapCatalogCategory = (row: any) => ({
    id: String(row.id || ""),
    name: row.name || "",
    slug: slugifyCategory(
        String(row.id || "").replace(new RegExp(`^${String(row.restaurant_id || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-_]`), "")
        || row.name,
    ),
    description: row.description || "",
    icon: row.icon || undefined,
});

export const mapCatalogMenuItem = (row: any) => ({
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
    visible: row.is_active !== false,
});

export const getRestaurantCategories: MenuRepository["getRestaurantCategories"] = async (restaurantId) => {
    const rows = await readCatalogCached(`categories:${String(restaurantId)}`, async () => throwIfError(
        await requireCatalogSupabase()
            .from("active_categories")
            .select(ACTIVE_CATEGORY_COLUMNS)
            .eq("restaurant_id", String(restaurantId))
            .order("sort_order", { ascending: true })
            .order("id", { ascending: true }),
    ));
    return rows.map(mapCatalogCategory);
};

export const getRestaurantMenu: MenuRepository["getRestaurantMenu"] = async ({ restaurantId, categoryId }) => {
    const key = `menu:${String(restaurantId)}:${categoryId == null ? "all" : String(categoryId)}`;
    const rows = await readCatalogCached(key, async () => {
        let query = requireCatalogSupabase()
            .from("active_menu_items")
            .select(ACTIVE_MENU_ITEM_COLUMNS)
            .eq("restaurant_id", String(restaurantId))
            .order("sort_order", { ascending: true })
            .order("id", { ascending: true });
        if (categoryId !== undefined && categoryId !== null) query = query.eq("category_id", String(categoryId));
        return throwIfError(await query);
    });
    return rows.map(mapCatalogMenuItem);
};

export const getCategories: MenuRepository["getCategories"] = async () => {
    const restaurants = throwIfError(await requireCatalogSupabase().from("active_restaurants").select("id").limit(1));
    return restaurants?.[0]?.id ? getRestaurantCategories(restaurants[0].id) : [];
};

export const getMenuPage: MenuRepository["getMenuPage"] = async ({ category, query, offset = 0, limit = 20 }) => {
    const result = await measureDevelopment("repository.catalog.search", () => readCatalogCached(`search:${query || ""}:${category || ""}:${offset}:${limit}`, async () =>
        throwIfError(await requireCatalogSupabase().rpc("search_active_catalog", {
            p_query: query || null,
            p_category: category || null,
            p_offset: offset,
            p_limit: limit,
        })),
    ));
    return {
        items: (Array.isArray(result?.items) ? result.items : []).map(mapCatalogMenuItem),
        hasMore: Boolean(result?.has_more),
        nextOffset: typeof result?.next_offset === "number" ? result.next_offset : null,
    };
};

export const getMenu: MenuRepository["getMenu"] = async ({ category, query, limit }) => {
    if (limit && !query && !category) {
        const rows = await readCatalogCached(`featured:${limit}`, async () =>
            throwIfError(await requireCatalogSupabase().rpc("get_featured_catalog_items", { p_limit: limit })),
        );
        return (Array.isArray(rows) ? rows : []).map(mapCatalogMenuItem);
    }
    return (await getMenuPage({ category, query, limit: limit || 100 })).items;
};

export const getRestaurantBundle: MenuRepository["getRestaurantBundle"] = async (restaurantId) => {
    const result = await measureDevelopment("repository.catalog.bundle", () => readCatalogCached(`bundle:${String(restaurantId)}`, async () =>
        throwIfError(await requireCatalogSupabase().rpc("get_active_restaurant_bundle", { p_restaurant_id: String(restaurantId) })),
    ));
    if (!result?.restaurant) return null;
    const { mapCatalogRestaurant } = await import("./restaurantRepository");
    return {
        restaurant: mapCatalogRestaurant(result.restaurant),
        categories: (Array.isArray(result.categories) ? result.categories : []).map(mapCatalogCategory),
        items: (Array.isArray(result.items) ? result.items : []).map(mapCatalogMenuItem),
    };
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
            p_customizations: toCustomizationDefinitions(payload.customizations),
            p_is_active: payload.visible !== false,
        }),
    );
    invalidateCatalogCache();
    return { id, ...payload };
};

export const createAdminMenuItem = createMenuItem as MenuRepository["createAdminMenuItem"];
export const getAdminRestaurants: MenuRepository["getAdminRestaurants"] = async () =>
    throwIfError(await requireCatalogSupabase().from("active_restaurants").select(ACTIVE_RESTAURANT_SUMMARY_COLUMNS)).map((row: any) => ({
        id: row.id,
        name: row.name,
        cuisine: row.cuisine,
        imageUrl: row.image_url,
    }));
export const getAdminRestaurantMenu: MenuRepository["getAdminRestaurantMenu"] = async (restaurantId) =>
    getRestaurantMenu({ restaurantId });

export const updateMenuItem: MenuRepository["updateMenuItem"] = async (itemId, updates) => {
    const existing = throwIfError(await requireSupabase().from("menu_items").select(MENU_ITEM_MANAGEMENT_COLUMNS).eq("id", itemId).maybeSingle());
    if (!existing) throw new Error("Menu item not found.");
    await requireSupabase().rpc("upsert_menu_item", {
        p_restaurant_id: existing.restaurant_id,
        p_menu_item_id: itemId,
        p_category_id: updates.categoryId || updates.category_id || existing.category_id,
        p_name: updates.name ?? existing.name,
        p_price_kurus: updates.price !== undefined ? toKurus(updates.price) : existing.price_kurus,
        p_description: updates.description ?? existing.description,
        p_image_url: updates.imageUrl ?? updates.image_url ?? existing.image_url,
        p_customizations: updates.customizations === undefined
            ? existing.customizations
            : toCustomizationDefinitions(updates.customizations),
        p_is_active: updates.visible ?? existing.is_active,
    }).then(throwIfError);
    invalidateCatalogCache();
};

export const getOwnedRestaurantMenuManagementData: MenuRepository["getOwnedRestaurantMenuManagementData"] = async () => {
    const memberships = throwIfError(await requireSupabase().from("my_restaurant_memberships").select("restaurant_id").limit(1));
    const restaurantId = memberships?.[0]?.restaurant_id;
    if (!restaurantId) return null;
    const data = throwIfError(
        await requireSupabase().rpc("get_restaurant_menu_management_data", { p_restaurant_id: restaurantId }),
    );
    return {
        restaurantId,
        categories: (Array.isArray(data?.categories) ? data.categories : []).map(mapCatalogCategory) as PanelCategory[],
        items: (Array.isArray(data?.items) ? data.items : []).map(mapCatalogMenuItem) as PanelMenuItem[],
    };
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
    invalidateCatalogCache();
};
export const updatePanelCategory: MenuRepository["updatePanelCategory"] = async (categoryId, nextName) => {
    const existing = throwIfError(await requireSupabase().from("categories").select(CATEGORY_MANAGEMENT_COLUMNS).eq("id", categoryId).maybeSingle());
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
    invalidateCatalogCache();
    return { id: categoryId, name: nextName, slug: slugifyCategory(nextName) };
};
export const deletePanelCategory: MenuRepository["deletePanelCategory"] = async (categoryId) => {
    await requireSupabase().rpc("set_category_active", { p_category_id: categoryId, p_is_active: false }).then(throwIfError);
    invalidateCatalogCache();
};

export const supabaseMenuRepository: MenuRepository = {
    getCategories,
    getMenu,
    getMenuPage,
    getRestaurantCategories,
    getRestaurantMenu,
    getRestaurantBundle,
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

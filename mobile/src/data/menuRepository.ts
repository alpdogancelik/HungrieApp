import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "firebase/firestore";

import {
    createMenuItem as firebaseCreateMenuItem,
    getCategories as firebaseGetCategories,
    getMenu as firebaseGetMenu,
    getRestaurantCategories as firebaseGetRestaurantCategories,
    getRestaurantMenu as firebaseGetRestaurantMenu,
} from "@/lib/api";
import {
    createMenuItem as firebaseCreateAdminMenuItem,
    getRestaurants as firebaseGetAdminRestaurants,
    getRestaurantMenu as firebaseGetAdminRestaurantMenu,
    updateMenuItem as firebaseUpdateMenuItem,
} from "@/lib/firebase";
import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId } from "@/lib/restaurantOwnership";
import { selectRepository } from "./backendFlags";
import type { MenuRepository, PanelCategory, PanelMenuItem } from "./contracts";
import { supabaseMenuRepository } from "./supabase/menuRepository";

const slugifyCategory = (value: string) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9çğıöşü]+/gi, "-")
        .replace(/^-+|-+$/g, "");

const resolveCategorySlug = (category: Partial<PanelCategory>) => slugifyCategory(category.name || category.slug || category.id || "");

const normalizeAssignedCategories = (raw: unknown, categories: PanelCategory[]) => {
    const values = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
    if (!values.length) return [];

    const byId = new Map(categories.map((category) => [category.id, resolveCategorySlug(category)]));
    const bySlug = new Map(categories.map((category) => [resolveCategorySlug(category), resolveCategorySlug(category)]));

    return Array.from(
        new Set(
            values
                .map((value) => {
                    const trimmed = String(value || "").trim();
                    if (!trimmed) return null;
                    if (byId.has(trimmed)) return byId.get(trimmed) || null;
                    const normalized = slugifyCategory(trimmed);
                    if (bySlug.has(normalized)) return bySlug.get(normalized) || null;
                    return normalized || null;
                })
                .filter((value): value is string => Boolean(value)),
        ),
    );
};

const firebaseGetOwnedRestaurantMenuManagementData = async () => {
    if (!firestore) return null;
    const restaurantId = await getOwnedRestaurantId();
    if (!restaurantId) return null;

    const catSnap = await getDocs(query(collection(firestore, "categories"), where("restaurantId", "==", restaurantId)));
    const categories: PanelCategory[] = catSnap.docs.map((snapshot) => {
        const data = snapshot.data() as any;
        const name = String(data.name || snapshot.id);
        const slug = slugifyCategory(String(data.slug || name || snapshot.id));
        return { id: snapshot.id, name, slug };
    });

    const menuSnap = await getDocs(query(collection(firestore, "menus"), where("restaurantId", "==", restaurantId)));
    const items: PanelMenuItem[] = menuSnap.docs.map((snapshot) => {
        const data = snapshot.data() as any;
        return {
            id: snapshot.id,
            name: String(data.name || snapshot.id),
            price: Number(data.price || 0),
            categories: normalizeAssignedCategories(data.categories, categories),
            visible: data.visible !== false,
        };
    });

    return { restaurantId, categories, items };
};

const firebaseUpdatePanelMenuItem = async (item: PanelMenuItem) => {
    if (!firestore) throw new Error("Menu storage is not configured.");
    await updateDoc(doc(firestore, "menus", item.id), {
        categories: Array.from(new Set((item.categories || []).map((entry) => slugifyCategory(String(entry))))),
        name: item.name || "",
        price: Number(item.price || 0),
        visible: item.visible !== false,
        updatedAt: Date.now(),
    });
};

const firebaseCreatePanelCategory = async (restaurantId: string, name: string) => {
    if (!firestore) throw new Error("Menu storage is not configured.");
    const slug = slugifyCategory(name);
    const ref = await addDoc(collection(firestore, "categories"), {
        name,
        slug,
        restaurantId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    return { id: ref.id, name, slug };
};

const firebaseCreatePanelMenuItem = async (restaurantId: string, input: { name: string; price: number; categories: string[] }) => {
    if (!firestore) throw new Error("Menu storage is not configured.");
    const ref = await addDoc(collection(firestore, "menus"), {
        restaurantId,
        name: input.name,
        price: Number.isFinite(input.price) ? input.price : 0,
        categories: Array.from(new Set(input.categories.map((entry) => slugifyCategory(String(entry))))),
        visible: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    return {
        id: ref.id,
        name: input.name,
        price: Number.isFinite(input.price) ? input.price : 0,
        categories: input.categories,
        visible: true,
    };
};

const firebaseDeletePanelMenuItem = async (itemId: string) => {
    if (!firestore) throw new Error("Menu storage is not configured.");
    await deleteDoc(doc(firestore, "menus", itemId));
};

const firebaseUpdatePanelCategory = async (categoryId: string, nextName: string) => {
    if (!firestore) throw new Error("Menu storage is not configured.");
    const trimmedName = nextName.trim();
    const slug = slugifyCategory(trimmedName);
    await updateDoc(doc(firestore, "categories", categoryId), {
        name: trimmedName,
        slug,
        updatedAt: Date.now(),
    });
    return { id: categoryId, name: trimmedName, slug };
};

const firebaseDeletePanelCategory = async (categoryId: string) => {
    if (!firestore) throw new Error("Menu storage is not configured.");
    await deleteDoc(doc(firestore, "categories", categoryId));
};

const firebaseMenuRepository: MenuRepository = {
    getCategories: firebaseGetCategories,
    getMenu: firebaseGetMenu,
    getRestaurantCategories: firebaseGetRestaurantCategories,
    getRestaurantMenu: firebaseGetRestaurantMenu,
    createMenuItem: firebaseCreateMenuItem,
    createAdminMenuItem: (restaurantId, payload) => firebaseCreateAdminMenuItem(restaurantId, payload as any),
    getAdminRestaurants: firebaseGetAdminRestaurants,
    getAdminRestaurantMenu: firebaseGetAdminRestaurantMenu,
    updateMenuItem: async (itemId, updates) => {
        await firebaseUpdateMenuItem(itemId, updates as any);
    },
    getOwnedRestaurantMenuManagementData: firebaseGetOwnedRestaurantMenuManagementData,
    updatePanelMenuItem: firebaseUpdatePanelMenuItem,
    createPanelCategory: firebaseCreatePanelCategory,
    createPanelMenuItem: firebaseCreatePanelMenuItem,
    deletePanelMenuItem: firebaseDeletePanelMenuItem,
    updatePanelCategory: firebaseUpdatePanelCategory,
    deletePanelCategory: firebaseDeletePanelCategory,
};

export const menuRepository = selectRepository<MenuRepository>("menu", {
    firebase: firebaseMenuRepository,
    supabase: supabaseMenuRepository,
});

export const getCategories = menuRepository.getCategories;
export const getMenu = menuRepository.getMenu;
export const getRestaurantCategories = menuRepository.getRestaurantCategories;
export const getRestaurantMenu = menuRepository.getRestaurantMenu;
export const createMenuItem = menuRepository.createMenuItem;
export const createAdminMenuItem = menuRepository.createAdminMenuItem;
export const getAdminRestaurants = menuRepository.getAdminRestaurants;
export const getAdminRestaurantMenu = menuRepository.getAdminRestaurantMenu;
export const updateMenuItem = menuRepository.updateMenuItem;
export const getOwnedRestaurantMenuManagementData = menuRepository.getOwnedRestaurantMenuManagementData;
export const updatePanelMenuItem = menuRepository.updatePanelMenuItem;
export const createPanelCategory = menuRepository.createPanelCategory;
export const createPanelMenuItem = menuRepository.createPanelMenuItem;
export const deletePanelMenuItem = menuRepository.deletePanelMenuItem;
export const updatePanelCategory = menuRepository.updatePanelCategory;
export const deletePanelCategory = menuRepository.deletePanelCategory;

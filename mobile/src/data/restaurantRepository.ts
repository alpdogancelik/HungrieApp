import { doc, getDoc, updateDoc } from "firebase/firestore";

import {
    getRestaurant as firebaseGetRestaurant,
    getRestaurants as firebaseGetRestaurants,
    subscribeRestaurant as firebaseSubscribeRestaurant,
    subscribeRestaurants as firebaseSubscribeRestaurants,
    updateRestaurant as firebaseUpdateRestaurant,
    createRestaurant as firebaseCreateRestaurant,
    getOwnerRestaurants as firebaseGetOwnerRestaurants,
    getRestaurantOrders as firebaseGetRestaurantOrders,
    updateOrderStatus as firebaseUpdateOrderStatus,
    getCourierRoster as firebaseGetCourierRoster,
} from "@/lib/api";
import { firestore } from "@/lib/firebase";
import { getOwnedRestaurantId as firebaseGetOwnedRestaurantId } from "@/lib/restaurantOwnership";
import * as firebaseRestaurantAuth from "@/src/data/firebase/restaurantSessionRepository";
import { signIn, signOut } from "@/src/data/authRepository";
import { getCurrentMembership, listenCurrentMembership } from "@/src/data/membershipRepository";
import { selectRepository } from "./backendFlags";
import type { RestaurantRepository, RestaurantDetailsForm } from "./contracts";
import { invalidateRestaurantCatalog, supabaseRestaurantRepository } from "./supabase/restaurantRepository";
import { catalogRepository } from "./catalogRepository";
export type { RestaurantSession } from "./contracts";

const firebaseGetOwnedRestaurantDetails = async (): Promise<{ restaurantId: string; details: RestaurantDetailsForm } | null> => {
    if (!firestore) return null;
    const restaurantId = (await getCurrentMembership())?.restaurantId || null;
    if (!restaurantId) return null;
    const snap = await getDoc(doc(firestore, "restaurants", restaurantId)).catch(() => null);
    if (!snap?.exists()) {
        return {
            restaurantId,
            details: {
                name: "",
                imageUrl: "",
                address: "",
                cuisine: "",
                description: "",
                isActive: true,
            },
        };
    }
    const data = snap.data() || {};
    return {
        restaurantId,
        details: {
            name: String(data.name || ""),
            imageUrl: String(data.imageUrl || data.image_url || ""),
            address: String(data.address || ""),
            cuisine: String(data.cuisine || ""),
            description: String(data.description || ""),
            isActive: data.isActive !== false,
        },
    };
};

const firebaseUpdateOwnedRestaurantDetails = async (restaurantId: string, form: RestaurantDetailsForm) => {
    if (!firestore) throw new Error("Restaurant storage is not configured.");
    await updateDoc(doc(firestore, "restaurants", restaurantId), {
        name: form.name.trim(),
        imageUrl: form.imageUrl.trim(),
        address: form.address.trim(),
        cuisine: form.cuisine.trim(),
        description: form.description.trim(),
        isActive: !!form.isActive,
        updatedAt: Date.now(),
    });
};

const firebaseGetPanelLocale: RestaurantRepository["getPanelLocale"] = async (restaurantId) => {
    if (!restaurantId || !firestore) return null;
    const snap = await getDoc(doc(firestore, "restaurants", restaurantId)).catch(() => null);
    const data = snap?.data() as Record<string, unknown> | undefined;
    const locale = typeof data?.preferredLanguage === "string" ? data.preferredLanguage : typeof data?.panelLocale === "string" ? data.panelLocale : null;
    return locale === "tr" || locale === "en" ? locale : null;
};

const firebaseSetPanelLocale: RestaurantRepository["setPanelLocale"] = async (restaurantId, locale) => {
    if (!firestore) return;
    await updateDoc(doc(firestore, "restaurants", restaurantId), { preferredLanguage: locale, updatedAt: Date.now() });
};

const firebaseRestaurantRepository: RestaurantRepository = {
    getRestaurants: firebaseGetRestaurants,
    subscribeRestaurants: firebaseSubscribeRestaurants,
    subscribeRestaurant: firebaseSubscribeRestaurant,
    getRestaurant: firebaseGetRestaurant,
    updateRestaurant: firebaseUpdateRestaurant,
    createRestaurant: firebaseCreateRestaurant,
    getOwnerRestaurants: firebaseGetOwnerRestaurants,
    getRestaurantOrders: firebaseGetRestaurantOrders,
    updateOrderStatus: firebaseUpdateOrderStatus,
    getCourierRoster: firebaseGetCourierRoster,
    getOwnedRestaurantId: firebaseGetOwnedRestaurantId,
    getOwnedRestaurantDetails: firebaseGetOwnedRestaurantDetails,
    updateOwnedRestaurantDetails: firebaseUpdateOwnedRestaurantDetails,
    signInRestaurant: firebaseRestaurantAuth.signInRestaurant,
    signOutRestaurant: firebaseRestaurantAuth.signOutRestaurant,
    listenRestaurantSession: firebaseRestaurantAuth.listenRestaurantSession,
    getPanelLocale: firebaseGetPanelLocale,
    setPanelLocale: firebaseSetPanelLocale,
};

export const restaurantRepository = selectRepository<RestaurantRepository>("restaurant", {
    firebase: firebaseRestaurantRepository,
    supabase: supabaseRestaurantRepository,
});

export const getRestaurants = catalogRepository.getRestaurants;
export const refreshRestaurants = async (filters?: { search?: string; category?: string }) => {
    invalidateRestaurantCatalog();
    return catalogRepository.getRestaurants(filters);
};
export const subscribeRestaurants = catalogRepository.subscribeRestaurants;
export const subscribeRestaurant = catalogRepository.subscribeRestaurant;
export const getRestaurant = catalogRepository.getRestaurant;
export const updateRestaurant = restaurantRepository.updateRestaurant;
export const createRestaurant = restaurantRepository.createRestaurant;
export const getOwnerRestaurants = restaurantRepository.getOwnerRestaurants;
export const getRestaurantOrders = restaurantRepository.getRestaurantOrders;
export const updateOrderStatus = restaurantRepository.updateOrderStatus;
export const getCourierRoster = restaurantRepository.getCourierRoster;
export const getOwnedRestaurantId = async () => (await getCurrentMembership())?.restaurantId || null;
export const getOwnedRestaurantDetails = restaurantRepository.getOwnedRestaurantDetails;
export const updateOwnedRestaurantDetails = restaurantRepository.updateOwnedRestaurantDetails;
export const signInRestaurant = async (email: string, password: string) => {
    await signIn({ email, password });
    const membership = await getCurrentMembership();
    if (!membership) throw new Error("This account does not have restaurant access.");
    return membership;
};
export const signOutRestaurant = signOut;
export const listenRestaurantSession = listenCurrentMembership;
export const getPanelLocale = restaurantRepository.getPanelLocale;
export const setPanelLocale = restaurantRepository.setPanelLocale;

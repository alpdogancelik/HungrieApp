import type {
    Address,
    CartItem,
    MenuItemReview,
    OrderReview,
    OrderReviewRatingBreakdown,
    OrderStatus,
    PaymentMethod,
    RestaurantOrderReviewSummary,
    RestaurantReviewSummary,
} from "@/src/domain/types";
import type { PanelLocale } from "@/src/features/restaurantPanel/panelLocale";
import type { Unsubscribe } from "./types";

export type AuthRepository = {
    signIn: (input: { email: string; password: string }) => Promise<any>;
    createUser: (input: { email: string; password: string; name: string; whatsappNumber?: string }) => Promise<any>;
    getCurrentUser: () => Promise<any | null>;
    signOut: () => Promise<any>;
    logout: () => Promise<any>;
    deleteCurrentUserProfile: () => Promise<void>;
    sendPasswordReset: (email: string) => Promise<void>;
    updateUserProfile: (input: { name: string; whatsappNumber?: string }) => Promise<any>;
    getMockOwnerAccount: () => Promise<null>;
    clearMockOwnerAccount: () => Promise<void>;
};

export type ProfileRepository = {
    getCurrentUser: () => Promise<any | null>;
    updateUserProfile: AuthRepository["updateUserProfile"];
    deleteCurrentUserProfile: () => Promise<void>;
};

export type RestaurantDetailsForm = {
    name: string;
    imageUrl: string;
    address: string;
    cuisine: string;
    description: string;
    isActive: boolean;
};

export type RestaurantSession = {
    userId: string;
    email: string;
    restaurantId: string;
    restaurantName: string;
};

export type RestaurantRepository = {
    getRestaurants: (filters?: { search?: string; category?: string }) => Promise<any[]>;
    subscribeRestaurants: (cb: (restaurants: any[]) => void, onError?: (error: unknown) => void) => Unsubscribe;
    subscribeRestaurant: (restaurantId: string | number, cb: (restaurant: any | null) => void, onError?: (error: unknown) => void) => Unsubscribe;
    getRestaurant: (restaurantId: string | number) => Promise<any | null>;
    updateRestaurant: (restaurantId: string | number, payload: Record<string, any>) => Promise<any>;
    createRestaurant: (payload: Record<string, any>) => Promise<any>;
    getOwnerRestaurants: () => Promise<any[]>;
    getRestaurantOrders: (restaurantId: string | number, status?: string) => Promise<any[]>;
    updateOrderStatus: (orderId: number, status: string) => Promise<any>;
    getCourierRoster: () => Promise<any[]>;
    getOwnedRestaurantId: () => Promise<string | null>;
    getOwnedRestaurantDetails: () => Promise<{ restaurantId: string; details: RestaurantDetailsForm } | null>;
    updateOwnedRestaurantDetails: (restaurantId: string, form: RestaurantDetailsForm) => Promise<void>;
    signInRestaurant: (email: string, password: string) => Promise<RestaurantSession>;
    signOutRestaurant: () => Promise<void>;
    listenRestaurantSession: (cb: (session: RestaurantSession | null) => void) => Unsubscribe;
    getPanelLocale: (restaurantId?: string | null) => Promise<PanelLocale | null>;
    setPanelLocale: (restaurantId: string, locale: PanelLocale) => Promise<void>;
};

export type PanelMenuItem = {
    id: string;
    name: string;
    price?: number;
    categories?: string[];
    visible?: boolean;
};

export type PanelCategory = {
    id: string;
    name: string;
    slug: string;
};

export type MenuRepository = {
    getCategories: () => Promise<any[]>;
    getMenu: (params: { category?: string; query?: string; limit?: number }) => Promise<any[]>;
    getRestaurantCategories: (restaurantId: string | number) => Promise<any[]>;
    getRestaurantMenu: (params: { restaurantId: string | number; categoryId?: string | number }) => Promise<any[]>;
    createMenuItem: (restaurantId: string | number, payload: Record<string, any>) => Promise<any>;
    createAdminMenuItem: (restaurantId: string, payload: Record<string, any>) => Promise<any>;
    getAdminRestaurants: () => Promise<any[]>;
    getAdminRestaurantMenu: (restaurantId: string) => Promise<any[]>;
    updateMenuItem: (itemId: string, updates: Record<string, any>) => Promise<void>;
    getOwnedRestaurantMenuManagementData: () => Promise<{ restaurantId: string; categories: PanelCategory[]; items: PanelMenuItem[] } | null>;
    updatePanelMenuItem: (item: PanelMenuItem) => Promise<void>;
    createPanelCategory: (restaurantId: string, name: string) => Promise<PanelCategory>;
    createPanelMenuItem: (restaurantId: string, input: { name: string; price: number; categories: string[] }) => Promise<PanelMenuItem>;
    deletePanelMenuItem: (itemId: string) => Promise<void>;
    updatePanelCategory: (categoryId: string, nextName: string) => Promise<PanelCategory>;
    deletePanelCategory: (categoryId: string) => Promise<void>;
};

export type OrderRepository = {
    getOrderApprovalDeadlineMs: (order: any) => number;
    isExpiredPendingOrder: (order: any, nowMs?: number) => boolean;
    placeOrder: (input: {
        userId: string;
        restaurantId: string;
        items: CartItem[];
        paymentMethod?: PaymentMethod;
        fees?: { deliveryFee?: number; serviceFee?: number; discount?: number; tip?: number };
        etaMinutes?: number;
        customer?: { name?: string | null; email?: string | null; whatsappNumber?: string | null };
        deliveryAddress?: Partial<Address> | null;
        notes?: string | null;
    }) => Promise<string>;
    subscribeOrder: (orderId: string, cb: (order: any | null) => void) => Unsubscribe;
    subscribeUserOrders: (userId: string, cb: (orders: any[]) => void) => Unsubscribe;
    fetchUserOrders: (userId: string) => Promise<any[]>;
    subscribeRestaurantOrders: (restaurantId: string, statuses?: string[], cb?: (orders: any[]) => void) => Unsubscribe;
    fetchRestaurantPastOrders: (restaurantId: string, statuses?: string[]) => Promise<any[]>;
    subscribeRestaurantReminderOrders: (restaurantId: string, cb: (orders: any[]) => void) => Unsubscribe;
    requestOrderReminder: (orderId: string, payload?: { userId?: string; source?: "customer" | "system" }) => Promise<void>;
    transitionOrder: (orderId: string, status: OrderStatus | string) => Promise<void>;
    autoCancelExpiredPendingOrders: (
        orders: any[],
        options?: { inFlightIds?: Set<string>; onError?: (error: unknown, order: any) => void },
    ) => Promise<void>;
    listenToOrders: (filter: { restaurantId?: string; statuses?: string[] }, onChange: (orders: any[]) => void, onError?: (error: Error) => void) => Unsubscribe;
    assignCourier: (orderId: string, courierLabel: string, currentStatus?: string) => Promise<any>;
    updateOrderStatus: (orderId: string, status: string) => Promise<any>;
};

export type ReviewRepository = {
    fetchMenuItemReviews: (menuItemId: string, options?: { limit?: number }) => Promise<MenuItemReview[]>;
    fetchRestaurantReviews: (restaurantId: string, options?: { includeHidden?: boolean; limit?: number }) => Promise<MenuItemReview[]>;
    fetchRestaurantReviewSummary: (restaurantId: string) => Promise<RestaurantReviewSummary>;
    fetchUserReviews: (userId: string, options?: { limit?: number }) => Promise<MenuItemReview[]>;
    subscribeUserReviews: (userId: string, cb: (reviews: MenuItemReview[]) => void, options?: { limit?: number }) => Unsubscribe;
    submitMenuItemReview: (input: any) => Promise<MenuItemReview>;
    moderateMenuItemReview: (input: any) => Promise<void>;
    saveMenuItemReviewReply: (reviewId: string, reply: string) => Promise<void>;
    submitOrderReview: (input: { orderId: string; userName?: string; ratings: OrderReviewRatingBreakdown; comment?: string }) => Promise<OrderReview>;
    fetchOrderReviewByOrder: (orderId: string, userId: string) => Promise<OrderReview | null>;
    fetchUserOrderReviews: (userId: string, options?: { limit?: number }) => Promise<OrderReview[]>;
    fetchRestaurantOrderReviews: (restaurantId: string, options?: { includeHidden?: boolean; limit?: number }) => Promise<OrderReview[]>;
    calculateRestaurantOrderReviewSummary: (reviews: OrderReview[]) => RestaurantOrderReviewSummary;
    fetchRestaurantOrderReviewSummary: (restaurantId: string) => Promise<RestaurantOrderReviewSummary>;
    moderateOrderReview: (reviewId: string, status: OrderReview["status"]) => Promise<void>;
};

export type AddressRepository = {
    list: () => Promise<Address[]>;
    create: (payload: Omit<Address, "id" | "createdAt"> & { id?: string; isDefault?: boolean }) => Promise<Address>;
    update: (payload: Address) => Promise<Address>;
    remove: (id: string) => Promise<void>;
    setDefault: (id: string) => Promise<void>;
    syncUp: () => Promise<void>;
    syncDown: () => Promise<void>;
    subscribe: (listener: (addresses: Address[]) => void) => Unsubscribe;
};

export type FavoritesRepository = {
    isRemoteScope: (scope: string) => boolean;
    loadFavorites: (scope: string) => Promise<unknown>;
    persistFavorites: (scope: string, ids: string[]) => Promise<void>;
};

export type NotificationRepository = {
    registerPushToken: () => Promise<any>;
    unregisterPushToken: () => Promise<void>;
};

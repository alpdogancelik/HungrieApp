import type { CartCustomization } from "@/src/domain/types";

export type MenuEntry = {
    id: string;
    name: string;
    description?: string;
    price: number;
    categories?: string[] | string;
    category?: string;
    restaurantId?: string;
    image_url?: string;
    imageUrl?: string;
    customizations?: CartCustomization[];
    rating?: number;
    ratingAverage?: number;
    ratingCount?: number;
};

export type MenuCategory = {
    id?: string;
    name?: string;
    slug?: string;
};

export type Restaurant = {
    id?: string;
    name?: string;
    description?: string;
    cuisine?: string;
    address?: string;
    city?: string;
    district?: string;
    location?: string;
    imageUrl?: string | number;
    image_url?: string | number;
    openingTime?: string;
    opening_time?: string;
    closingTime?: string;
    closing_time?: string;
    isActive?: boolean;
    isOpen?: boolean;
    status?: string;
    ratingAverage?: number;
    ratingCount?: number;
    deliveryEtaAverage?: number;
    deliveryEtaMin?: number;
    deliveryEtaMax?: number;
    deliveryFee?: number | string;
    deliveryTime?: string | number;
    etaMinutes?: number | string;
    eta?: string | number;
    minimumOrderAmount?: number | string;
    minimumOrder?: number | string;
    minOrderAmount?: number | string;
    minBasketAmount?: number | string;
    promotionText?: string;
    promotion?: string | { title?: string; description?: string };
    freeDeliveryThreshold?: number | string;
};

export type MenuSection = {
    key: string;
    label: string;
    data: MenuEntry[];
};

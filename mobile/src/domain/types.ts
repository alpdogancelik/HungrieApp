export type BaseDocument = {
    $id?: string;
    id?: string | number;
    createdAt?: string;
    updatedAt?: string;
};

export type PaymentMethod = "cash" | "pos";

export type OrderStatus =
    | "pending"
    | "preparing"
    | "ready"
    | "out_for_delivery"
    | "delivered"
    | "canceled";

export type Address = {
    id: string;
    label: string;
    line1: string;
    block?: string;
    room?: string;
    city: string;
    country: string;
    isDefault: boolean;
    createdAt: string;
};

export type Category = BaseDocument & {
    name: string;
    description?: string;
    icon?: any;
};

export type User = BaseDocument & {
    name: string;
    email: string;
    avatar?: string;
    whatsappNumber?: string;
};

export type CartCustomization = {
    id: string;
    name: string;
    price: number;
    type?: string;
};

export type Restaurant = BaseDocument & {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    image_url?: string;
    isActive: boolean;
};

export type MenuItem = BaseDocument & {
    id: string;
    restaurantId?: string;
    name: string;
    description?: string;
    price: number;
    etaMinutes?: number | string;
    deliveryTime?: string | number;
    eta?: string | number;
    cost?: number;
    imageUrl?: string;
    image_url?: string;
    calories?: number;
    protein?: number;
    rating?: number;
    type?: string;
    category_name?: string;
    visible?: boolean;
    customizations?: CartCustomization[];
};

export type CartItem = {
    menuItemId: string;
    name: string;
    quantity: number;
    price: number;
    customizations?: { id: string; name: string; price: number }[];
};

export type CartItemType = {
    id: string;
    name: string;
    price: number;
    image_url: string;
    quantity: number;
    restaurantId?: string;
    customizations?: CartCustomization[];
};

export type Order = {
    id: string;
    userId: string;
    restaurantId: string;
    items: CartItem[];
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    subtotal: number;
    deliveryFee: number;
    serviceFee: number;
    discount: number;
    tip: number;
    total: number;
    etaMinutes?: number;
    createdAt: string;
    updatedAt: string;
    customerName?: string;
    customerEmail?: string;
    customerWhatsapp?: string;
    customer?: {
        name?: string;
        email?: string;
        whatsappNumber?: string;
    };
};

export type RestaurantOrder = BaseDocument & {
    restaurantId?: string | number;
    restaurant?: {
        id?: string | number;
        name?: string;
        imageUrl?: string;
    };
    customerName?: string;
    customerEmail?: string;
    customerWhatsapp?: string;
    customer?: {
        name?: string;
        email?: string;
        whatsappNumber?: string;
    };
    notes?: string;
    address?: string;
    total?: string | number;
    status?: OrderStatus | string;
    paymentMethod?: string;
    orderItems?: { name?: string; quantity?: number }[];
};

export type Review = {
    id: string;
    productId: string;
    userId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    createdAt: string;
};

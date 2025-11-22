type BaseDocument = {
    $id?: string;
    id?: string | number;
    createdAt?: string;
    updatedAt?: string;
};

export interface MenuItem extends BaseDocument {
    name: string;
    price: number;
    image_url: string;
    imageUrl?: string;
    description: string;
    calories: number;
    protein: number;
    rating: number;
    type: string;
    cost?: number;
    deliveryTime?: string | number;
    eta?: string | number;
}

export interface Category extends BaseDocument {
    name: string;
    description?: string;
    icon?: any;
}

export interface User extends BaseDocument {
    name: string;
    email: string;
    avatar: string;
}

export interface CartCustomization {
    id: string;
    name: string;
    price: number;
    type: string;
}

export interface CartItemType {
    id: string; // menu item id
    name: string;
    price: number;
    image_url: string;
    quantity: number;
    customizations?: CartCustomization[];
}

export interface CartStore {
    items: CartItemType[];
    addItem: (item: Omit<CartItemType, "quantity">) => void;
    removeItem: (id: string, customizations: CartCustomization[]) => void;
    increaseQty: (id: string, customizations: CartCustomization[]) => void;
    decreaseQty: (id: string, customizations: CartCustomization[]) => void;
    clearCart: () => void;
    getTotalItems: () => number;
    getTotalPrice: () => number;
}

export type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "canceled";

export interface RestaurantOrder {
    createdAt: string | undefined;
    $id?: string;
    id?: string | number;
    restaurantId?: string | number;
    restaurant?: {
        id?: string | number;
        name?: string;
        imageUrl?: string;
    };
    customerName?: string;
    address?: string;
    total?: string | number;
    status?: OrderStatus | string;
    paymentMethod?: string;
    orderItems?: { name?: string; quantity?: number }[];
    updatedAt?: string;
}

interface TabBarIconProps {
    focused: boolean;
    icon: any;
    title: string;
}

interface PaymentInfoStripeProps {
    label: string;
    value: string;
    labelStyle?: string;
    valueStyle?: string;
}

interface CustomButtonProps {
    onPress?: () => void;
    title?: string;
    style?: string;
    leftIcon?: React.ReactNode;
    textStyle?: string;
    isLoading?: boolean;
    disabled?: boolean;
}

interface CustomHeaderProps {
    title?: string;
}

interface CustomInputProps {
    placeholder?: string;
    value?: string;
    onChangeText?: (text: string) => void;
    label: string;
    secureTextEntry?: boolean;
    keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
}

interface ProfileFieldProps {
    label: string;
    value: string;
    icon: any;
}

interface CreateUserPrams {
    email: string;
    password: string;
    name: string;
}

interface SignInParams {
    email: string;
    password: string;
}

interface GetMenuParams {
    category: string;
    query: string;
}

declare module "*.png" { const value: any; export default value }
declare module "*.jpg" { const value: any; export default value }
declare module "*.jpeg" { const value: any; export default value }
declare module "*.gif" { const value: any; export default value }
declare module "*.svg" {
    import type { FC, SVGProps } from "react";
    const content: FC<SVGProps<SVGSVGElement>>;
    export default content;
}
declare module "*.json" { const value: any; export default value }

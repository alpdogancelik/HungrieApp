const RESTAURANT_LOGO_MAP: Record<string, number> = {
    "@/assets/restaurantlogo/adapizzalogo.jpeg": require("@/assets/restaurantlogo/adapizzalogo.jpeg"),
    "@/assets/restaurantlogo/alacartelogo.jpeg": require("@/assets/restaurantlogo/alacartelogo.jpeg"),
    "@/assets/restaurantlogo/hotnfreshlogo.jpeg": require("@/assets/restaurantlogo/hotnfreshlogo.jpeg"),
    "@/assets/restaurantlogo/lombardlogo.jpg.jpg": require("@/assets/restaurantlogo/lombardlogo.jpg.jpg"),
    "@/assets/restaurantlogo/burgerhouselogo.jpeg": require("@/assets/restaurantlogo/burgerhouselogo.jpeg"),
};

const FALLBACK_RESTAURANT_IMAGE =
    "https://images.unsplash.com/photo-1604908176997-1251882c8ef1?auto=format&fit=crop&w=1200&q=70";

export const resolveRestaurantImageSource = (value?: string | number | null) => {
    if (typeof value === "number" || value === null || value === undefined) {
        return value ?? undefined;
    }
    const trimmed = value.trim();
    const localAsset = RESTAURANT_LOGO_MAP[trimmed];
    if (localAsset) return localAsset;
    // Prevent invalid URI errors when a local asset path leaks into runtime.
    if (trimmed.startsWith("@/assets/restaurantlogo/")) return FALLBACK_RESTAURANT_IMAGE;
    return trimmed || FALLBACK_RESTAURANT_IMAGE;
};

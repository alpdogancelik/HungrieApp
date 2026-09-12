import { getCategoryLabel, normalizeCategoryKey } from "@/src/lib/categoryLabels";

import type { MenuCategory, MenuEntry, Restaurant, MenuSection } from "./types";

const BASE_CATEGORY_ORDER = [
    "popular",
    "popular-foods",
    "burgers",
    "burger",
    "wraps",
    "durum",
    "pizzas",
    "pizza",
    "kebabs",
    "kebap",
    "salads",
    "salata",
    "desserts",
    "tatli",
    "drinks",
    "icecek",
    "sauces",
    "soslar",
];

export const parseNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};

export const formatTry = (value: unknown, locale: "tr" | "en") =>
    new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(parseNumber(value) ?? 0);

const slugify = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ç/g, "c")
        .replace(/ğ/g, "g")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ş/g, "s")
        .replace(/ü/g, "u")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

export const createMenuSections = (
    rawItems: MenuEntry[],
    categories: MenuCategory[],
    locale: "tr" | "en",
): MenuSection[] => {
    const categoryMap = new Map<string, string>();
    categories.forEach((category) => {
        const slug = normalizeCategoryKey(slugify(category.slug || category.name || category.id));
        if (category.id) categoryMap.set(String(category.id), slug);
        if (category.slug) categoryMap.set(String(category.slug), slug);
        if (category.name) categoryMap.set(String(category.name), slug);
    });

    const grouped: Record<string, MenuEntry[]> = {};
    rawItems.forEach((item) => {
        const raw = item.categories ?? item.category ?? "other";
        const values = Array.isArray(raw) ? raw : [raw];
        const normalized = values
            .map((value) => normalizeCategoryKey(categoryMap.get(String(value)) || slugify(value)))
            .filter(Boolean);
        (normalized.length ? Array.from(new Set(normalized)) : ["other"]).forEach((key) => {
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({ ...item, categories: normalized });
        });
    });

    const categoryOrder = categories
        .map((category) => normalizeCategoryKey(slugify(category.slug || category.name || category.id)))
        .filter((key) => Boolean(key) && grouped[key]?.length);
    const keys = Array.from(new Set([...categoryOrder, ...Object.keys(grouped)])).sort((left, right) => {
        const leftIndex = BASE_CATEGORY_ORDER.indexOf(left);
        const rightIndex = BASE_CATEGORY_ORDER.indexOf(right);
        if (leftIndex < 0 && rightIndex < 0) return left.localeCompare(right);
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex - rightIndex;
    });

    return keys.map((key) => ({ key, label: getCategoryLabel(key, locale), data: grouped[key] || [] }));
};

const clockMinutes = (value: unknown) => {
    const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};

export const isRestaurantOpen = (restaurant?: Restaurant | null) => {
    const status = String(restaurant?.status || "").trim().toLowerCase();
    if (
        restaurant?.isActive === false ||
        restaurant?.isOpen === false ||
        ["closed", "kapalı", "kapali", "inactive", "disabled", "offline"].includes(status)
    ) return false;
    const opens = clockMinutes(restaurant?.openingTime || restaurant?.opening_time);
    const closes = clockMinutes(restaurant?.closingTime || restaurant?.closing_time);
    if (opens === null || closes === null || opens === closes) return true;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    return opens < closes ? current >= opens && current < closes : current >= opens || current < closes;
};

export const getEta = (restaurant: Restaurant | null, isTurkish: boolean) => {
    const minimum = parseNumber(restaurant?.deliveryEtaMin);
    const maximum = parseNumber(restaurant?.deliveryEtaMax);
    if (minimum !== null && maximum !== null) return `${Math.round(minimum)}–${Math.round(maximum)} ${isTurkish ? "dk" : "min"}`;
    const range = String(restaurant?.deliveryTime || restaurant?.eta || "").match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) return `${range[1]}–${range[2]} ${isTurkish ? "dk" : "min"}`;
    const average = parseNumber(restaurant?.deliveryEtaAverage ?? restaurant?.etaMinutes);
    if (average !== null) return `${Math.max(10, Math.round(average) - 5)}–${Math.round(average) + 5} ${isTurkish ? "dk" : "min"}`;
    return isTurkish ? "Teslimat süresi yok" : "Delivery unavailable";
};

export const getPromotionText = (restaurant: Restaurant | null, locale: "tr" | "en") => {
    const direct = String(restaurant?.promotionText || "").trim();
    if (direct) return direct;
    if (typeof restaurant?.promotion === "string" && restaurant.promotion.trim()) return restaurant.promotion.trim();
    if (restaurant?.promotion && typeof restaurant.promotion === "object") {
        const text = String(restaurant.promotion.description || restaurant.promotion.title || "").trim();
        if (text) return text;
    }
    const threshold = parseNumber(restaurant?.freeDeliveryThreshold);
    if (threshold === null) return null;
    return locale === "tr"
        ? `${formatTry(threshold, locale)} ve üzeri siparişlerde ücretsiz teslimat!`
        : `Free delivery on orders over ${formatTry(threshold, locale)}!`;
};

export const isSauce = (item: MenuEntry) => {
    const value = `${item.name} ${Array.isArray(item.categories) ? item.categories.join(" ") : item.categories || ""}`.toLowerCase();
    return /\b(sauce|sauces|sos|soslar|ketçap|ketcap|mayonez|mayo|ranch|barbekü|barbeku)\b/.test(value);
};

export const isExtra = (item: MenuEntry) => {
    const value = `${item.name} ${Array.isArray(item.categories) ? item.categories.join(" ") : item.categories || ""}`.toLowerCase();
    return /\b(extra|extras|ekstra|side|sides|snack|snacks|fries|chips|halka|sticks?)\b/.test(value);
};

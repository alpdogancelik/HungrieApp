import type { PublicRestaurantReview, ReviewItemSnapshot } from "@hungrie/domain";

export type PublicReviewLocale = "en" | "tr";

export const getPublicReviewCopy = (locale: PublicReviewLocale) => locale === "tr" ? {
    explanation: "Teslim edilen siparişlerden gelen değerlendirmeler",
    overall: "Genel",
    taste: "Lezzet",
    speed: "Hız",
    recent: "Son değerlendirmeler",
    empty: "Henüz sipariş değerlendirmesi yok.",
    loadMore: "Daha fazla değerlendirme yükle",
    loadingMore: "Yükleniyor…",
    loading: "Değerlendirmeler yükleniyor",
    loadErrorTitle: "Değerlendirmeler alınamadı",
    loadErrorBody: "Değerlendirmeleri şu anda yükleyemiyoruz.",
    pageError: "Daha fazla değerlendirme yüklenemedi.",
    offlineTitle: "İnternet bağlantısı yok",
    offlineBody: "Bağlantını kontrol edip tekrar dene.",
    retry: "Tekrar dene",
    refreshing: "Değerlendirmeler yenileniyor",
    reviews: (count: number) => `${count} sipariş değerlendirmesi`,
    today: "Bugün",
    yesterday: "Dün",
    daysAgo: (count: number) => `${count} gün önce`,
    weeksAgo: (count: number) => `${count} hafta önce`,
    monthsAgo: (count: number) => `${count} ay önce`,
    yearsAgo: (count: number) => `${count} yıl önce`,
    moreItems: (count: number) => `+${count} ürün daha`,
} : {
    explanation: "Reviews from delivered orders",
    overall: "Overall",
    taste: "Taste",
    speed: "Speed",
    recent: "Recent reviews",
    empty: "No order reviews yet.",
    loadMore: "Load more reviews",
    loadingMore: "Loading…",
    loading: "Loading reviews",
    loadErrorTitle: "Reviews could not be loaded",
    loadErrorBody: "We could not load reviews right now.",
    pageError: "More reviews could not be loaded.",
    offlineTitle: "You are offline",
    offlineBody: "Check your connection and try again.",
    retry: "Try again",
    refreshing: "Refreshing reviews",
    reviews: (count: number) => `${count} order ${count === 1 ? "review" : "reviews"}`,
    today: "Today",
    yesterday: "Yesterday",
    daysAgo: (count: number) => `${count} days ago`,
    weeksAgo: (count: number) => `${count} ${count === 1 ? "week" : "weeks"} ago`,
    monthsAgo: (count: number) => `${count} ${count === 1 ? "month" : "months"} ago`,
    yearsAgo: (count: number) => `${count} ${count === 1 ? "year" : "years"} ago`,
    moreItems: (count: number) => `+${count} more`,
};

const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const formatCoarseReviewDate = (value: string, locale: PublicReviewLocale, now = new Date()) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    const copy = getPublicReviewCopy(locale);
    if (!match) return copy.today;
    const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isFinite(target)) return copy.today;
    const days = Math.max(0, Math.floor((utcDay(now) - target) / 86_400_000));
    if (days === 0) return copy.today;
    if (days === 1) return copy.yesterday;
    if (days < 7) return copy.daysAgo(days);
    if (days < 28) return copy.weeksAgo(Math.floor(days / 7));
    if (days < 365) return copy.monthsAgo(Math.floor(days / 30));
    return copy.yearsAgo(Math.floor(days / 365));
};

export const formatPublicReviewItems = (items: ReviewItemSnapshot[], locale: PublicReviewLocale) => {
    if (!items.length) return "";
    const visible = items.slice(0, 3).map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`);
    const remaining = items.length - visible.length;
    if (remaining > 0) visible.push(getPublicReviewCopy(locale).moreItems(remaining));
    return visible.join(" · ");
};

export const mergePublicReviewPages = (current: PublicRestaurantReview[], incoming: PublicRestaurantReview[]) => {
    const seen = new Set<string>();
    return [...current, ...incoming].filter((item) => {
        if (seen.has(item.reviewId)) return false;
        seen.add(item.reviewId);
        return true;
    });
};

export const safeNextPublicReviewCursor = (requested: string | null, returned: string | null) =>
    returned && returned !== requested ? returned : null;

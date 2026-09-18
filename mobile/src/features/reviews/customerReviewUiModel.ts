import type { MealReaction, ReviewItemSnapshot, ReviewRepositoryErrorCode, ReviewRating } from "@hungrie/domain";

export type CustomerReviewForm = {
    tasteRating: ReviewRating | null;
    speedRating: ReviewRating | null;
    comment: string;
    mealReactions: Array<{ menuItemId: string; reaction: MealReaction }>;
};

export type CustomerReviewCopy = ReturnType<typeof getCustomerReviewCopy>;

const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

export const normalizeReviewComment = (value: string) => String(value || "").replace(/^ +| +$/g, "").normalize("NFC");
export const reviewCommentLength = (value: string) => Array.from(normalizeReviewComment(value)).length;

export const groupReviewItems = (items: Array<Partial<ReviewItemSnapshot> & Record<string, unknown>>): ReviewItemSnapshot[] => {
    const grouped = new Map<string, ReviewItemSnapshot>();
    for (const item of items || []) {
        const menuItemId = String(item.menuItemId ?? item.itemId ?? item.id ?? "").trim();
        if (!menuItemId) continue;
        const current = grouped.get(menuItemId);
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const name = String(item.name || current?.name || "Menu item").trim() || current?.name || "Menu item";
        grouped.set(menuItemId, { menuItemId, name: current?.name || name, quantity: (current?.quantity || 0) + quantity });
    }
    return [...grouped.values()];
};

export const validateCustomerReviewForm = (form: CustomerReviewForm) => {
    if (!form.tasteRating) return "taste_required" as const;
    if (!form.speedRating) return "speed_required" as const;
    const comment = normalizeReviewComment(form.comment);
    if (reviewCommentLength(comment) > 500 || CONTROL_CHARACTER.test(comment)) return "invalid_comment" as const;
    if (form.mealReactions.length > 100) return "too_many_reactions" as const;
    if (new Set(form.mealReactions.map((entry) => entry.menuItemId)).size !== form.mealReactions.length) return "duplicate_reaction" as const;
    return null;
};

export const getCustomerReviewCopy = (turkish: boolean) => ({
    entry: turkish ? "Siparişi değerlendir" : "Review order",
    completed: turkish ? "Değerlendirildi" : "Reviewed",
    title: turkish ? "Siparişin nasıldı?" : "How was your order?",
    context: (restaurant: string) => turkish ? `${restaurant} siparişini değerlendir.` : `Review your delivered order from ${restaurant}.`,
    taste: turkish ? "Lezzet" : "Taste",
    speed: turkish ? "Hız" : "Speed",
    speedHelp: turkish ? "Hazırlama ve teslimat hızı" : "Preparation and delivery speed",
    comment: turkish ? "Yorum (isteğe bağlı)" : "Comment (optional)",
    placeholder: turkish ? "Sipariş deneyimini anlat…" : "Tell us about your order…",
    meals: turkish ? "Yemekler nasıldı? (isteğe bağlı)" : "How were the meals? (optional)",
    liked: turkish ? "Beğendim" : "Liked",
    disliked: turkish ? "Beğenmedim" : "Disliked",
    submit: turkish ? "Değerlendirmeyi gönder" : "Submit review",
    submitting: turkish ? "Gönderiliyor…" : "Submitting…",
    close: turkish ? "Kapat" : "Close",
    discardTitle: turkish ? "Değerlendirmeden vazgeçilsin mi?" : "Discard this review?",
    discardBody: turkish ? "Puanların, yorumun ve yemek tepkilerin kaybolacak." : "Your ratings, comment, and meal reactions will be lost.",
    keepEditing: turkish ? "Düzenlemeye devam et" : "Keep editing",
    discard: turkish ? "Vazgeç ve kapat" : "Discard and close",
    retry: turkish ? "Tekrar dene" : "Try again",
    required: turkish ? "Gerekli" : "Required",
    starLabel: (label: string, value: number) => turkish ? `${label}, 5 üzerinden ${value}` : `${label}, ${value} of 5`,
    starAnnouncement: (label: string, value: number) => turkish ? `${label}, 5 üzerinden ${value} seçildi` : `${label}, ${value} of 5 selected`,
    selectTaste: turkish ? "Lezzet puanı seç." : "Select a Taste rating.",
    selectSpeed: turkish ? "Hız puanı seç." : "Select a Speed rating.",
    invalid: turkish ? "Puanları, yorumu ve yemek tepkilerini kontrol et." : "Check the ratings, comment, and meal reactions.",
    errors: {
        session_expired: turkish ? "Oturumun sona erdi. Tekrar giriş yap." : "Your session expired. Sign in again.",
        account_inactive: turkish ? "Hesabın değerlendirme gönderemiyor." : "Your account cannot submit reviews.",
        order_unavailable: turkish ? "Bu sipariş değerlendirilemiyor." : "This order is unavailable for review.",
        review_expired: turkish ? "30 günlük değerlendirme süresi sona erdi." : "The 30-day review period has ended.",
        already_reviewed: turkish ? "Bu sipariş zaten değerlendirildi." : "This order has already been reviewed.",
        invalid_reaction_item: turkish ? "Bir veya daha fazla yemek bu siparişe ait değil." : "One or more meals are not part of this order.",
        operation_conflict: turkish ? "Puanları, yorumu ve yemek tepkilerini kontrol et." : "Check the ratings, comment, and meal reactions.",
        validation: turkish ? "Puanları, yorumu ve yemek tepkilerini kontrol et." : "Check the ratings, comment, and meal reactions.",
        service_unavailable: turkish ? "Değerlendirmen gönderilemedi. Tekrar dene." : "We could not submit your review. Try again.",
        unknown: turkish ? "Değerlendirmen gönderilemedi. Tekrar dene." : "We could not submit your review. Try again.",
    } satisfies Record<ReviewRepositoryErrorCode, string>,
});

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItemReview } from "@/src/domain/types";
import { fetchMenuItemReviews, submitMenuItemReview } from "@/src/services/menuItemReviews";
import useAuthStore from "@/store/auth.store";

type SubmitParams = { rating: 1 | 2 | 3 | 4 | 5; comment?: string };
type SubmitResult = { queued: boolean; error?: Error };
type UseProductReviewsOptions = {
    orderId?: string;
    restaurantId?: string;
    enabled?: boolean;
};

const sanitizeComment = (comment?: string) => {
    const trimmed = comment?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 500);
};

export const useProductReviews = (productId?: string, options: UseProductReviewsOptions = {}) => {
    const { user } = useAuthStore();
    const userId = (user as any)?.$id || (user as any)?.id || (user as any)?.accountId || "guest";
    const userName = (user as any)?.name || undefined;
    const [reviews, setReviews] = useState<MenuItemReview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const orderId = options.orderId ? String(options.orderId) : undefined;
    const restaurantId = options.restaurantId ? String(options.restaurantId) : undefined;
    const enabled = options.enabled !== false;

    const loadReviews = useCallback(async () => {
        if (!productId || !enabled) {
            setReviews([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const data = await fetchMenuItemReviews(productId);
        setReviews(data);
        setIsLoading(false);
    }, [enabled, productId]);

    useEffect(() => {
        let mounted = true;
        const sync = async () => {
            if (!mounted) return;
            await loadReviews();
        };
        void sync();
        return () => {
            mounted = false;
        };
    }, [loadReviews]);

    const currentUserReview = useMemo(
        () =>
            reviews.find((review) =>
                orderId ? review.userId === userId && review.orderId === orderId : review.userId === userId,
            ),
        [orderId, reviews, userId],
    );

    const average = useMemo(() => {
        if (!reviews.length) return 0;
        const total = reviews.reduce((sum, review) => sum + review.rating, 0);
        return total / reviews.length;
    }, [reviews]);

    const submitReview = useCallback(
        async ({ rating, comment }: SubmitParams): Promise<SubmitResult> => {
            if (!productId || !rating) return { queued: false };
            if (!orderId || !restaurantId) {
                return { queued: false, error: new Error("Order context is required for menu item reviews.") };
            }
            if (userId === "guest") {
                return { queued: false, error: new Error("Please sign in before leaving a review.") };
            }
            setIsSubmitting(true);

            const sanitized = sanitizeComment(comment);
            const optimisticReview: MenuItemReview = {
                id: currentUserReview?.id ?? `temp-${Date.now()}`,
                reviewKey: currentUserReview?.reviewKey ?? `temp-${orderId}-${productId}-${userId}`,
                orderId,
                restaurantId,
                menuItemId: productId,
                userId,
                userName,
                rating,
                comment: sanitized,
                status: "published",
                createdAt: new Date().toISOString(),
            };

            setReviews((prev) => {
                const existingIndex = prev.findIndex((review) =>
                    orderId ? review.userId === userId && review.orderId === orderId : review.userId === userId,
                );
                if (existingIndex >= 0) {
                    const copy = [...prev];
                    copy[existingIndex] = optimisticReview;
                    return copy;
                }
                return [optimisticReview, ...prev];
            });

            try {
                await submitMenuItemReview({
                    orderId,
                    restaurantId,
                    menuItemId: productId,
                    userId,
                    userName,
                    rating,
                    comment: sanitized,
                });
                await loadReviews();
                return { queued: false };
            } catch (error) {
                await loadReviews();
                return { queued: false, error: error instanceof Error ? error : new Error("Unable to submit review") };
            } finally {
                setIsSubmitting(false);
            }
        },
        [currentUserReview?.id, currentUserReview?.reviewKey, loadReviews, orderId, productId, restaurantId, userId, userName],
    );

    return {
        reviews,
        average,
        count: reviews.length,
        isLoading,
        isSubmitting,
        currentUserReview,
        submitReview,
    };
};

export type UseProductReviewsReturn = ReturnType<typeof useProductReviews>;

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Review } from "@/src/domain/types";
import { createReview, enqueueReview, fetchReviews, flushReviewQueue } from "@/src/api/reviews";
import useAuthStore from "@/store/auth.store";

type SubmitParams = { rating: 1 | 2 | 3 | 4 | 5; comment?: string };
type SubmitResult = { queued: boolean; error?: Error };

const sanitizeComment = (comment?: string) => {
    const trimmed = comment?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 500);
};

const isOffline = () => {
    if (typeof navigator === "undefined") return false;
    return navigator.onLine === false;
};

export const useProductReviews = (productId?: string) => {
    const { user } = useAuthStore();
    const userId = (user as any)?.$id || (user as any)?.id || "guest";
    const [reviews, setReviews] = useState<Review[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadReviews = useCallback(async () => {
        if (!productId) {
            setReviews([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const data = await fetchReviews(productId);
        setReviews(data);
        setIsLoading(false);
    }, [productId]);

    useEffect(() => {
        let mounted = true;
        const sync = async () => {
            await flushReviewQueue();
            if (!mounted) return;
            await loadReviews();
        };
        void sync();
        return () => {
            mounted = false;
        };
    }, [loadReviews]);

    const currentUserReview = useMemo(
        () => reviews.find((review) => review.userId === userId),
        [reviews, userId],
    );

    const average = useMemo(() => {
        if (!reviews.length) return 0;
        const total = reviews.reduce((sum, review) => sum + review.rating, 0);
        return total / reviews.length;
    }, [reviews]);

    const submitReview = useCallback(
        async ({ rating, comment }: SubmitParams): Promise<SubmitResult> => {
            if (!productId || !rating) return { queued: false };
            setIsSubmitting(true);

            const sanitized = sanitizeComment(comment);
            const optimisticReview: Review = {
                id: currentUserReview?.id ?? `temp-${Date.now()}`,
                productId,
                userId,
                rating,
                comment: sanitized,
                createdAt: new Date().toISOString(),
            };

            setReviews((prev) => {
                const existingIndex = prev.findIndex((review) => review.userId === userId);
                if (existingIndex >= 0) {
                    const copy = [...prev];
                    copy[existingIndex] = optimisticReview;
                    return copy;
                }
                return [optimisticReview, ...prev];
            });

            try {
                if (isOffline()) {
                    await enqueueReview({ productId, userId, rating, comment: sanitized });
                    return { queued: true };
                }
                await createReview({ productId, userId, rating, comment: sanitized });
                await loadReviews();
                return { queued: false };
            } catch (error) {
                await enqueueReview({ productId, userId, rating, comment: sanitized });
                return { queued: true, error: error instanceof Error ? error : new Error("Unable to submit review") };
            } finally {
                setIsSubmitting(false);
            }
        },
        [currentUserReview?.id, loadReviews, productId, userId],
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

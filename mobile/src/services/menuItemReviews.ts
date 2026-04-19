import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";

import { FIREBASE_COLLECTIONS, firestore } from "@/lib/firebase";
import type { MenuItemReview, RestaurantReviewSummary } from "@/src/domain/types";
import { recomputeRestaurantMetrics } from "@/src/services/restaurantMetrics";

type SubmitMenuItemReviewInput = {
    orderId: string;
    restaurantId: string;
    menuItemId: string;
    userId: string;
    userName?: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
};

type ModerateMenuItemReviewInput = {
    reviewId: string;
    status?: MenuItemReview["status"];
    reply?: string;
};

const ensureDb = () => {
    if (!firestore) {
        throw new Error("Firebase is not configured.");
    }
    return firestore;
};

const toIsoString = (value: unknown) => {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof value === "object" && value && "seconds" in value) {
        const millis =
            Number((value as { seconds?: number }).seconds || 0) * 1000 +
            Number((value as { nanoseconds?: number }).nanoseconds || 0) / 1_000_000;
        return new Date(millis).toISOString();
    }
    return undefined;
};

const normalizeComment = (comment?: string) => {
    const trimmed = comment?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 500);
};

const createReviewId = ({ orderId, menuItemId, userId }: { orderId: string; menuItemId: string; userId: string }) =>
    [orderId, menuItemId, userId].map((part) => encodeURIComponent(String(part))).join("__");

const mapReviewDoc = (snapshot: { id: string; data: () => Record<string, unknown> }): MenuItemReview => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        reviewKey: String(data.reviewKey || snapshot.id),
        orderId: String(data.orderId || ""),
        restaurantId: String(data.restaurantId || ""),
        restaurantName: data.restaurantName ? String(data.restaurantName) : undefined,
        menuItemId: String(data.menuItemId || ""),
        menuItemName: data.menuItemName ? String(data.menuItemName) : undefined,
        userId: String(data.userId || ""),
        userName: data.userName ? String(data.userName) : undefined,
        rating: Number(data.rating || 0) as 1 | 2 | 3 | 4 | 5,
        comment: data.comment ? String(data.comment) : undefined,
        status: (data.status === "hidden" ? "hidden" : "published") as MenuItemReview["status"],
        reply: data.reply ? String(data.reply) : undefined,
        replyAt: toIsoString(data.replyAt),
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
    };
};

const getReviewTimestamp = (review: Pick<MenuItemReview, "updatedAt" | "createdAt">) =>
    new Date(review.updatedAt || review.createdAt || 0).getTime();

const sortReviewsByRecent = (reviews: MenuItemReview[]) =>
    [...reviews].sort((a, b) => getReviewTimestamp(b) - getReviewTimestamp(a));

const resolveOrderItems = (orderData: Record<string, any>) => {
    if (Array.isArray(orderData.items)) return orderData.items;
    if (Array.isArray(orderData.orderItems)) return orderData.orderItems;
    return [];
};

const getMenuAggregateAfterStatusChange = ({
    currentCount,
    currentTotal,
    rating,
    previousStatus,
    nextStatus,
}: {
    currentCount: number;
    currentTotal: number;
    rating: number;
    previousStatus: MenuItemReview["status"];
    nextStatus: MenuItemReview["status"];
}) => {
    let nextCount = currentCount;
    let nextTotal = currentTotal;

    if (previousStatus === nextStatus) {
        return {
            ratingCount: currentCount,
            ratingTotal: currentTotal,
            ratingAverage: currentCount > 0 ? Number((currentTotal / currentCount).toFixed(2)) : 0,
        };
    }

    if (previousStatus === "published" && nextStatus === "hidden") {
        nextCount = Math.max(0, currentCount - 1);
        nextTotal = Math.max(0, currentTotal - rating);
    }

    if (previousStatus === "hidden" && nextStatus === "published") {
        nextCount = currentCount + 1;
        nextTotal = currentTotal + rating;
    }

    return {
        ratingCount: nextCount,
        ratingTotal: nextTotal,
        ratingAverage: nextCount > 0 ? Number((nextTotal / nextCount).toFixed(2)) : 0,
    };
};

const buildRestaurantReviewSummary = (reviews: MenuItemReview[]): RestaurantReviewSummary => {
    const publishedReviews = reviews.filter((review) => review.status === "published");
    const distribution: RestaurantReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const latestByMenuItem: Record<string, MenuItemReview> = {};

    for (const review of publishedReviews) {
        distribution[review.rating] += 1;
        if (!latestByMenuItem[review.menuItemId]) {
            latestByMenuItem[review.menuItemId] = review;
        }
    }

    const total = publishedReviews.reduce((sum, review) => sum + review.rating, 0);
    return {
        average: publishedReviews.length ? Number((total / publishedReviews.length).toFixed(1)) : 0,
        count: publishedReviews.length,
        distribution,
        recentReviews: publishedReviews.slice(0, 8),
        latestByMenuItem,
    };
};

export const fetchMenuItemReviews = async (menuItemId: string) => {
    if (!menuItemId) return [];

    const db = ensureDb();
    const snapshot = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.reviews), where("menuItemId", "==", String(menuItemId))),
    );

    return sortReviewsByRecent(snapshot.docs.map(mapReviewDoc).filter((review) => review.status === "published"));
};

export const fetchRestaurantReviews = async (restaurantId: string, options?: { includeHidden?: boolean }) => {
    if (!restaurantId) return [];

    const db = ensureDb();
    const snapshot = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.reviews), where("restaurantId", "==", String(restaurantId))),
    );

    const mapped = sortReviewsByRecent(snapshot.docs.map(mapReviewDoc));

    if (options?.includeHidden) return mapped;
    return mapped.filter((review) => review.status === "published");
};

export const fetchRestaurantReviewSummary = async (restaurantId: string) => {
    const reviews = await fetchRestaurantReviews(restaurantId);
    return buildRestaurantReviewSummary(reviews);
};

export const fetchUserReviews = async (userId: string) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return [];

    const db = ensureDb();
    const snapshot = await getDocs(query(collection(db, FIREBASE_COLLECTIONS.reviews), where("userId", "==", normalizedUserId)));
    return sortReviewsByRecent(snapshot.docs.map(mapReviewDoc));
};

export const submitMenuItemReview = async (input: SubmitMenuItemReviewInput) => {
    const db = ensureDb();
    const orderId = String(input.orderId || "").trim();
    const restaurantId = String(input.restaurantId || "").trim();
    const menuItemId = String(input.menuItemId || "").trim();
    const userId = String(input.userId || "").trim();
    const userName = input.userName?.trim();
    const comment = normalizeComment(input.comment);
    const rating = Number(input.rating || 0) as 1 | 2 | 3 | 4 | 5;

    if (!orderId || !restaurantId || !menuItemId || !userId) {
        throw new Error("Missing review context.");
    }
    if (![1, 2, 3, 4, 5].includes(rating)) {
        throw new Error("Rating must be between 1 and 5.");
    }

    const reviewId = createReviewId({ orderId, menuItemId, userId });
    const reviewRef = doc(db, FIREBASE_COLLECTIONS.reviews, reviewId);
    const orderRef = doc(db, FIREBASE_COLLECTIONS.orders, orderId);

    try {
        await runTransaction(db, async (transaction) => {
            const orderSnapshot = await transaction.get(orderRef);
            const reviewSnapshot = await transaction.get(reviewRef);

            if (!orderSnapshot.exists()) {
                throw new Error("Order not found.");
            }

            const orderData = orderSnapshot.data() || {};
            if (String(orderData.userId || "") !== userId) {
                throw new Error("You can only review your own orders.");
            }
            const normalizedOrderStatus = String(orderData.status || "").trim().toLowerCase();
            if (normalizedOrderStatus !== "delivered" && normalizedOrderStatus !== "completed") {
                throw new Error("Reviews are only available after completion.");
            }

            const orderItems = resolveOrderItems(orderData);
            const matchedItem = orderItems.find((item: any) => {
                const candidates = [item?.menuItemId, item?.id];
                return candidates.some((candidate) => String(candidate || "") === menuItemId);
            });

            if (!matchedItem) {
                throw new Error("This item was not found in the delivered order.");
            }

            if (reviewSnapshot.exists()) {
                throw new Error("This item has already been reviewed for this order.");
            }

            const orderRestaurantName =
                String(orderData?.restaurant?.name || orderData?.restaurantName || orderData?.restaurant || "").trim() || undefined;

            transaction.set(
                reviewRef,
                {
                    reviewKey: reviewId,
                    orderId,
                    restaurantId,
                    restaurantName: orderRestaurantName || undefined,
                    menuItemId,
                    menuItemName: String(matchedItem?.name || ""),
                    userId,
                    userName: userName || "Hungrie User",
                    rating,
                    comment: comment || "",
                    status: "published",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true },
            );
        });
    } catch (error: any) {
        const code = String(error?.code || "").toLowerCase();
        if (code.includes("permission-denied")) {
            throw new Error("Review permission is not enabled yet. Deploy Firestore rules and try again.");
        }
        throw error;
    }

    const savedSnapshot = await getDoc(reviewRef);
    if (!savedSnapshot.exists()) {
        throw new Error("Review could not be loaded after save.");
    }

    const savedReview = mapReviewDoc(savedSnapshot);
    await recomputeRestaurantMetrics(savedReview.restaurantId).catch((error) => {
        console.warn("[Metrics] Failed to recompute restaurant metrics after review save", error);
    });
    return savedReview;
};

export const moderateMenuItemReview = async ({ reviewId, status, reply }: ModerateMenuItemReviewInput) => {
    const db = ensureDb();
    const reviewRef = doc(db, FIREBASE_COLLECTIONS.reviews, reviewId);

    await runTransaction(db, async (transaction) => {
        const reviewSnapshot = await transaction.get(reviewRef);
        if (!reviewSnapshot.exists()) {
            throw new Error("Review not found.");
        }

        const reviewData = reviewSnapshot.data() as Record<string, any>;
        const currentStatus = (reviewData.status === "hidden" ? "hidden" : "published") as MenuItemReview["status"];
        const nextStatus = status || currentStatus;
        const menuItemId = String(reviewData.menuItemId || "");
        const menuRef = doc(db, FIREBASE_COLLECTIONS.menus, menuItemId);
        const menuSnapshot = await transaction.get(menuRef);
        const menuData = menuSnapshot.exists() ? menuSnapshot.data() || {} : {};
        const rating = Number(reviewData.rating || 0);
        const currentCount = Math.max(0, Number(menuData.ratingCount || 0));
        const currentTotal = Math.max(0, Number(menuData.ratingTotal || 0));
        const nextAggregate = getMenuAggregateAfterStatusChange({
            currentCount,
            currentTotal,
            rating,
            previousStatus: currentStatus,
            nextStatus,
        });

        transaction.set(
            reviewRef,
            {
                status: nextStatus,
                reply: reply?.trim() || "",
                replyAt: reply?.trim() ? serverTimestamp() : reviewData.replyAt || null,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );

        transaction.set(
            menuRef,
            {
                ratingAverage: nextAggregate.ratingAverage,
                ratingCount: nextAggregate.ratingCount,
                ratingTotal: nextAggregate.ratingTotal,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
    });

    const updatedSnapshot = await getDoc(reviewRef);
    if (!updatedSnapshot.exists()) {
        throw new Error("Review could not be loaded after moderation.");
    }

    const updatedReview = mapReviewDoc(updatedSnapshot);
    await recomputeRestaurantMetrics(updatedReview.restaurantId).catch((error) => {
        console.warn("[Metrics] Failed to recompute restaurant metrics after moderation", error);
    });
    return updatedReview;
};

export const saveMenuItemReviewReply = async (reviewId: string, reply: string) => {
    const reviewRef = doc(ensureDb(), FIREBASE_COLLECTIONS.reviews, reviewId);
    await updateDoc(reviewRef, {
        reply: reply.trim(),
        replyAt: reply.trim() ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
    });
};

import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";

import { auth, FIREBASE_COLLECTIONS, firestore } from "@/lib/firebase";
import type { MenuItemReview, RestaurantReviewSummary } from "@/src/domain/types";
import { getProductReviewId, isReviewableStatus } from "@/src/features/reviews/reviewUtils";
import { recomputeRestaurantMetrics } from "@/src/services/restaurantMetrics";

type SubmitMenuItemReviewInput = {
    orderId: string;
    restaurantId: string;
    itemId?: string;
    menuItemId?: string;
    itemName?: string;
    userId?: string;
    userName?: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
};

type ModerateMenuItemReviewInput = {
    reviewId: string;
    status?: MenuItemReview["status"];
    reply?: string;
};

const REVIEWS_COLLECTION = FIREBASE_COLLECTIONS.reviews;
const PERMISSION_DENIED_CODE = "permission-denied";

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
    if (!trimmed) return "";
    return trimmed.slice(0, 500);
};

const normalizeId = (value: unknown) => String(value || "").trim();
const compactObject = <T extends Record<string, unknown>>(value: T) =>
    Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as Partial<T>;

const getCurrentAuthUid = () => normalizeId(auth?.currentUser?.uid);

const getFriendlyPermissionDeniedError = () =>
    new Error(
        __DEV__
            ? "Review permission denied. Check firestore.rules deployment, order.status, order.userId, and auth.currentUser.uid."
            : "Yorum kaydedilemedi. L\u00fctfen tekrar giri\u015f yap\u0131p deneyin.",
    );

const mapReviewError = (error: unknown) => {
    const code = normalizeId((error as { code?: string } | undefined)?.code).replace(/^firebase\//, "");
    if (code === PERMISSION_DENIED_CODE) {
        return getFriendlyPermissionDeniedError();
    }
    if (error instanceof Error && error.message.includes("Missing or insufficient permissions")) {
        return getFriendlyPermissionDeniedError();
    }
    return error instanceof Error ? error : new Error("Yorum kaydedilemedi.");
};

const mapReviewDoc = (snapshot: { id: string; data: () => Record<string, unknown> }): MenuItemReview => {
    const data = snapshot.data();
    const itemId = String(data.itemId || data.menuItemId || "");
    const itemName = data.itemName ? String(data.itemName) : data.menuItemName ? String(data.menuItemName) : undefined;

    return {
        id: snapshot.id,
        reviewKey: String(data.reviewKey || data.id || snapshot.id),
        orderId: String(data.orderId || ""),
        restaurantId: String(data.restaurantId || ""),
        restaurantName: data.restaurantName ? String(data.restaurantName) : undefined,
        itemId,
        itemName,
        menuItemId: itemId,
        menuItemName: itemName,
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

const buildRestaurantReviewSummary = (reviews: MenuItemReview[]): RestaurantReviewSummary => {
    const publishedReviews = reviews.filter((review) => review.status === "published");
    const distribution: RestaurantReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const latestByMenuItem: Record<string, MenuItemReview> = {};

    for (const review of publishedReviews) {
        if (![1, 2, 3, 4, 5].includes(review.rating)) continue;
        distribution[review.rating] += 1;
        if (!latestByMenuItem[review.itemId]) {
            latestByMenuItem[review.itemId] = review;
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

const mergeReviewSnapshots = (snapshots: Array<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>) => {
    const merged = new Map<string, MenuItemReview>();

    for (const snapshot of snapshots) {
        for (const entry of snapshot.docs) {
            merged.set(entry.id, mapReviewDoc(entry));
        }
    }

    return sortReviewsByRecent(Array.from(merged.values()));
};

export const fetchMenuItemReviews = async (menuItemId: string) => {
    const normalizedItemId = normalizeId(menuItemId);
    if (!normalizedItemId) return [];

    const db = ensureDb();
    const [byItemIdSnapshot, byLegacyFieldSnapshot] = await Promise.all([
        getDocs(query(collection(db, REVIEWS_COLLECTION), where("itemId", "==", normalizedItemId))),
        getDocs(query(collection(db, REVIEWS_COLLECTION), where("menuItemId", "==", normalizedItemId))),
    ]);

    return mergeReviewSnapshots([byItemIdSnapshot, byLegacyFieldSnapshot]).filter((review) => review.status === "published");
};

export const fetchRestaurantReviews = async (restaurantId: string, options?: { includeHidden?: boolean }) => {
    const normalizedRestaurantId = normalizeId(restaurantId);
    if (!normalizedRestaurantId) return [];

    const db = ensureDb();
    const snapshot = await getDocs(
        query(collection(db, REVIEWS_COLLECTION), where("restaurantId", "==", normalizedRestaurantId)),
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
    const normalizedUserId = getCurrentAuthUid() || normalizeId(userId);
    if (!normalizedUserId) return [];

    const db = ensureDb();
    const snapshot = await getDocs(query(collection(db, REVIEWS_COLLECTION), where("userId", "==", normalizedUserId)));
    return sortReviewsByRecent(snapshot.docs.map(mapReviewDoc));
};

export const subscribeUserReviews = (userId: string, cb: (reviews: MenuItemReview[]) => void) => {
    const normalizedUserId = getCurrentAuthUid() || normalizeId(userId);
    if (!normalizedUserId) {
        cb([]);
        return () => undefined;
    }

    const db = ensureDb();
    const target = query(collection(db, REVIEWS_COLLECTION), where("userId", "==", normalizedUserId));
    return onSnapshot(
        target,
        (snapshot) => {
            cb(sortReviewsByRecent(snapshot.docs.map(mapReviewDoc)));
        },
        () => {
            cb([]);
        },
    );
};

export const submitMenuItemReview = async (input: SubmitMenuItemReviewInput) => {
    try {
        const db = ensureDb();
        const orderId = normalizeId(input.orderId);
        const restaurantId = normalizeId(input.restaurantId);
        const itemId = normalizeId(input.itemId || input.menuItemId);
        const userId = getCurrentAuthUid();
        const userName = input.userName?.trim();
        const comment = normalizeComment(input.comment);
        const rating = Number(input.rating || 0) as 1 | 2 | 3 | 4 | 5;

        if (!userId) {
            throw new Error("L\u00fctfen tekrar giri\u015f yap\u0131p yorum g\u00f6nderin.");
        }
        if (!orderId || !restaurantId || !itemId) {
            throw new Error("Missing review context.");
        }
        if (input.userId && normalizeId(input.userId) !== userId) {
            throw new Error("User mismatch for review submission.");
        }
        if (![1, 2, 3, 4, 5].includes(rating)) {
            throw new Error("Rating must be between 1 and 5.");
        }

        const reviewId = getProductReviewId(orderId, itemId, userId);
        const reviewRef = doc(db, REVIEWS_COLLECTION, reviewId);
        const orderRef = doc(db, FIREBASE_COLLECTIONS.orders, orderId);

        const [orderSnapshot, existingReviewSnapshot] = await Promise.all([getDoc(orderRef), getDoc(reviewRef)]);

        if (!orderSnapshot.exists()) {
            throw new Error("Order not found.");
        }
        if (existingReviewSnapshot.exists()) {
            throw new Error("Bu \u00fcr\u00fcn zaten de\u011ferlendirildi.");
        }

        const orderData = orderSnapshot.data() || {};
        if (normalizeId(orderData.userId) !== userId) {
            throw new Error("You can only review your own orders.");
        }

        const orderStatus = String(orderData.status || "");
        if (!isReviewableStatus(orderStatus)) {
            throw new Error("Reviews are only available after delivery.");
        }

        const orderItems = resolveOrderItems(orderData);
        const matchedItem = orderItems.find((item: any) => {
            const candidates = [item?.menuItemId, item?.itemId, item?.id];
            return candidates.some((candidate) => normalizeId(candidate) === itemId);
        });

        if (!matchedItem) {
            throw new Error("This item was not found in the delivered order.");
        }

        const resolvedItemName = normalizeId(input.itemName || matchedItem?.name);
        if (!resolvedItemName) {
            throw new Error("Item name is required.");
        }

        const orderRestaurantName =
            String(orderData?.restaurant?.name || orderData?.restaurantName || orderData?.restaurant || "").trim() || undefined;
        const payload = compactObject({
            id: reviewId,
            reviewKey: reviewId,
            userId,
            userName: userName || "Hungrie User",
            restaurantId,
            restaurantName: orderRestaurantName || undefined,
            orderId,
            itemId,
            itemName: resolvedItemName,
            menuItemId: itemId,
            menuItemName: resolvedItemName,
            rating,
            comment,
            status: "published",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        await setDoc(reviewRef, payload);

        const savedSnapshot = await getDoc(reviewRef);
        if (!savedSnapshot.exists()) {
            throw new Error("Review could not be loaded after save.");
        }

        const savedReview = mapReviewDoc(savedSnapshot);
        await recomputeRestaurantMetrics(savedReview.restaurantId).catch((error) => {
            console.warn("[Metrics] Failed to recompute restaurant metrics after review save", error);
        });
        return savedReview;
    } catch (error) {
        throw mapReviewError(error);
    }
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

export const moderateMenuItemReview = async ({ reviewId, status, reply }: ModerateMenuItemReviewInput) => {
    const db = ensureDb();
    const reviewRef = doc(db, REVIEWS_COLLECTION, reviewId);

    await runTransaction(db, async (transaction) => {
        const reviewSnapshot = await transaction.get(reviewRef);
        if (!reviewSnapshot.exists()) {
            throw new Error("Review not found.");
        }

        const reviewData = reviewSnapshot.data() as Record<string, any>;
        const currentStatus = (reviewData.status === "hidden" ? "hidden" : "published") as MenuItemReview["status"];
        const nextStatus = status || currentStatus;
        const menuItemId = String(reviewData.itemId || reviewData.menuItemId || "");
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
    const reviewRef = doc(ensureDb(), REVIEWS_COLLECTION, reviewId);
    await updateDoc(reviewRef, {
        reply: reply.trim(),
        replyAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    const updatedSnapshot = await getDoc(reviewRef);
    if (!updatedSnapshot.exists()) {
        throw new Error("Review not found.");
    }
    return mapReviewDoc(updatedSnapshot);
};

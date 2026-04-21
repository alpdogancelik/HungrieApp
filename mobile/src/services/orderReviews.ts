import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";

import { auth, FIREBASE_COLLECTIONS, firestore } from "@/lib/firebase";
import type {
    OrderReview,
    OrderReviewItemSnapshot,
    OrderReviewRatingBreakdown,
    RestaurantOrderReviewSummary,
} from "@/src/domain/types";

type SubmitOrderReviewInput = {
    orderId: string;
    userName?: string;
    ratings: OrderReviewRatingBreakdown;
    comment?: string;
};

const ORDER_REVIEWS_COLLECTION = FIREBASE_COLLECTIONS.orderReviews || "orderReviews";

const ensureDb = () => {
    if (!firestore) {
        throw new Error("Firebase is not configured.");
    }
    return firestore;
};

const normalizeId = (value: unknown) => String(value || "").trim();

const normalizeComment = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 500);
};

const normalizeName = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 80);
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

const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const roundToSingle = (value: number) => Number(value.toFixed(1));

const isQueryIndexError = (error: unknown) => {
    const code = String((error as { code?: string })?.code || "").toLowerCase();
    const message = String((error as { message?: string })?.message || "").toLowerCase();
    return code.includes("failed-precondition") || message.includes("requires an index");
};

const clampRating = (value: unknown): 1 | 2 | 3 | 4 | 5 => {
    const parsed = Math.round(Number(value || 0));
    if (![1, 2, 3, 4, 5].includes(parsed)) {
        throw new Error("Puanlar 1 ile 5 arasinda olmalidir.");
    }
    return parsed as 1 | 2 | 3 | 4 | 5;
};

const parseStoredRating = (value: unknown): 1 | 2 | 3 | 4 | 5 => {
    const parsed = Math.round(Number(value || 0));
    if (![1, 2, 3, 4, 5].includes(parsed)) return 1;
    return parsed as 1 | 2 | 3 | 4 | 5;
};

const resolveLegacyRating = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    const rounded = Math.round(parsed);
    if (![1, 2, 3, 4, 5].includes(rounded)) return undefined;
    return rounded as 1 | 2 | 3 | 4 | 5;
};

const getCurrentAuthUid = () => normalizeId(auth?.currentUser?.uid);

const normalizeStatusToken = (value: unknown) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

const isOrderReviewableStatus = (status: unknown) => {
    const token = normalizeStatusToken(status);
    if (!token) return false;
    const compact = token.replace(/\s+/g, "");
    return (
        token === "delivered" ||
        token === "completed" ||
        token === "teslim edildi" ||
        token === "teslimedildi" ||
        token === "tamamlandi" ||
        token === "tamamlandı" ||
        compact === "teslimedildi" ||
        compact === "tamamlandi"
    );
};

const resolveOrderItemsSnapshot = (orderData: Record<string, any>): OrderReviewItemSnapshot[] => {
    const rawItems = Array.isArray(orderData.items) ? orderData.items : Array.isArray(orderData.orderItems) ? orderData.orderItems : [];
    return rawItems
        .map((item: Record<string, any>) => {
            const quantity = Math.max(1, Number(item?.quantity || 1));
            const name = String(item?.name || "").trim();
            if (!name) return null;
            const menuItemId = normalizeId(item?.menuItemId || item?.itemId || item?.id) || undefined;
            const price = toNumber(item?.price);
            const imageUrl = normalizeId(item?.imageUrl || item?.image_url) || undefined;
            return {
                menuItemId,
                name,
                quantity,
                price,
                imageUrl,
            } as OrderReviewItemSnapshot;
        })
        .filter(Boolean) as OrderReviewItemSnapshot[];
};

const mapOrderReviewDoc = (snapshot: { id: string; data: () => Record<string, unknown> }): OrderReview => {
    const data = snapshot.data();
    const ratingsRaw = (data.ratings || {}) as Record<string, unknown>;
    const legacyOverall = resolveLegacyRating(data.rating);
    const speed = parseStoredRating(ratingsRaw.speed ?? ratingsRaw.deliverySpeed ?? legacyOverall);
    const taste = parseStoredRating(ratingsRaw.taste ?? legacyOverall);
    const value = parseStoredRating(ratingsRaw.value ?? ratingsRaw.pricePerformance ?? legacyOverall);
    const averageRating = Number(
        data.averageRating ??
            data.overall ??
            data.rating ??
            Number(((speed + taste + value) / 3).toFixed(2)),
    );

    return {
        id: snapshot.id,
        orderId: String(data.orderId || ""),
        userId: String(data.userId || ""),
        userName: data.userName ? String(data.userName) : undefined,
        restaurantId: String(data.restaurantId || ""),
        restaurantName: data.restaurantName ? String(data.restaurantName) : undefined,
        ratings: {
            speed,
            taste,
            value,
            pricePerformance: value,
        },
        averageRating: Number.isFinite(averageRating) ? averageRating : 0,
        comment: data.comment ? String(data.comment) : undefined,
        itemsSnapshot: Array.isArray(data.itemsSnapshot)
            ? data.itemsSnapshot
                  .map((item) => {
                      const snapshotItem = item as Record<string, unknown>;
                      const name = String(snapshotItem.name || "").trim();
                      if (!name) return null;
                      return {
                          menuItemId: normalizeId(snapshotItem.menuItemId) || undefined,
                          name,
                          quantity: Math.max(1, Number(snapshotItem.quantity || 1)),
                          price: toNumber(snapshotItem.price),
                          imageUrl: normalizeId(snapshotItem.imageUrl) || undefined,
                      } as OrderReviewItemSnapshot;
                  })
                  .filter(Boolean) as OrderReviewItemSnapshot[]
            : [],
        status: data.status === "hidden" ? "hidden" : "published",
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
    };
};

const sortOrderReviewsByRecent = (reviews: OrderReview[]) =>
    [...reviews].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime());

const normalizeLimit = (value?: number) => {
    if (!Number.isFinite(value)) return 30;
    const normalized = Math.floor(Number(value));
    if (normalized <= 0) return 30;
    return Math.min(normalized, 100);
};

export const submitOrderReview = async (input: SubmitOrderReviewInput) => {
    const db = ensureDb();
    const orderId = normalizeId(input.orderId);
    const userId = getCurrentAuthUid();
    if (!userId) {
        throw new Error("Lutfen tekrar giris yapip siparis degerlendirmesi yapin.");
    }
    if (!orderId) {
        throw new Error("Siparis bulunamadi.");
    }

    const ratings: OrderReviewRatingBreakdown = {
        speed: clampRating(input.ratings?.speed),
        taste: clampRating(input.ratings?.taste),
        value: clampRating(input.ratings?.value ?? input.ratings?.pricePerformance),
    };

    const reviewId = `${orderId}__${userId}`;
    const reviewRef = doc(db, ORDER_REVIEWS_COLLECTION, reviewId);
    const orderRef = doc(db, FIREBASE_COLLECTIONS.orders, orderId);
    const [orderSnapshot, existingReviewSnapshot] = await Promise.all([getDoc(orderRef), getDoc(reviewRef)]);

    if (!orderSnapshot.exists()) {
        throw new Error("Siparis bulunamadi.");
    }
    if (existingReviewSnapshot.exists()) {
        throw new Error("Bu siparis zaten degerlendirildi.");
    }

    const orderData = orderSnapshot.data() || {};
    if (normalizeId(orderData.userId) !== userId) {
        throw new Error("Sadece kendi siparisinizi degerlendirebilirsiniz.");
    }
    if (!isOrderReviewableStatus(orderData.status)) {
        throw new Error("Sadece teslim edilen siparisler degerlendirilebilir.");
    }

    const restaurantId = normalizeId(orderData.restaurantId);
    if (!restaurantId) {
        throw new Error("Restoran bilgisi eksik.");
    }

    const restaurantName =
        String(orderData?.restaurant?.name || orderData?.restaurantName || orderData?.restaurant || "").trim() || undefined;
    const itemsSnapshot = resolveOrderItemsSnapshot(orderData);
    const averageRating = Number(((ratings.speed + ratings.taste + ratings.value) / 3).toFixed(2));
    const comment = normalizeComment(input.comment);
    const userName = normalizeName(input.userName);

    await setDoc(reviewRef, {
        id: reviewId,
        orderId,
        userId,
        userName: userName || "Hungrie User",
        restaurantId,
        restaurantName,
        ratings: {
            speed: ratings.speed,
            taste: ratings.taste,
            value: ratings.value,
            pricePerformance: ratings.value,
        },
        averageRating,
        comment: comment || "",
        itemsSnapshot,
        status: "published",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    const savedSnapshot = await getDoc(reviewRef);
    if (!savedSnapshot.exists()) {
        throw new Error("Degerlendirme kaydi olusturulamadi.");
    }
    return mapOrderReviewDoc(savedSnapshot);
};

export const fetchOrderReviewByOrder = async (orderId: string, userId: string) => {
    const normalizedOrderId = normalizeId(orderId);
    const normalizedUserId = normalizeId(userId) || getCurrentAuthUid();
    if (!normalizedOrderId || !normalizedUserId) return null;

    const snapshot = await getDoc(doc(ensureDb(), ORDER_REVIEWS_COLLECTION, `${normalizedOrderId}__${normalizedUserId}`));
    if (!snapshot.exists()) return null;
    return mapOrderReviewDoc(snapshot);
};

export const fetchUserOrderReviews = async (userId: string, options?: { limit?: number }) => {
    const normalizedUserId = normalizeId(userId) || getCurrentAuthUid();
    if (!normalizedUserId) return [];

    try {
        const snapshot = await getDocs(
            query(
                collection(ensureDb(), ORDER_REVIEWS_COLLECTION),
                where("userId", "==", normalizedUserId),
                orderBy("createdAt", "desc"),
                limit(normalizeLimit(options?.limit)),
            ),
        );
        return sortOrderReviewsByRecent(snapshot.docs.map(mapOrderReviewDoc));
    } catch (error) {
        if (!isQueryIndexError(error)) throw error;
        const fallbackSnapshot = await getDocs(
            query(
                collection(ensureDb(), ORDER_REVIEWS_COLLECTION),
                where("userId", "==", normalizedUserId),
                limit(normalizeLimit(options?.limit)),
            ),
        );
        return sortOrderReviewsByRecent(fallbackSnapshot.docs.map(mapOrderReviewDoc));
    }
};

export const fetchRestaurantOrderReviews = async (
    restaurantId: string,
    options?: { includeHidden?: boolean; limit?: number },
) => {
    const normalizedRestaurantId = normalizeId(restaurantId);
    if (!normalizedRestaurantId) return [];

    const target = options?.includeHidden
        ? query(
              collection(ensureDb(), ORDER_REVIEWS_COLLECTION),
              where("restaurantId", "==", normalizedRestaurantId),
              orderBy("createdAt", "desc"),
              limit(normalizeLimit(options?.limit)),
          )
        : query(
              collection(ensureDb(), ORDER_REVIEWS_COLLECTION),
              where("restaurantId", "==", normalizedRestaurantId),
              where("status", "==", "published"),
              orderBy("createdAt", "desc"),
              limit(normalizeLimit(options?.limit)),
          );

    try {
        const snapshot = await getDocs(target);
        return sortOrderReviewsByRecent(snapshot.docs.map(mapOrderReviewDoc));
    } catch (error) {
        if (!isQueryIndexError(error)) throw error;
        const fallbackSnapshot = await getDocs(
            query(
                collection(ensureDb(), ORDER_REVIEWS_COLLECTION),
                where("restaurantId", "==", normalizedRestaurantId),
                limit(normalizeLimit(options?.limit)),
            ),
        );
        const mapped = sortOrderReviewsByRecent(fallbackSnapshot.docs.map(mapOrderReviewDoc));
        return options?.includeHidden ? mapped : mapped.filter((review) => review.status === "published");
    }
};

export const calculateRestaurantOrderReviewSummary = (
    reviews: Array<Partial<OrderReview> | Record<string, unknown>>,
): RestaurantOrderReviewSummary => {
    if (!Array.isArray(reviews) || !reviews.length) {
        return {
            averageRating: 0,
            count: 0,
            speedAverage: 0,
            tasteAverage: 0,
            valueAverage: 0,
            pricePerformanceAverage: 0,
            latestComments: [],
        };
    }

    const normalized = reviews
        .map((entry) => {
            const review = entry as Record<string, unknown>;
            const ratings = (review.ratings || {}) as Record<string, unknown>;
            const legacyOverall = resolveLegacyRating(review.rating);
            const speed = Number(ratings.speed ?? ratings.deliverySpeed ?? legacyOverall ?? 0);
            const taste = Number(ratings.taste ?? legacyOverall ?? 0);
            const value = Number(ratings.value ?? ratings.pricePerformance ?? legacyOverall ?? 0);
            const averageRating = Number(review.averageRating ?? review.overall ?? review.rating ?? 0);

            return {
                averageRating: Number.isFinite(averageRating) && averageRating > 0 ? averageRating : 0,
                speed: Number.isFinite(speed) && speed > 0 ? speed : 0,
                taste: Number.isFinite(taste) && taste > 0 ? taste : 0,
                value: Number.isFinite(value) && value > 0 ? value : 0,
            };
        })
        .filter((entry) => entry.averageRating > 0 || entry.speed > 0 || entry.taste > 0 || entry.value > 0);

    if (!normalized.length) {
        return {
            averageRating: 0,
            count: 0,
            speedAverage: 0,
            tasteAverage: 0,
            valueAverage: 0,
            pricePerformanceAverage: 0,
            latestComments: [],
        };
    }

    const totals = normalized.reduce(
        (acc, review) => {
            acc.average += review.averageRating;
            acc.speed += review.speed || review.averageRating;
            acc.taste += review.taste || review.averageRating;
            acc.value += review.value || review.averageRating;
            return acc;
        },
        { average: 0, speed: 0, taste: 0, value: 0 },
    );

    const latestComments = reviews
        .filter((entry) => Boolean(String((entry as Record<string, unknown>)?.comment || "").trim()))
        .slice(0, 6) as OrderReview[];

    const count = normalized.length;
    const speedAverage = roundToSingle(totals.speed / count);
    const tasteAverage = roundToSingle(totals.taste / count);
    const valueAverage = roundToSingle(totals.value / count);

    return {
        averageRating: roundToSingle(totals.average / count),
        count,
        speedAverage,
        tasteAverage,
        valueAverage,
        pricePerformanceAverage: valueAverage,
        latestComments,
    };
};

export const fetchRestaurantOrderReviewSummary = async (restaurantId: string): Promise<RestaurantOrderReviewSummary> => {
    const reviews = await fetchRestaurantOrderReviews(restaurantId, { includeHidden: false, limit: 100 });
    return calculateRestaurantOrderReviewSummary(reviews);
};

export const moderateOrderReview = async (reviewId: string, status: OrderReview["status"]) => {
    const normalizedReviewId = normalizeId(reviewId);
    if (!normalizedReviewId) {
        throw new Error("Degerlendirme bulunamadi.");
    }
    if (!["published", "hidden"].includes(status)) {
        throw new Error("Gecersiz yorum durumu.");
    }
    const reviewRef = doc(ensureDb(), ORDER_REVIEWS_COLLECTION, normalizedReviewId);
    await updateDoc(reviewRef, {
        status,
        updatedAt: serverTimestamp(),
    });
};

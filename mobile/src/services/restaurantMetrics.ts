import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";

import { FIREBASE_COLLECTIONS, firestore } from "@/lib/firebase";

const ETA_SAMPLE_SIZE = 30;

const ensureDb = () => {
    if (!firestore) {
        throw new Error("Firebase is not configured.");
    }
    return firestore;
};

const toMillis = (value: unknown): number => {
    if (!value) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
        return (value as { toDate: () => Date }).toDate().getTime();
    }
    if (typeof value === "object" && value && "seconds" in value) {
        return Number((value as { seconds?: number }).seconds || 0) * 1000;
    }
    return 0;
};

const roundToFive = (value: number, mode: "floor" | "ceil" | "round" = "round") => {
    const normalized = value / 5;
    if (mode === "floor") return Math.floor(normalized) * 5;
    if (mode === "ceil") return Math.ceil(normalized) * 5;
    return Math.round(normalized) * 5;
};

const resolveDurationMinutes = (order: Record<string, any>) => {
    const deliveredAtMs = Number(order.deliveredAtMs || 0) || toMillis(order.deliveredAt);
    const acceptedAtMs = Number(order.acceptedAtMs || 0) || toMillis(order.acceptedAt);
    const createdAtMs = Number(order.createdAtMs || 0) || toMillis(order.createdAt);
    const startAtMs = acceptedAtMs || createdAtMs;

    if (!startAtMs || !deliveredAtMs || deliveredAtMs <= startAtMs) {
        return null;
    }

    const durationMinutes = (deliveredAtMs - startAtMs) / 60000;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
        return null;
    }

    return durationMinutes;
};

const buildEtaAggregate = (durations: number[]) => {
    if (!durations.length) return null;

    const average = durations.reduce((sum, current) => sum + current, 0) / durations.length;
    const safeAverage = Math.max(10, Math.min(120, average));
    const spread = Math.max(5, roundToFive(safeAverage * 0.18, "round"));
    const min = Math.max(10, roundToFive(safeAverage - spread, "floor"));
    const max = Math.max(min + 5, roundToFive(safeAverage + spread, "ceil"));

    return {
        deliveryEtaAverage: Number(safeAverage.toFixed(1)),
        deliveryEtaMin: min,
        deliveryEtaMax: max,
        deliveryTime: `${min}-${max}`,
        etaMinutes: roundToFive(safeAverage, "round"),
    };
};

const buildReviewSummary = async (restaurantId: string) => {
    const db = ensureDb();
    const reviewSnapshot = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.reviews), where("restaurantId", "==", restaurantId)),
    );

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingCount = 0;
    let ratingTotal = 0;

    for (const entry of reviewSnapshot.docs) {
        const data = entry.data() || {};
        const status = data.status === "hidden" ? "hidden" : "published";
        if (status !== "published") continue;
        const rating = Number(data.rating || 0) as 1 | 2 | 3 | 4 | 5;
        if (![1, 2, 3, 4, 5].includes(rating)) continue;
        distribution[rating] += 1;
        ratingCount += 1;
        ratingTotal += rating;
    }

    return {
        average: ratingCount ? Number((ratingTotal / ratingCount).toFixed(1)) : 0,
        count: ratingCount,
        distribution,
    };
};

export const recomputeRestaurantMetrics = async (restaurantId: string) => {
    const normalizedRestaurantId = String(restaurantId || "").trim();
    if (!normalizedRestaurantId) {
        throw new Error("restaurantId is required.");
    }

    const db = ensureDb();
    const restaurantRef = doc(db, FIREBASE_COLLECTIONS.restaurants, normalizedRestaurantId);
    const ordersSnapshot = await getDocs(
        query(collection(db, FIREBASE_COLLECTIONS.orders), where("restaurantId", "==", normalizedRestaurantId)),
    );
    const reviewSummary = await buildReviewSummary(normalizedRestaurantId);

    const deliveredOrders = ordersSnapshot.docs
        .map((entry) => entry.data() || {})
        .filter((order) => String(order.status || "").toLowerCase() === "delivered")
        .sort((left, right) => {
            const leftTime = Number(left.deliveredAtMs || 0) || toMillis(left.deliveredAt) || Number(left.createdAtMs || 0) || toMillis(left.createdAt);
            const rightTime = Number(right.deliveredAtMs || 0) || toMillis(right.deliveredAt) || Number(right.createdAtMs || 0) || toMillis(right.createdAt);
            return rightTime - leftTime;
        })
        .slice(0, ETA_SAMPLE_SIZE);

    const durations = deliveredOrders.map(resolveDurationMinutes).filter((value): value is number => value !== null);
    const etaAggregate = buildEtaAggregate(durations);
    const payload: Record<string, unknown> = {
        ratingAverage: reviewSummary.average,
        ratingCount: reviewSummary.count,
        reviewDistribution: reviewSummary.distribution,
        metricsUpdatedAt: serverTimestamp(),
        metricsUpdatedAtMs: Date.now(),
    };

    if (etaAggregate) {
        Object.assign(payload, etaAggregate);
    }

    const restaurantSnapshot = await getDoc(restaurantRef);
    if (!restaurantSnapshot.exists()) {
        throw new Error("Restaurant not found.");
    }

    await updateDoc(restaurantRef, payload);
    return {
        restaurantId: normalizedRestaurantId,
        ratingAverage: reviewSummary.average,
        ratingCount: reviewSummary.count,
        eta: etaAggregate,
    };
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import { nanoid } from "nanoid/non-secure";
import type { Review } from "@/src/domain/types";

const REVIEWS_KEY = "@hungrie/reviews";
const REVIEW_QUEUE_KEY = "@hungrie/review-queue";

type PendingReview = Omit<Review, "id" | "createdAt"> & { tempId: string };

const readJson = async <T>(key: string): Promise<T | null> => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

const writeJson = async (key: string, value: unknown) => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
};

const readAllReviews = async (): Promise<Review[]> => {
    return (await readJson<Review[]>(REVIEWS_KEY)) ?? [];
};

const saveAllReviews = async (reviews: Review[]) => {
    await writeJson(REVIEWS_KEY, reviews);
};

const readQueue = async (): Promise<PendingReview[]> => {
    return (await readJson<PendingReview[]>(REVIEW_QUEUE_KEY)) ?? [];
};

const saveQueue = async (entries: PendingReview[]) => {
    await writeJson(REVIEW_QUEUE_KEY, entries);
};

export async function fetchReviews(productId: string): Promise<Review[]> {
    if (!productId) return [];
    const reviews = await readAllReviews();
    return reviews.filter((review) => review.productId === productId).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function createReview(input: Omit<Review, "id" | "createdAt">): Promise<Review> {
    const reviews = await readAllReviews();
    const existingIndex = reviews.findIndex(
        (review) => review.productId === input.productId && review.userId === input.userId,
    );
    const now = new Date().toISOString();
    const nextReview: Review =
        existingIndex >= 0
            ? {
                  ...reviews[existingIndex],
                  ...input,
                  createdAt: now,
              }
            : {
                  id: nanoid(),
                  createdAt: now,
                  ...input,
              };
    if (existingIndex >= 0) {
        reviews[existingIndex] = nextReview;
    } else {
        reviews.push(nextReview);
    }
    await saveAllReviews(reviews);
    return nextReview;
}

export const enqueueReview = async (input: Omit<Review, "id" | "createdAt">) => {
    const queue = await readQueue();
    queue.push({ ...input, tempId: nanoid() });
    await saveQueue(queue);
};

export const flushReviewQueue = async () => {
    const queue = await readQueue();
    if (!queue.length) return { flushed: 0, remaining: 0 };
    const remaining: PendingReview[] = [];
    let flushed = 0;
    for (const entry of queue) {
        try {
            await createReview(entry);
            flushed += 1;
        } catch {
            remaining.push(entry);
        }
    }
    await saveQueue(remaining);
    return { flushed, remaining: remaining.length };
};

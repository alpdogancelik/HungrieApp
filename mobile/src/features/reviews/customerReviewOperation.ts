import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { CustomerReviewDraft, CustomerOrderReviewState } from "@hungrie/domain";
import { storage } from "@/src/lib/storage";
import { createUuid } from "@/src/lib/uuid";
import { submitCustomerOrderReviewV2 } from "@/src/data/reviewV2Repository";

export type PendingCustomerReviewOperation = {
    orderId: string;
    restaurantId: string;
    operationId: string;
    canonicalDraftHash: string;
    createdAt: string;
};

type OperationStorage = Pick<typeof storage, "getItem" | "setItem" | "removeItem">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionLocks = new Map<string, Promise<Awaited<ReturnType<typeof submitCustomerOrderReviewV2>>>>();

export const canonicalizeCustomerReviewDraft = (draft: CustomerReviewDraft) => ({
    orderId: draft.orderId,
    tasteRating: draft.tasteRating,
    speedRating: draft.speedRating,
    comment: String(draft.comment || "").replace(/^ +| +$/g, "").normalize("NFC"),
    mealReactions: draft.mealReactions
        .map(({ menuItemId, reaction }) => ({ menuItemId: String(menuItemId).trim(), reaction }))
        .sort((left, right) => left.menuItemId < right.menuItemId ? -1 : left.menuItemId > right.menuItemId ? 1 : 0),
});

export const hashCustomerReviewDraft = async (draft: CustomerReviewDraft) =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(canonicalizeCustomerReviewDraft(draft)));

const pendingKey = async (profileId: string) =>
    `customer_review_operations_v2_${await digestStringAsync(CryptoDigestAlgorithm.SHA256, profileId)}`;

const parsePending = (raw: string | null): PendingCustomerReviewOperation[] => {
    try {
        const value = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(value)) return [];
        return value.filter((entry) => entry && typeof entry.orderId === "string" && typeof entry.restaurantId === "string" &&
            UUID.test(entry.operationId) && /^[0-9a-f]{64}$/i.test(entry.canonicalDraftHash) && typeof entry.createdAt === "string")
            .map(({ orderId, restaurantId, operationId, canonicalDraftHash, createdAt }) => ({ orderId, restaurantId, operationId, canonicalDraftHash, createdAt }));
    } catch { return []; }
};

export const listPendingCustomerReviewOperations = async (profileId: string, target: OperationStorage = storage) =>
    parsePending(await target.getItem(await pendingKey(profileId)));

const savePending = async (profileId: string, entries: PendingCustomerReviewOperation[], target: OperationStorage) => {
    const key = await pendingKey(profileId);
    if (!entries.length) await target.removeItem(key);
    else await target.setItem(key, JSON.stringify(entries));
};

export const resolveCustomerReviewOperation = async (
    profileId: string,
    draft: CustomerReviewDraft,
    target: OperationStorage = storage,
): Promise<PendingCustomerReviewOperation> => {
    const entries = await listPendingCustomerReviewOperations(profileId, target);
    const canonicalDraftHash = await hashCustomerReviewDraft(draft);
    const current = entries.find((entry) => entry.orderId === draft.orderId);
    if (current?.canonicalDraftHash === canonicalDraftHash) return current;
    const next = { orderId: draft.orderId, restaurantId: draft.restaurantId, operationId: createUuid(), canonicalDraftHash, createdAt: new Date().toISOString() };
    await savePending(profileId, [...entries.filter((entry) => entry.orderId !== draft.orderId), next], target);
    return next;
};

export const clearCustomerReviewOperation = async (
    profileId: string,
    orderId: string,
    operationId?: string,
    target: OperationStorage = storage,
) => {
    const entries = await listPendingCustomerReviewOperations(profileId, target);
    const current = entries.find((entry) => entry.orderId === orderId);
    if (!current || operationId && current.operationId !== operationId) return false;
    await savePending(profileId, entries.filter((entry) => entry.orderId !== orderId), target);
    return true;
};

export const reconcilePendingCustomerReviewOperations = async (
    profileId: string,
    getState: (orderId: string) => Promise<CustomerOrderReviewState>,
    target: OperationStorage = storage,
    now = Date.now(),
) => {
    const entries = await listPendingCustomerReviewOperations(profileId, target);
    const retained: PendingCustomerReviewOperation[] = [];
    const states: CustomerOrderReviewState[] = [];
    for (const entry of entries) {
        try {
            const state = await getState(entry.orderId);
            states.push(state);
            const expired = !!state.expiresAt && Date.parse(state.expiresAt) <= now;
            if (!state.reviewed && !expired) retained.push(entry);
        } catch {
            retained.push(entry);
        }
    }
    await savePending(profileId, retained, target);
    return { states, pending: retained };
};

export const submitCustomerReviewWithDurableOperation = async (
    profileId: string,
    draft: CustomerReviewDraft,
    target: OperationStorage = storage,
    submit: typeof submitCustomerOrderReviewV2 = submitCustomerOrderReviewV2,
) => {
    const lockKey = `${profileId}:${draft.orderId}`;
    const existing = submissionLocks.get(lockKey);
    if (existing) return existing;
    const request = (async () => {
        const pending = await resolveCustomerReviewOperation(profileId, draft, target);
        const result = await submit({ ...draft, operationId: pending.operationId });
        await clearCustomerReviewOperation(profileId, draft.orderId, pending.operationId, target);
        return result;
    })().finally(() => submissionLocks.delete(lockKey));
    submissionLocks.set(lockKey, request);
    return request;
};

export const reconcileCustomerReviewOperation = async (
    profileId: string,
    orderId: string,
    getState: (orderId: string) => Promise<CustomerOrderReviewState>,
    target: OperationStorage = storage,
    now = Date.now(),
) => {
    const state = await getState(orderId);
    const expired = !!state.expiresAt && Date.parse(state.expiresAt) <= now;
    if (state.reviewed || expired) await clearCustomerReviewOperation(profileId, orderId, undefined, target);
    return state;
};

export const recoverCustomerReviewsIfAuthorized = async (
    activeCustomer: boolean,
    profileId: string | null,
    getState: (orderId: string) => Promise<CustomerOrderReviewState>,
    target: OperationStorage = storage,
) => {
    if (!activeCustomer || !profileId) return { states: [], pending: [] };
    return reconcilePendingCustomerReviewOperations(profileId, getState, target);
};

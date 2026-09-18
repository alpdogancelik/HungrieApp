import { useSyncExternalStore } from "react";
import type { CustomerOrderReviewState } from "@hungrie/domain";
import { getCustomerOrderReviewStateV2 } from "@/src/data/reviewV2Repository";
import { reconcileCustomerReviewOperation } from "./customerReviewOperation";

export type ReviewAvailability =
    | { status: "checking" }
    | { status: "eligible"; state: CustomerOrderReviewState }
    | { status: "reviewed"; state: CustomerOrderReviewState }
    | { status: "expired"; state: CustomerOrderReviewState }
    | { status: "unavailable"; error?: unknown };

const listeners = new Set<() => void>();
const entries = new Map<string, ReviewAvailability>();
const running = new Map<string, Promise<ReviewAvailability>>();
const CHECKING: ReviewAvailability = { status: "checking" };
let activeProfileId = "";
const keyFor = (profileId: string, orderId: string) => `${profileId}:${orderId}`;
const emit = () => listeners.forEach((listener) => listener());

export const setCustomerReviewAvailabilityProfile = (profileId: string) => {
    if (activeProfileId === profileId) return;
    activeProfileId = profileId;
    entries.clear();
    running.clear();
    emit();
};

export const markCustomerReviewStatesChecking = (profileId: string) => {
    if (profileId !== activeProfileId) return;
    for (const key of entries.keys()) if (key.startsWith(`${profileId}:`)) entries.set(key, { status: "checking" });
    emit();
};

export const publishCustomerReviewState = (profileId: string, state: CustomerOrderReviewState): ReviewAvailability => {
    const value: ReviewAvailability = state.reviewed ? { status: "reviewed", state }
        : state.eligible ? { status: "eligible", state }
        : state.expiresAt ? { status: "expired", state }
        : { status: "unavailable" };
    entries.set(keyFor(profileId, state.orderId), value);
    emit();
    return value;
};

export const refreshCustomerReviewState = async (profileId: string, orderId: string, force = false) => {
    if (!profileId || !orderId || profileId !== activeProfileId) return { status: "unavailable" } as ReviewAvailability;
    const key = keyFor(profileId, orderId);
    if (running.has(key)) return running.get(key)!;
    entries.set(key, CHECKING);
    emit();
    const request = reconcileCustomerReviewOperation(profileId, orderId, getCustomerOrderReviewStateV2)
        .then((state) => publishCustomerReviewState(profileId, state))
        .catch((error) => {
            const value = { status: "unavailable", error } as ReviewAvailability;
            entries.set(key, value);
            emit();
            return value;
        })
        .finally(() => running.delete(key));
    running.set(key, request);
    return request;
};

export const refreshCustomerReviewStates = (profileId: string, orderIds: string[], force = false) =>
    Promise.all([...new Set(orderIds.filter(Boolean))].map((orderId) => refreshCustomerReviewState(profileId, orderId, force)));

export const markCustomerReviewAsReviewed = (profileId: string, orderId: string) => {
    const current = entries.get(keyFor(profileId, orderId));
    const state = current && "state" in current ? current.state : null;
    publishCustomerReviewState(profileId, {
        orderId, reviewed: true, eligible: false, expiresAt: state?.expiresAt || null,
        review: state?.review || null,
    });
};

export const getCustomerReviewAvailability = (profileId: string, orderId: string): ReviewAvailability =>
    entries.get(keyFor(profileId, orderId)) || CHECKING;

export const subscribeCustomerReviewAvailability = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

export const useCustomerReviewAvailability = (profileId: string, orderId: string) =>
    useSyncExternalStore(subscribeCustomerReviewAvailability, () => getCustomerReviewAvailability(profileId, orderId), () => CHECKING);

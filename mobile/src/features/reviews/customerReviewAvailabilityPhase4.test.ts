import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCustomerReviewAvailability, markCustomerReviewAsReviewed, markCustomerReviewStatesChecking, refreshCustomerReviewState, setCustomerReviewAvailabilityProfile } from "./customerReviewAvailability";

const mockGetState = jest.fn();
jest.mock("@/src/data/reviewV2Repository", () => ({ getCustomerOrderReviewStateV2: (...args: any[]) => mockGetState(...args) }));
jest.mock("./customerReviewOperation", () => ({ reconcileCustomerReviewOperation: (_profileId: string, orderId: string, getState: (id: string) => Promise<any>) => getState(orderId) }));

const state = (orderId: string, values: Record<string, unknown> = {}) => ({ orderId, reviewed: false, eligible: true, expiresAt: "2026-10-01T00:00:00Z", review: null, ...values });

beforeEach(() => { mockGetState.mockReset(); setCustomerReviewAvailabilityProfile(`profile-${Math.random()}`); });

test("deduplicates concurrent per-order state checks and publishes server eligibility", async () => {
    setCustomerReviewAvailabilityProfile("profile-a");
    let release!: (value: any) => void; mockGetState.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const first = refreshCustomerReviewState("profile-a", "order-1", true);
    const second = refreshCustomerReviewState("profile-a", "order-1", true);
    expect(mockGetState).toHaveBeenCalledTimes(1);
    release(state("order-1")); await Promise.all([first, second]);
    expect(getCustomerReviewAvailability("profile-a", "order-1").status).toBe("eligible");
});

test("foreground invalidation hides stale actions until authoritative recovery", async () => {
    setCustomerReviewAvailabilityProfile("profile-a"); mockGetState.mockResolvedValue(state("order-1"));
    await refreshCustomerReviewState("profile-a", "order-1"); expect(getCustomerReviewAvailability("profile-a", "order-1").status).toBe("eligible");
    markCustomerReviewStatesChecking("profile-a"); expect(getCustomerReviewAvailability("profile-a", "order-1").status).toBe("checking");
});

test("a stalled review-state request settles into a retryable state", async () => {
    jest.useFakeTimers();
    try {
        setCustomerReviewAvailabilityProfile("profile-a");
        mockGetState.mockReturnValue(new Promise(() => undefined));
        const request = refreshCustomerReviewState("profile-a", "order-1", true);
        await jest.advanceTimersByTimeAsync(12_000);
        expect((await request).status).toBe("unavailable");
        expect(getCustomerReviewAvailability("profile-a", "order-1").status).toBe("unavailable");
    } finally {
        jest.useRealTimers();
    }
});

test("reviewed, expired, unavailable, and account-scoped states fail closed", async () => {
    setCustomerReviewAvailabilityProfile("profile-a");
    mockGetState.mockResolvedValueOnce(state("reviewed", { reviewed: true, eligible: false })).mockResolvedValueOnce(state("expired", { eligible: false }));
    expect((await refreshCustomerReviewState("profile-a", "reviewed")).status).toBe("reviewed");
    expect((await refreshCustomerReviewState("profile-a", "expired")).status).toBe("expired");
    setCustomerReviewAvailabilityProfile("profile-b");
    expect(getCustomerReviewAvailability("profile-b", "reviewed").status).toBe("checking");
    expect((await refreshCustomerReviewState("profile-a", "other")).status).toBe("unavailable");
});

test("confirmed submission becomes reviewed without inventing score fields", () => {
    setCustomerReviewAvailabilityProfile("profile-a"); markCustomerReviewAsReviewed("profile-a", "order-1");
    const result: any = getCustomerReviewAvailability("profile-a", "order-1");
    expect(result.status).toBe("reviewed"); expect(result.state.review).toBeNull();
});

test("Customer integrations remove per-meal review writes and preflight both open and submit", () => {
    const root = resolve(__dirname, "../../..");
    const details = readFileSync(resolve(root, "src/features/orders/OrderDetailsScreen.tsx"), "utf8");
    const history = readFileSync(resolve(root, "app/orders.tsx"), "utf8");
    expect(details).not.toMatch(/submitMenuItemReview|fetchReviewedMenuItemIdsForOrder|<ReviewSheet/);
    expect(details.match(/refreshCustomerReviewState\([^)]*true\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(history.match(/refreshCustomerReviewState\([^)]*true\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(history).not.toContain("getCustomerReviewPromptV2");
    expect(history).not.toContain("reviewPrompt");
    expect(history).toContain("RowReviewAction");
    expect(history).toContain("AppState.addEventListener");
});

test("notification routing reaches the detail screen that performs review recovery", () => {
    const root = resolve(__dirname, "../../..");
    const layout = readFileSync(resolve(root, "app/_layout.tsx"), "utf8");
    expect(layout).toMatch(/pathname: "\/orders\/\[id\]"/);
    const details = readFileSync(resolve(root, "src/features/orders/OrderDetailsScreen.tsx"), "utf8");
    expect(details).toContain('AppState.addEventListener("change"');
    expect(details).toMatch(/state === "active"[\s\S]{0,120}refreshCustomerReviewState/);
});

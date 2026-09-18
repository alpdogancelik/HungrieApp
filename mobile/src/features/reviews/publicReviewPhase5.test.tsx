import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import PublicRestaurantReviewsView from "./PublicRestaurantReviewsView";
import { createPublicReviewPageController, type PublicReviewPageState } from "./publicReviewPageController";
import { formatCoarseReviewDate, formatPublicReviewItems, getPublicReviewCopy, mergePublicReviewPages, safeNextPublicReviewCursor } from "./publicReviewPageModel";

jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children, ...props }: any) => require("react").createElement("SafeAreaView", props, children), useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 24, left: 0 }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: (props: any) => require("react").createElement("Icon", props) }));
jest.mock("@/src/theme/themeContext", () => ({ useTheme: () => ({ theme: { colors: {
    primary: "#FE8C00", onPrimary: "#FFFFFF", background: "#F8FAFC", ink: "#0F172A", textSecondary: "#475569",
    surface: "#FFFFFF", surfaceMuted: "#F1F5F9", muted: "#94A3B8", danger: "#B91C1C", dangerSurface: "#FEF2F2", border: "#E2E8F0", shadow: "#0F172A",
} } }) }));

const summary = { restaurantId: "r-1", overallRating: 4.5, tasteRating: 4.6, speedRating: 4.4, reviewCount: 2 };
const first = { reviewId: "review-1", overallRating: 4.5, tasteRating: 5 as const, speedRating: 4 as const, comment: "Fresh and warm", date: "2026-09-14", items: [{ menuItemId: "meal-1", name: "Pizza", quantity: 2 }] };
const second = { reviewId: "review-2", overallRating: 4, tasteRating: 4 as const, speedRating: 4 as const, comment: "", date: "2026-08-17", items: [] };
const readyState = (patch: Partial<PublicReviewPageState> = {}): PublicReviewPageState => ({ restaurantName: "Ada Pizza", summary, reviews: [first], nextCursor: "opaque-1", initialLoading: false, refreshing: false, loadingMore: false, initialError: null, refreshError: false, pageError: false, ...patch });

test("locks bilingual public copy without identity labels", () => {
    expect(getPublicReviewCopy("en").explanation).toBe("Reviews from delivered orders");
    expect(getPublicReviewCopy("tr").loadMore).toBe("Daha fazla değerlendirme yükle");
    expect(JSON.stringify(getPublicReviewCopy("en"))).not.toMatch(/customer|user|service|price/i);
});

test("formats server UTC dates into deterministic coarse English and Turkish dates", () => {
    const now = new Date("2026-09-17T23:59:00Z");
    expect(formatCoarseReviewDate("2026-09-17", "en", now)).toBe("Today");
    expect(formatCoarseReviewDate("2026-09-16", "tr", now)).toBe("Dün");
    expect(formatCoarseReviewDate("2026-09-14", "en", now)).toBe("3 days ago");
    expect(formatCoarseReviewDate("2026-09-03", "en", now)).toBe("2 weeks ago");
    expect(formatCoarseReviewDate("2026-07-17", "tr", now)).toBe("2 ay önce");
    expect(formatCoarseReviewDate("2025-09-17", "en", now)).toBe("1 year ago");
});

test("formats only safe item snapshots and caps the compact preview", () => {
    expect(formatPublicReviewItems([
        { menuItemId: "1", name: "Pizza", quantity: 2 }, { menuItemId: "2", name: "Ayran", quantity: 1 },
        { menuItemId: "3", name: "Salad", quantity: 1 }, { menuItemId: "4", name: "Cake", quantity: 1 },
    ], "en")).toBe("Pizza ×2 · Ayran · Salad · +1 more");
});

test("deduplicates pages and stops a null or repeated opaque cursor", () => {
    expect(mergePublicReviewPages([first], [first, second])).toEqual([first, second]);
    expect(safeNextPublicReviewCursor("opaque", "opaque")).toBeNull();
    expect(safeNextPublicReviewCursor("opaque", "next-opaque")).toBe("next-opaque");
    expect(safeNextPublicReviewCursor(null, null)).toBeNull();
});

test("controller coalesces refreshes and forwards the opaque continuation exactly once", async () => {
    const pageCalls: Array<{ cursor: string | null; force: boolean }> = [];
    const states: PublicReviewPageState[] = [];
    const controller = createPublicReviewPageController({
        loadRestaurantName: async () => "Ada Pizza",
        loadSummary: async () => summary,
        loadPage: async (cursor, force) => { pageCalls.push({ cursor, force }); return cursor ? { items: [first, second], nextCursor: "opaque-1", limit: 20 } : { items: [first], nextCursor: "opaque-1", limit: 20 }; },
        isOffline: async () => false,
    }, (state) => states.push(state));
    const refreshA = controller.refresh(true); const refreshB = controller.refresh(true);
    expect(refreshA).toBe(refreshB);
    await refreshA;
    const pageA = controller.loadMore(); const pageB = controller.loadMore();
    expect(pageA).toBe(pageB);
    await pageA;
    expect(pageCalls).toEqual([{ cursor: null, force: true }, { cursor: "opaque-1", force: false }]);
    expect(controller.getState().reviews.map((item) => item.reviewId)).toEqual(["review-1", "review-2"]);
    expect(controller.getState().nextCursor).toBeNull();
    expect(states.at(-1)?.loadingMore).toBe(false);
});

test("controller distinguishes offline initial failure and retains v2 data on refresh failure", async () => {
    let fail = true;
    const controller = createPublicReviewPageController({
        loadRestaurantName: async () => { if (fail) throw new Error("offline"); return "Ada Pizza"; },
        loadSummary: async () => summary,
        loadPage: async () => ({ items: [first], nextCursor: null, limit: 20 }),
        isOffline: async () => true,
    }, () => undefined);
    await controller.refresh();
    expect(controller.getState().initialError).toBe("offline");
    fail = false; await controller.refresh();
    expect(controller.getState().reviews).toEqual([first]);
    fail = true; await controller.refresh();
    expect(controller.getState().reviews).toEqual([first]);
    expect(controller.getState().refreshError).toBe(true);
    expect(controller.getState().initialError).toBeNull();
});

test("renders anonymous Taste and Speed cards with no identity or legacy dimensions", () => {
    const screen = render(<PublicRestaurantReviewsView locale="en" onBack={jest.fn()} onLoadMore={jest.fn()} onRefresh={jest.fn()} onRetry={jest.fn()} state={readyState()} />);
    expect(screen.getByText("Reviews from delivered orders")).toBeTruthy();
    expect(screen.getByText("Taste 5.0")).toBeTruthy();
    expect(screen.getByText("Speed 4.0")).toBeTruthy();
    expect(screen.getByText("Pizza ×2")).toBeTruthy();
    expect(screen.queryByText(/customer|user|anonymous|F\/P|service|reaction/i)).toBeNull();
});

test("renders Turkish empty, offline, and pagination retry states", () => {
    const empty = render(<PublicRestaurantReviewsView locale="tr" onBack={jest.fn()} onLoadMore={jest.fn()} onRefresh={jest.fn()} onRetry={jest.fn()} state={readyState({ summary: { ...summary, overallRating: null, tasteRating: null, speedRating: null, reviewCount: 0 }, reviews: [], nextCursor: null })} />);
    expect(empty.getByText("Henüz sipariş değerlendirmesi yok.")).toBeTruthy();
    empty.unmount();
    const offline = render(<PublicRestaurantReviewsView locale="tr" onBack={jest.fn()} onLoadMore={jest.fn()} onRefresh={jest.fn()} onRetry={jest.fn()} state={readyState({ summary: null, reviews: [], nextCursor: null, initialError: "offline" })} />);
    expect(offline.getByText("İnternet bağlantısı yok")).toBeTruthy();
    offline.unmount();
    const loadMore = jest.fn();
    const page = render(<PublicRestaurantReviewsView locale="tr" onBack={jest.fn()} onLoadMore={loadMore} onRefresh={jest.fn()} onRetry={jest.fn()} state={readyState({ pageError: true })} />);
    fireEvent.press(page.getByRole("button", { name: "Tekrar dene" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
});

test("back and load-more controls meet the minimum target and expose button semantics", () => {
    const screen = render(<PublicRestaurantReviewsView locale="en" onBack={jest.fn()} onLoadMore={jest.fn()} onRefresh={jest.fn()} onRetry={jest.fn()} state={readyState()} />);
    const back = screen.getByRole("button", { name: "Back" });
    expect(back.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 44, height: 44 })]));
    expect(screen.getByRole("button", { name: "Load more reviews" })).toBeTruthy();
});

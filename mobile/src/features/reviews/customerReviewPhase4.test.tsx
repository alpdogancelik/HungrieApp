import React from "react";
import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import OrderReviewSheet from "./OrderReviewSheet";
import { getCustomerReviewCopy, groupReviewItems, normalizeReviewComment, validateCustomerReviewForm } from "./customerReviewUiModel";

let mockLanguage = "en";
let mockReducedMotion = false;
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: mockLanguage } }) }));
jest.mock("@/src/lib/useReducedMotion", () => ({ useReducedMotion: () => mockReducedMotion }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }) }));
jest.mock("@/src/theme/themeContext", () => ({ useTheme: () => ({ theme: { colors: {
    primary: "#FE8C00", onPrimary: "#FFFFFF", background: "#F8FAFC", ink: "#0F172A", textSecondary: "#475569",
    surface: "#FFFFFF", surfaceElevated: "#FFFFFF", surfaceMuted: "#F1F5F9", input: "#FFFFFF", muted: "#94A3B8",
    danger: "#B91C1C", border: "#E2E8F0", overlay: "rgba(15,23,42,.56)",
} } }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: (props: any) => require("react").createElement("Icon", props) }));

const items = [
    { menuItemId: "meal-b", name: "Ayran", quantity: 1 },
    { menuItemId: "meal-a", name: "Pizza", quantity: 1 },
    { menuItemId: "meal-a", name: "Changed client label", quantity: 2 },
];
const props = () => ({ visible: true, restaurantName: "Fixture", items, onClose: jest.fn(), onDiscard: jest.fn(), onSubmit: jest.fn() });

beforeEach(() => { mockLanguage = "en"; mockReducedMotion = false; jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined); });

test("groups configured lines by base ID and preserves the first snapshot name", () => {
    expect(groupReviewItems(items)).toEqual([
        { menuItemId: "meal-b", name: "Ayran", quantity: 1 },
        { menuItemId: "meal-a", name: "Pizza", quantity: 3 },
    ]);
});

test("normalizes NFC and ordinary-space boundaries without collapsing allowed whitespace", () => {
    expect(normalizeReviewComment("  Cafe\u0301\tline\n  ")).toBe("Café\tline\n");
});

test("validates required ratings, controls, duplicate reactions, and the 100 reaction ceiling", () => {
    const base: any = { tasteRating: null, speedRating: null, comment: "", mealReactions: [] };
    expect(validateCustomerReviewForm(base)).toBe("taste_required");
    expect(validateCustomerReviewForm({ ...base, tasteRating: 5 })).toBe("speed_required");
    expect(validateCustomerReviewForm({ ...base, tasteRating: 5, speedRating: 4, comment: "bad\u0001" })).toBe("invalid_comment");
    expect(validateCustomerReviewForm({ ...base, tasteRating: 5, speedRating: 4, mealReactions: [{ menuItemId: "a", reaction: "liked" }, { menuItemId: "a", reaction: "disliked" }] })).toBe("duplicate_reaction");
    expect(validateCustomerReviewForm({ ...base, tasteRating: 5, speedRating: 4, mealReactions: Array.from({ length: 101 }, (_, index) => ({ menuItemId: String(index), reaction: "liked" as const })) })).toBe("too_many_reactions");
});

test("renders locked English semantics and 44-point star controls", () => {
    const screen = render(<OrderReviewSheet {...props()} />);
    const star = screen.getByLabelText("Taste, 4 of 5");
    expect(star.props.accessibilityRole).toBe("radio");
    expect(star.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 44, height: 44 })]));
    expect(screen.getByText("Preparation and delivery speed")).toBeTruthy();
    expect(screen.getByText("3× Pizza")).toBeTruthy();
});

test("announces star changes and submits Taste, Speed, normalized comment, and reactions", () => {
    const input = props();
    const screen = render(<OrderReviewSheet {...input} />);
    fireEvent.press(screen.getByLabelText("Taste, 5 of 5"));
    fireEvent.press(screen.getByLabelText("Speed, 4 of 5"));
    fireEvent.changeText(screen.getByLabelText("Comment (optional)"), "  Cafe\u0301  ");
    fireEvent.press(screen.getByLabelText("Liked: Pizza"));
    fireEvent.press(screen.getByText("Submit review"));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Taste, 5 of 5 selected");
    expect(input.onSubmit).toHaveBeenCalledWith({ tasteRating: 5, speedRating: 4, comment: "Café", mealReactions: [{ menuItemId: "meal-a", reaction: "liked" }] });
});

test("moves validation to the first missing rating and never submits", () => {
    const input = props(); const screen = render(<OrderReviewSheet {...input} />);
    fireEvent.press(screen.getByText("Submit review"));
    expect(screen.getByText("Select a Taste rating.")).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Select a Taste rating.");
    expect(input.onSubmit).not.toHaveBeenCalled();
});

test("reaction buttons are semantic, toggleable, and not color-only", () => {
    const screen = render(<OrderReviewSheet {...props()} />); const liked = screen.getByLabelText("Liked: Pizza");
    fireEvent.press(liked); expect(screen.getByLabelText("Liked: Pizza").props.accessibilityState.selected).toBe(true);
    expect(screen.UNSAFE_getAllByType("Icon" as any).some((node: any) => node.props.name === "checkmark")).toBe(true);
    fireEvent.press(screen.getByLabelText("Liked: Pizza")); expect(screen.getByLabelText("Liked: Pizza").props.accessibilityState.selected).toBe(false);
});

test("dirty close uses the cross-platform discard confirmation", async () => {
    const input = props(); const screen = render(<OrderReviewSheet {...input} />);
    fireEvent.press(screen.getByLabelText("Taste, 3 of 5")); fireEvent.press(screen.getByLabelText("Close"));
    expect(screen.getByText("Discard this review?")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Discard and close")); });
    expect(input.onDiscard).toHaveBeenCalledTimes(1);
});

test("Turkish copy and semantic rating values are localized", () => {
    mockLanguage = "tr"; const screen = render(<OrderReviewSheet {...props()} />);
    expect(screen.getByText("Siparişin nasıldı?")).toBeTruthy();
    expect(screen.getByLabelText("Lezzet, 5 üzerinden 4")).toBeTruthy();
    expect(screen.getByText("Hazırlama ve teslimat hızı")).toBeTruthy();
});

test("submitting locks all submission and close paths", () => {
    const input = props(); const screen = render(<OrderReviewSheet {...input} submitting />);
    expect(screen.getByRole("button", { name: "Submitting…" }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText("Close")); fireEvent.press(screen.getByText("Submitting…"));
    expect(input.onClose).not.toHaveBeenCalled(); expect(input.onSubmit).not.toHaveBeenCalled();
});

test("retry errors stay visible beside the persistent action footer", () => {
    const screen = render(<OrderReviewSheet {...props()} errorText="We could not submit your review. Try again." />);
    expect(screen.getByText("We could not submit your review. Try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.UNSAFE_getAllByType("Icon" as any).some((node: any) => node.props.name === "alert-circle-outline")).toBe(true);
});

test("reduced motion disables the modal slide animation", () => {
    mockReducedMotion = true; const screen = render(<OrderReviewSheet {...props()} />);
    expect(screen.UNSAFE_getByType(require("react-native").Modal).props.animationType).toBe("none");
});

test("locked error classifier copy never contains raw database text", () => {
    const copy = getCustomerReviewCopy(false);
    expect(copy.errors.service_unavailable).toBe("We could not submit your review. Try again.");
    expect(JSON.stringify(copy.errors)).not.toMatch(/postgres|constraint|profile_id|order_id/i);
});

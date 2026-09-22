import type { IncidentItem, MenuCategory, MenuItem, MockOrder, ReviewItem, StaffMember } from "./types";

export const orders: MockOrder[] = [
  { id: "b28dd9a5-70ea-4162-930e-013af753f427", shortCode: "#B28DD9A5", customerName: "Deniz K.", createdAt: "2 min ago", deadlineMinutes: 4, status: "pending", paymentMethod: "card_at_door", note: "Please call when you arrive. No cutlery needed.", subtotalKurus: 64000, deliveryKurus: 0, totalKurus: 64000, items: [
    { id: "i1", name: "Truffle Burger", quantity: 2, unitPriceKurus: 28500, selections: ["No onion", "Extra cheddar +₺20"] },
    { id: "i2", name: "Ayran", quantity: 1, unitPriceKurus: 7000, selections: [] },
  ] },
  { id: "82721740-4ad6-4ac9-8d67-110000000001", shortCode: "#82721740", customerName: "Aylin T.", createdAt: "12 min ago", status: "preparing", paymentMethod: "cash", subtotalKurus: 56000, deliveryKurus: 0, totalKurus: 56000, items: [
    { id: "i3", name: "Spicy Burger", quantity: 1, unitPriceKurus: 56000, selections: ["Well done"] },
  ] },
  { id: "9c3fa564-4ad6-4ac9-8d67-110000000002", shortCode: "#9C3FA564", customerName: "Mert A.", createdAt: "28 min ago", status: "ready", paymentMethod: "card_at_door", subtotalKurus: 104000, deliveryKurus: 0, totalKurus: 104000, items: [
    { id: "i4", name: "Plain Burger", quantity: 1, unitPriceKurus: 48000, selections: [] },
    { id: "i5", name: "Spicy Burger", quantity: 1, unitPriceKurus: 56000, selections: [] },
  ] },
  { id: "fb12e41f-4ad6-4ac9-8d67-110000000003", shortCode: "#FB12E41F", customerName: "Elif S.", createdAt: "41 min ago", status: "out_for_delivery", paymentMethod: "cash", subtotalKurus: 89000, deliveryKurus: 0, totalKurus: 89000, items: [
    { id: "i6", name: "Chicken Wrap", quantity: 2, unitPriceKurus: 44500, selections: ["No pickles"] },
  ] },
  { id: "hist-delivered", shortCode: "#4F8B1A20", customerName: "Anonymous customer", createdAt: "Yesterday · 18:44", status: "delivered", paymentMethod: "cash", subtotalKurus: 56000, deliveryKurus: 0, totalKurus: 56000, items: [{ id: "i7", name: "Spicy Burger", quantity: 1, unitPriceKurus: 56000, selections: [] }] },
  { id: "hist-canceled", shortCode: "#21DC890E", customerName: "Anonymous customer", createdAt: "Yesterday · 17:21", status: "canceled", paymentMethod: "card_at_door", cancellationReason: "An item in the order is unavailable.", subtotalKurus: 104000, deliveryKurus: 0, totalKurus: 104000, items: [{ id: "i8", name: "Plain Burger", quantity: 1, unitPriceKurus: 48000, selections: [] }, { id: "i9", name: "Spicy Burger", quantity: 1, unitPriceKurus: 56000, selections: [] }] },
];

export const categories: MenuCategory[] = [
  { id: "burgers", name: "Burgers", itemCount: 3 }, { id: "wraps", name: "Wraps", itemCount: 2 }, { id: "drinks", name: "Drinks", itemCount: 4 },
];

export const menuItems: MenuItem[] = [
  { id: "m1", categoryId: "burgers", name: "Truffle Burger", description: "Beef patty, truffle sauce, caramelized onion and cheddar", priceKurus: 28500, active: true, emoji: "🍔", ingredients: [{ name: "Onion", removable: true }, { name: "Cheddar", removable: true }], groups: [{ id: "g1", name: "Cooking", kind: "modifier", minimum: 1, maximum: 1, options: [{ id: "o1", name: "Medium", priceDeltaKurus: 0 }, { id: "o2", name: "Well done", priceDeltaKurus: 0 }] }] },
  { id: "m2", categoryId: "burgers", name: "Spicy Burger", description: "Beef patty, spicy sauce and crispy lettuce", priceKurus: 56000, active: true, emoji: "🌶️", ingredients: [{ name: "Onion", removable: true }], groups: [] },
  { id: "m3", categoryId: "burgers", name: "Crispy Chicken", description: "Crispy chicken, pickles and house sauce", priceKurus: 46000, active: false, emoji: "🍗", ingredients: [{ name: "Pickles", removable: true }], groups: [] },
  { id: "m4", categoryId: "wraps", name: "Chicken Wrap", description: "Grilled chicken, vegetables and yogurt sauce", priceKurus: 44500, active: true, emoji: "🌯", ingredients: [], groups: [] },
];

export const reviews: ReviewItem[] = [
  { id: "r1", customer: "De*** K.", relativeDate: "2 days ago", taste: 5, speed: 4, comment: "Everything arrived hot and the burger was excellent.", items: ["Truffle Burger ×2", "Ayran"], visibility: "published", reported: false },
  { id: "r2", customer: "Ay*** T.", relativeDate: "1 week ago", taste: 4, speed: 3, comment: "Good food, delivery could be quicker.", items: ["Spicy Burger"], visibility: "published", reported: true },
  { id: "r3", customer: "Anonymous", relativeDate: "2 weeks ago", taste: 2, speed: 2, items: ["Chicken Wrap"], visibility: "hidden", reported: false },
];

export const staff: StaffMember[] = [
  { id: "s1", name: "Aylin Yılmaz", email: "aylin@example.com", role: "owner", state: "active" },
  { id: "s2", name: "Mert Kaya", email: "mert@example.com", role: "manager", state: "active" },
  { id: "s3", name: "Selin Arı", email: "selin@example.com", role: "manager", state: "pending" },
];

export const incidents: IncidentItem[] = [
  { id: "inc-14", title: "Several orders missed their response deadline", openedAt: "Today · 12:10", state: "open", details: "3 of 5 eligible orders expired without a Restaurant response." },
  { id: "inc-11", title: "Order screen connection interrupted", openedAt: "Sep 18 · 19:45", state: "resolved", details: "The connected order screen recovered after the network returned." },
];

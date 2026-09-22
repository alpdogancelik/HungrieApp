export type Locale = "en" | "tr";
export type Scenario = "success" | "loading" | "empty" | "error" | "offline" | "reconnecting" | "stale" | "permission";
export type OrderStatus = "pending" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "canceled";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceKurus: number;
  selections: string[];
}

export interface MockOrder {
  id: string;
  shortCode: string;
  customerName: string;
  createdAt: string;
  deadlineMinutes?: number;
  status: OrderStatus;
  items: OrderItem[];
  note?: string;
  cancellationReason?: string;
  paymentMethod: "cash" | "card_at_door";
  subtotalKurus: number;
  deliveryKurus: number;
  totalKurus: number;
}

export interface MenuOption { id: string; name: string; priceDeltaKurus: number }
export interface MenuGroup { id: string; name: string; kind: "size" | "modifier" | "extra"; minimum: number; maximum: number; options: MenuOption[] }
export interface MenuItem { id: string; categoryId: string; name: string; description: string; priceKurus: number; active: boolean; emoji: string; ingredients: { name: string; removable: boolean }[]; groups: MenuGroup[] }
export interface MenuCategory { id: string; name: string; itemCount: number }

export interface ReviewItem { id: string; customer: string; relativeDate: string; taste: number; speed: number; comment?: string; items: string[]; visibility: "published" | "hidden"; reported: boolean }
export interface StaffMember { id: string; name: string; email: string; role: "owner" | "manager"; state: "active" | "pending" }
export interface IncidentItem { id: string; title: string; openedAt: string; state: "open" | "acknowledged" | "resolved"; details: string }

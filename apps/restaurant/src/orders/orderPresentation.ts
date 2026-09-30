import type { Locale } from "../contracts";
import type { CancellationReason, OrderStatus } from "./orderContract";

export const orderReference = (id: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id.slice(-8).toUpperCase() : id;

export const statusLabel = (status: OrderStatus, locale: Locale) => ({
  pending: locale === "tr" ? "Yanıt bekliyor" : "Waiting for response",
  preparing: locale === "tr" ? "Hazırlanıyor" : "Preparing",
  ready: locale === "tr" ? "Hazır" : "Ready",
  out_for_delivery: locale === "tr" ? "Teslimata çıktı" : "Out for delivery",
  delivered: locale === "tr" ? "Teslim edildi" : "Delivered",
  canceled: locale === "tr" ? "İptal edildi" : "Canceled",
}[status]);

export const reasonLabel = (reason: CancellationReason, locale: Locale) => ({
  too_busy: locale === "tr" ? "Çok yoğun" : "Too busy",
  item_unavailable: locale === "tr" ? "Ürün mevcut değil" : "Item unavailable",
  closing: locale === "tr" ? "Kapanıyor" : "Closing",
  equipment_issue: locale === "tr" ? "Ekipman sorunu" : "Equipment issue",
  delivery_unavailable: locale === "tr" ? "Teslimat kullanılamıyor" : "Delivery unavailable",
  other: locale === "tr" ? "Diğer" : "Other",
}[reason]);

export function customizationLabels(value: unknown, locale: Locale): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>;
  const direct = item.name || item.option_name || item.label || item.value;
  if (typeof direct === "string" && direct.trim()) return [direct];
  const groups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
  const options = groups.flatMap(group => group && typeof group === "object" && Array.isArray((group as Record<string, unknown>).options)
    ? ((group as Record<string, unknown>).options as unknown[]).flatMap(option => customizationLabels(option, locale)) : []);
  const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
  const removed = ingredients.flatMap(ingredient => ingredient && typeof ingredient === "object" && (ingredient as Record<string, unknown>).removed === true && typeof (ingredient as Record<string, unknown>).name === "string"
    ? [`${locale === "tr" ? "Olmasın" : "No"} ${(ingredient as Record<string, unknown>).name}`] : []);
  return [...options, ...removed];
}

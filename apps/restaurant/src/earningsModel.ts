import type { EarningsSeriesBucket } from "@hungrie/domain";

export type EarningsPreset = "day" | "week" | "month" | "custom";
export type EarningsRange = { from: string; to: string };

export class EarningsRangeError extends Error {
  readonly kind: "format" | "reversed" | "too_long";
  constructor(kind: "format" | "reversed" | "too_long") { super(kind); this.kind = kind; this.name = "EarningsRangeError"; }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const parseDate = (value: string) => {
  if (!datePattern.test(value)) throw new EarningsRangeError("format");
  const [year, month, day] = value.split("-").map(Number);
  const instant = Date.UTC(year, month - 1, day);
  const date = new Date(instant);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new EarningsRangeError("format");
  return instant;
};
const isoDate = (instant: number) => new Date(instant).toISOString().slice(0, 10);
const addDays = (date: string, amount: number) => isoDate(parseDate(date) + amount * 86_400_000);

export const validateEarningsRange = (range: EarningsRange) => {
  const from = parseDate(range.from), to = parseDate(range.to);
  if (to < from) throw new EarningsRangeError("reversed");
  const days = Math.round((to - from) / 86_400_000) + 1;
  if (days > 366) throw new EarningsRangeError("too_long");
  return days;
};

export const localDateAt = (instant: Date, timeZone: string) => {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { throw new EarningsRangeError("format"); }
  const parts = Object.fromEntries(formatter.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const earningsRangeForPreset = (preset: Exclude<EarningsPreset, "custom">, timeZone: string, now = new Date()): EarningsRange => {
  const today = localDateAt(now, timeZone);
  if (preset === "day") return { from: today, to: today };
  if (preset === "week") return { from: addDays(today, -6), to: today };
  const [year, month] = today.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = isoDate(Date.UTC(year, month, 0));
  return { from, to };
};

export const earningsBucketForRange = (range: EarningsRange): EarningsSeriesBucket => {
  const days = validateEarningsRange(range);
  return days <= 31 ? "day" : days <= 180 ? "week" : "month";
};

export class EarningsPageStack<T> {
  private pages: T[] = [];
  private index = 0;
  reset(first: T) { this.pages = [first]; this.index = 0; return first; }
  push(page: T) { this.pages = this.pages.slice(0, this.index + 1); this.pages.push(page); this.index += 1; return page; }
  previous() { if (this.index > 0) this.index -= 1; return this.current(); }
  nextLoaded() { if (this.index + 1 >= this.pages.length) return null; this.index += 1; return this.current(); }
  current() { return this.pages[this.index] ?? null; }
  pageNumber() { return this.pages.length ? this.index + 1 : 0; }
  size() { return this.pages.length; }
}

export class RequestGeneration {
  private value = 0;
  begin() { this.value += 1; return this.value; }
  capture() { return this.value; }
  current(generation: number) { return generation === this.value; }
}

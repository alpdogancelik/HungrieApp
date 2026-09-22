import type { AccessContext, RestaurantLifecycleStatus } from "@hungrie/domain";

export type CommissionDraft = {
  restaurantId: string;
  rateBps: number;
  effectiveFromUtc: string;
  reason: string;
};

export type SchedulingAccess = "allowed" | "read_only" | "lifecycle_restricted" | "unauthorized";

export class CommissionValidationError extends Error {
  readonly field: "rate" | "reason" | "effectiveFrom";
  readonly kind: string;
  constructor(field: "rate" | "reason" | "effectiveFrom", kind: string) {
    super(`${field}:${kind}`);
    this.field = field;
    this.kind = kind;
    this.name = "CommissionValidationError";
  }
}

export const parsePercentageToBasisPoints = (raw: string): number => {
  const value = raw.trim();
  if (!/^(?:0|[1-9]\d{0,2})(?:[.,]\d{1,2})?$/.test(value) || (value.includes(".") && value.includes(","))) {
    throw new CommissionValidationError("rate", "format");
  }
  const [wholeText, fractionText = ""] = value.replace(",", ".").split(".");
  const whole = Number(wholeText);
  const fraction = Number(fractionText.padEnd(2, "0") || "0");
  if (whole > 100 || (whole === 100 && fraction !== 0)) throw new CommissionValidationError("rate", "range");
  return Number(`${wholeText}${fractionText.padEnd(2, "0") || "00"}`);
};

export const formatBasisPoints = (rateBps: number, locale: "en" | "tr") => {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) throw new Error("Invalid basis points");
  const whole = Math.floor(rateBps / 100);
  const fraction = String(rateBps % 100).padStart(2, "0");
  return `${whole}${locale === "tr" ? "," : "."}${fraction}%`;
};

export const validateCommissionReason = (raw: string): string => {
  const reason = raw.trim();
  const length = Array.from(reason).length;
  if (length < 1 || length > 500) throw new CommissionValidationError("reason", "length");
  return reason;
};

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };
const parseLocal = (value: string): LocalParts => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new CommissionValidationError("effectiveFrom", "format");
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) };
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (probe.getUTCFullYear() !== parts.year || probe.getUTCMonth() + 1 !== parts.month || probe.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59) {
    throw new CommissionValidationError("effectiveFrom", "format");
  }
  return parts;
};

const formatterFor = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    throw new CommissionValidationError("effectiveFrom", "timezone");
  }
};

const partsAt = (formatter: Intl.DateTimeFormat, instant: number): LocalParts => {
  const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
};

const sameParts = (left: LocalParts, right: LocalParts) => Object.keys(left).every((key) => left[key as keyof LocalParts] === right[key as keyof LocalParts]);

export const restaurantLocalToUtc = (localValue: string, timeZone: string): string => {
  const wanted = parseLocal(localValue);
  const formatter = formatterFor(timeZone);
  const nominal = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute);
  const matches: number[] = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 1) {
    const instant = nominal + offsetMinutes * 60_000;
    if (sameParts(partsAt(formatter, instant), wanted)) matches.push(instant);
  }
  if (matches.length === 0) throw new CommissionValidationError("effectiveFrom", "nonexistent");
  if (matches.length > 1) throw new CommissionValidationError("effectiveFrom", "ambiguous");
  return new Date(matches[0]).toISOString();
};

export const canonicalCommissionDraft = (draft: CommissionDraft) => JSON.stringify([
  draft.restaurantId,
  draft.rateBps,
  draft.effectiveFromUtc,
  draft.reason,
]);

export class StableCommissionOperation {
  private entry: { signature: string; operationId: string } | null = null;
  private readonly createId: () => string;
  constructor(createId: () => string = () => crypto.randomUUID()) { this.createId = createId; }
  prepare(draft: CommissionDraft) {
    const signature = canonicalCommissionDraft(draft);
    if (!this.entry || this.entry.signature !== signature) this.entry = { signature, operationId: this.createId() };
    return this.entry.operationId;
  }
  clear() { this.entry = null; }
  current() { return this.entry?.operationId ?? null; }
}

export const schedulingAccess = (context: AccessContext | null, lifecycle: RestaurantLifecycleStatus): SchedulingAccess => {
  if (lifecycle === "closed") return "lifecycle_restricted";
  if (!context || context.state !== "resolved" || context.accountType !== "admin" || context.accountStatus !== "active" || context.onboardingStep !== "none" || !context.currentSessionMfaVerified) return "unauthorized";
  return context.adminRole === "super_admin" ? "allowed" : "read_only";
};

export const isRecentAuthentication = (authTimeSeconds: number | undefined, nowMs = Date.now()) =>
  Number.isFinite(authTimeSeconds) && (authTimeSeconds as number) * 1000 <= nowMs + 60_000 && (authTimeSeconds as number) * 1000 >= nowMs - 4 * 60_000;

export type AcknowledgementState = "idle" | "sending" | "acknowledged" | "failed";
export type AcknowledgementIntent = { operationId: string; state: AcknowledgementState; promise: Promise<void> | null };
const intents = new Map<string, AcknowledgementIntent>();

export function getAcknowledgementIntent(orderId: string, version: string) {
  const key = `${orderId}\u0000${version}`;
  let intent = intents.get(key);
  if (!intent) { intent = { operationId: crypto.randomUUID(), state: "idle", promise: null }; intents.set(key, intent); }
  return intent;
}

export function resetAcknowledgementIntents() { intents.clear(); }

export class VisibilityDwell {
  private startedAt: number | null = null;
  update(intersectionRatio: number, documentVisible: boolean, now: number) {
    if (!documentVisible || intersectionRatio < 0.5) { this.startedAt = null; return false; }
    if (this.startedAt === null) this.startedAt = now;
    return now - this.startedAt >= 1000;
  }
  reset() { this.startedAt = null; }
}

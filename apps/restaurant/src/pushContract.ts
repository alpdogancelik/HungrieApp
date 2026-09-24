export class PushContractError extends Error {
  constructor() { super("Invalid Restaurant push response"); this.name = "PushContractError"; }
}

const invalid = (): never => { throw new PushContractError(); };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const exact = (value: unknown, keys: readonly string[]) => {
  const row = object(value);
  if (Object.keys(row).length !== keys.length || keys.some(key => !(key in row))) invalid();
  return row;
};
const identifier = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : invalid();

export type PushRegistrationResult = { subscriptionId: string; registered: true };
export type PushUnregistrationResult = { unregistered: true };

export const parsePushRegistration = (value: unknown): PushRegistrationResult => {
  const row = exact(value, ["subscriptionId", "registered"]);
  if (row.registered !== true) invalid();
  return { subscriptionId: identifier(row.subscriptionId), registered: true };
};

export const parsePushUnregistration = (value: unknown): PushUnregistrationResult => {
  const row = exact(value, ["unregistered"]);
  if (row.unregistered !== true) invalid();
  return { unregistered: true };
};

export class StablePushOperation {
  private signature: string | null = null;
  private operationId: string | null = null;
  prepare(parts: readonly string[]) {
    const signature = JSON.stringify(parts);
    if (signature !== this.signature) {
      this.signature = signature;
      this.operationId = crypto.randomUUID();
    }
    return this.operationId!;
  }
  clear() { this.signature = null; this.operationId = null; }
}

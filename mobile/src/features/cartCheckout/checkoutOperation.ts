import { storage } from "@/src/lib/storage";
import { createUuid } from "@/src/lib/uuid";

type StoredOperation = { id: string; requestSignature: string; cartSignature: string };
type OperationStorage = Pick<typeof storage, "getItem" | "setItem" | "removeItem">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Keep persisted keys compatible with Expo SecureStore on native platforms.
export const checkoutOperationKey = (scope: string) => `customer_order_operation_v2_${scope}`;
const parse = (value: string | null): StoredOperation | null => {
    try {
        const parsed = value ? JSON.parse(value) : null;
        return parsed && UUID.test(parsed.id) && typeof parsed.requestSignature === "string" && typeof parsed.cartSignature === "string" ? parsed : null;
    } catch {
        return null;
    }
};

export const resolveCheckoutOperation = async (
    scope: string,
    requestSignature: string,
    cartSignature: string,
    target: OperationStorage = storage,
) => {
    const key = checkoutOperationKey(scope);
    const current = parse(await target.getItem(key));
    if (current?.requestSignature === requestSignature) return current.id;
    const next = { id: createUuid(), requestSignature, cartSignature };
    await target.setItem(key, JSON.stringify(next));
    return next.id;
};

export const discardCheckoutOperationAfterCartChange = async (
    scope: string,
    cartSignature: string,
    target: OperationStorage = storage,
) => {
    const key = checkoutOperationKey(scope);
    const current = parse(await target.getItem(key));
    if (current && current.cartSignature !== cartSignature) await target.removeItem(key);
};

export const clearCheckoutOperation = async (scope: string, operationId: string, target: OperationStorage = storage) => {
    const key = checkoutOperationKey(scope);
    const current = parse(await target.getItem(key));
    if (current?.id === operationId) await target.removeItem(key);
};

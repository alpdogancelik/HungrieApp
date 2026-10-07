export const CART_PERSIST_VERSION = 2;

export type OwnedCartEnvelope<T> = {
    version: typeof CART_PERSIST_VERSION;
    state: {
        ownerUid: string;
        items: T[];
    };
};

export type CartHydrationResult<T> =
    | { status: "restore"; ownerUid: string; items: T[] }
    | { status: "empty" }
    | { status: "reject"; reason: "legacy" | "missing_owner" | "owner_mismatch" | "malformed" };

const validOwner = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 128;

export const encodeOwnedCart = <T>(ownerUid: string, items: T[]): OwnedCartEnvelope<T> => ({
    version: CART_PERSIST_VERSION,
    state: { ownerUid, items },
});

export const decodeOwnedCart = <T>(raw: string | null, expectedUid: string): CartHydrationResult<T> => {
    if (!raw) return { status: "empty" };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { status: "reject", reason: "malformed" };
    }
    if (!parsed || typeof parsed !== "object") return { status: "reject", reason: "malformed" };
    const envelope = parsed as { version?: unknown; state?: unknown };
    if (envelope.version !== CART_PERSIST_VERSION) return { status: "reject", reason: "legacy" };
    if (!envelope.state || typeof envelope.state !== "object") return { status: "reject", reason: "malformed" };
    const state = envelope.state as { ownerUid?: unknown; items?: unknown };
    if (!validOwner(state.ownerUid)) return { status: "reject", reason: "missing_owner" };
    if (state.ownerUid !== expectedUid) return { status: "reject", reason: "owner_mismatch" };
    if (!Array.isArray(state.items)) return { status: "reject", reason: "malformed" };
    return { status: "restore", ownerUid: state.ownerUid, items: state.items as T[] };
};

export const createCartHydrationGuard = <T>({
    read,
    remove,
    lock,
    commit,
}: {
    read: () => Promise<string | null>;
    remove: () => Promise<void>;
    lock: () => void;
    commit: (result: { ownerUid: string | null; items: T[] }) => void;
}) => {
    let generation = 0;

    const invalidate = () => {
        generation += 1;
        lock();
    };

    const bind = async (ownerUid: string | null) => {
        const requestGeneration = ++generation;
        lock();
        if (!ownerUid) {
            await remove();
            if (requestGeneration === generation) commit({ ownerUid: null, items: [] });
            return;
        }

        const decoded = decodeOwnedCart<T>(await read(), ownerUid);
        if (requestGeneration !== generation) return;
        if (decoded.status === "restore") {
            commit({ ownerUid, items: decoded.items });
            return;
        }
        if (decoded.status === "reject") await remove();
        if (requestGeneration === generation) commit({ ownerUid, items: [] });
    };

    return { bind, invalidate };
};

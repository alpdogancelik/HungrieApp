export const RECENT_SEARCHES_VERSION = 4;
export const MAX_RECENT_SEARCHES = 5;
export const MAX_RECENT_SEARCH_LENGTH = 120;

export type OwnedRecentSearches = {
    version: typeof RECENT_SEARCHES_VERSION;
    ownerUid: string;
    searches: string[];
};

export type RecentSearchesSnapshot = {
    ownerUid: string | null;
    identityReady: boolean;
    searches: string[];
};

export type RecentSearchesDecodeResult =
    | { status: "restore"; value: OwnedRecentSearches }
    | { status: "empty" }
    | { status: "reject"; reason: "legacy" | "missing_owner" | "owner_mismatch" | "malformed" };

type Persistence = {
    read: () => Promise<string | null>;
    write: (value: string) => Promise<void>;
    remove: () => Promise<void>;
    removeLegacy: () => Promise<void>;
};

const emptySnapshot = (identityReady = false): RecentSearchesSnapshot => ({
    ownerUid: null,
    identityReady,
    searches: [],
});

const validOwner = (value: unknown): value is string =>
    typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 128
    && !/[\u0000-\u001f\u007f]/.test(value);

const validSearch = (value: unknown): value is string =>
    typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= MAX_RECENT_SEARCH_LENGTH
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

const normalizeKey = (value: string) => value.trim().toLocaleLowerCase();

export const encodeOwnedRecentSearches = (ownerUid: string, searches: string[]): OwnedRecentSearches => ({
    version: RECENT_SEARCHES_VERSION,
    ownerUid,
    searches,
});

export const decodeOwnedRecentSearches = (
    raw: string | null,
    expectedUid: string,
): RecentSearchesDecodeResult => {
    if (!raw) return { status: "empty" };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { status: "reject", reason: "malformed" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { status: "reject", reason: Array.isArray(parsed) ? "legacy" : "malformed" };
    }
    const envelope = parsed as { version?: unknown; ownerUid?: unknown; searches?: unknown };
    if (envelope.version !== RECENT_SEARCHES_VERSION) return { status: "reject", reason: "legacy" };
    if (!validOwner(envelope.ownerUid)) return { status: "reject", reason: "missing_owner" };
    if (envelope.ownerUid !== expectedUid) return { status: "reject", reason: "owner_mismatch" };
    if (!Array.isArray(envelope.searches)
        || envelope.searches.length > MAX_RECENT_SEARCHES
        || !envelope.searches.every(validSearch)
        || new Set(envelope.searches.map(normalizeKey)).size !== envelope.searches.length
        || Object.keys(envelope).sort().join(",") !== "ownerUid,searches,version") {
        return { status: "reject", reason: "malformed" };
    }
    return { status: "restore", value: encodeOwnedRecentSearches(envelope.ownerUid, envelope.searches) };
};

const persistedOwner = (raw: string | null) => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as { version?: unknown; ownerUid?: unknown };
        return parsed?.version === RECENT_SEARCHES_VERSION && validOwner(parsed.ownerUid)
            ? parsed.ownerUid
            : null;
    } catch {
        return null;
    }
};

export const createRecentSearchesController = (persistence: Persistence) => {
    let generation = 0;
    let boundOwner: string | null = null;
    let snapshot = emptySnapshot();
    let storageOperations = Promise.resolve();
    const listeners = new Set<() => void>();

    const publish = (next: RecentSearchesSnapshot) => {
        snapshot = next;
        listeners.forEach(listener => listener());
    };
    const enqueue = <T>(operation: () => Promise<T>) => {
        const result = storageOperations.then(operation, operation);
        storageOperations = result.then(() => undefined, () => undefined);
        return result;
    };
    const persist = (requestGeneration: number, ownerUid: string, searches: string[]) => {
        const value = JSON.stringify(encodeOwnedRecentSearches(ownerUid, searches));
        void enqueue(async () => {
            if (requestGeneration !== generation || snapshot.ownerUid !== ownerUid || !snapshot.identityReady) return;
            await persistence.write(value);
        }).catch(() => undefined);
    };
    const compareAndClear = (observedRaw: string) => {
        void enqueue(async () => {
            const current = await persistence.read();
            if (current === observedRaw) await persistence.remove();
        }).catch(() => undefined);
    };
    const discardLegacy = () => {
        void enqueue(persistence.removeLegacy).catch(() => undefined);
    };

    const invalidate = () => {
        generation += 1;
        publish(emptySnapshot());
    };

    const destroy = async () => {
        const previousOwner = boundOwner;
        boundOwner = null;
        const requestGeneration = ++generation;
        publish(emptySnapshot());
        discardLegacy();
        await enqueue(async () => {
            try {
                const raw = await persistence.read();
                if (!raw) return;
                const owner = persistedOwner(raw);
                if (!owner || owner === previousOwner) await persistence.remove();
            } catch {
                // Memory is already locked; storage cleanup is best effort.
            }
        });
        if (requestGeneration === generation) publish(emptySnapshot(true));
    };

    const bind = async (ownerUid: string | null) => {
        if (!validOwner(ownerUid)) {
            await destroy();
            return;
        }
        boundOwner = ownerUid;
        const requestGeneration = ++generation;
        publish(emptySnapshot());
        discardLegacy();
        let raw: string | null = null;
        try {
            raw = await persistence.read();
        } catch {
            // Fail closed to an empty owner-bound state.
        }
        if (requestGeneration !== generation) return;
        const decoded = decodeOwnedRecentSearches(raw, ownerUid);
        if (decoded.status === "restore") {
            publish({ ownerUid, identityReady: true, searches: decoded.value.searches });
            return;
        }
        if (decoded.status === "reject" && raw) compareAndClear(raw);
        publish({ ownerUid, identityReady: true, searches: [] });
    };

    const mutate = (transform: (current: string[]) => string[]) => {
        if (!snapshot.identityReady || !snapshot.ownerUid) return false;
        const ownerUid = snapshot.ownerUid;
        const requestGeneration = generation;
        const searches = transform(snapshot.searches);
        publish({ ownerUid, identityReady: true, searches });
        persist(requestGeneration, ownerUid, searches);
        return true;
    };

    return {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        bind,
        invalidate,
        destroy,
        add(term: string) {
            const normalized = term.trim();
            if (!validSearch(normalized)) return false;
            return mutate(current => [
                normalized,
                ...current.filter(value => normalizeKey(value) !== normalizeKey(normalized)),
            ].slice(0, MAX_RECENT_SEARCHES));
        },
        remove(term: string) {
            const key = normalizeKey(term);
            return mutate(current => current.filter(value => normalizeKey(value) !== key));
        },
        clear: () => mutate(() => []),
        flush: () => storageOperations,
    };
};

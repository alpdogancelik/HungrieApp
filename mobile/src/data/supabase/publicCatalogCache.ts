const STALE_AFTER_MS = 60_000;

type Entry<T> = {
    value?: T;
    updatedAt: number;
    inFlight?: Promise<T>;
};

const entries = new Map<string, Entry<any>>();

export const readCatalogCached = async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    let entry = entries.get(key) as Entry<T> | undefined;
    if (entry?.value !== undefined && now - entry.updatedAt < STALE_AFTER_MS) return entry.value;
    if (entry?.inFlight) return entry.value !== undefined ? entry.value : entry.inFlight;

    entry ||= { updatedAt: 0 };
    const target = entry;
    const hadStaleValue = target.value !== undefined;
    target.inFlight = loader().then((value) => {
        target.value = value;
        target.updatedAt = Date.now();
        target.inFlight = undefined;
        return value;
    }).catch((error) => {
        target.inFlight = undefined;
        if (hadStaleValue) return target.value as T;
        throw error;
    });
    entries.set(key, target);

    // Stale-while-revalidate: stale public data remains immediately usable
    // while a single shared refresh runs in the background.
    return target.value !== undefined ? target.value : target.inFlight;
};

export const invalidateCatalogCache = (prefix?: string) => {
    if (!prefix) return entries.clear();
    for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
};

export const clearCatalogCache = () => entries.clear();

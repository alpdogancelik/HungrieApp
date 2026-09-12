type MetricName =
    | "startup.ready"
    | "repository.order.page"
    | "repository.order.detail"
    | "repository.order.summary"
    | "repository.order.action"
    | "repository.catalog.search"
    | "repository.catalog.bundle"
    | "realtime.reconciliation"
    | "screen.ready";

const counts = new Map<MetricName, number>();
const samples = new Map<MetricName, number[]>();
const applicationStartedAt = globalThis.performance?.now?.() ?? Date.now();

const record = (name: MetricName, durationMs: number) => {
    const values = samples.get(name) || [];
    values.push(Math.round(durationMs));
    if (values.length > 100) values.shift();
    samples.set(name, values);
};

export const markDevelopment = (name: MetricName) => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    record(name, now - applicationStartedAt);
    console.debug(`[performance] ${name}`, { durationMs: Math.round(now - applicationStartedAt) });
};

export const measureDevelopment = async <T>(name: MetricName, operation: () => Promise<T>): Promise<T> => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return operation();
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    counts.set(name, (counts.get(name) || 0) + 1);
    try {
        return await operation();
    } finally {
        const endedAt = globalThis.performance?.now?.() ?? Date.now();
        record(name, endedAt - startedAt);
        // Names are a fixed allowlist. Never include IDs, tokens, query text,
        // contacts, addresses, payloads, or error bodies in timing output.
        console.debug(`[performance] ${name}`, {
            durationMs: Math.round(endedAt - startedAt),
            requestCount: counts.get(name),
        });
    }
};

export const getDevelopmentPerformanceSnapshot = () => Object.fromEntries(
    [...samples.entries()].map(([name, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return [name, {
            count: values.length,
            medianMs: sorted[Math.floor(sorted.length / 2)] || 0,
            p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0,
            maxMs: sorted.at(-1) || 0,
        }];
    }),
);

export const resetDevelopmentPerformanceMetrics = () => {
    counts.clear();
    samples.clear();
};

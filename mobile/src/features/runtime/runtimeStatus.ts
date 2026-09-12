import { AppState } from "react-native";
import { supabaseCatalog, supabaseEnabled } from "@/lib/supabase";

export type RuntimeMode = "maintenance" | "testing" | "active";
export type RuntimeStatus = {
    environment: "local" | "development" | "staging" | "production";
    mode: RuntimeMode;
    writesEnabled: boolean;
    checkedAt: string;
};

const normalize = (value: any): RuntimeStatus | null => {
    const row = Array.isArray(value) ? value[0] : value;
    if (!row || !["maintenance", "testing", "active"].includes(String(row.mode))) return null;
    return {
        environment: String(row.environment || "development") as RuntimeStatus["environment"],
        mode: String(row.mode) as RuntimeMode,
        writesEnabled: Boolean(row.writes_enabled),
        checkedAt: String(row.checked_at || new Date().toISOString()),
    };
};

export const fetchRuntimeStatus = async (): Promise<RuntimeStatus | null> => {
    if (!supabaseEnabled || !supabaseCatalog) return null;
    const { data, error } = await (supabaseCatalog as any).rpc("get_runtime_status");
    if (error) throw error;
    return normalize(data);
};

export const subscribeRuntimeStatus = (listener: (status: RuntimeStatus | null) => void) => {
    let cancelled = false;
    const refresh = async () => {
        try {
            const status = await fetchRuntimeStatus();
            if (!cancelled) listener(status);
        } catch {
            // Connectivity failures are handled separately. Never infer maintenance from a failed request.
        }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    const appState = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
    });
    return () => {
        cancelled = true;
        clearInterval(timer);
        appState.remove();
    };
};

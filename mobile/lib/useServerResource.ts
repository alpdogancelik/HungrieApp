import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

type Fn<P, T> = (params?: P) => Promise<T>;

interface UseServerResourceOptions<T, P = undefined> {
    fn: Fn<P, T>;
    params?: P;
    immediate?: boolean;
    skipAlert?: boolean;
}

interface UseServerResourceReturn<T, P> {
    data: T | null;
    loading: boolean;
    error: string | null;
    refetch: (overrideParams?: P) => Promise<void>;
}

export function useServerResource<T, P = undefined>({
    fn,
    params,
    immediate = true,
    skipAlert = false,
}: UseServerResourceOptions<T, P>): UseServerResourceReturn<T, P> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(immediate);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(
        async (override?: P) => {
            setLoading(true);
            setError(null);
            try {
                const payload = override !== undefined ? override : params;
                const result = await fn(payload as P);
                setData(result);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Unexpected error";
                setError(message);
                if (!skipAlert) Alert.alert("Oops", message);
            } finally {
                setLoading(false);
            }
        },
        [fn, params, skipAlert],
    );

    useEffect(() => {
        if (immediate) {
            execute();
        }
    }, [execute, immediate]);

    return {
        data,
        loading,
        error,
        refetch: execute,
    };
}

export default useServerResource;

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

type ParamRecord = Record<string, string | number | undefined>;

interface UseAsyncResourceOptions<T, P extends ParamRecord | undefined = ParamRecord> {
    fn: (params: P extends undefined ? Record<string, never> : P) => Promise<T>;
    params?: P;
    skip?: boolean;
}

interface UseAsyncResourceReturn<T, P> {
    data: T | null;
    loading: boolean;
    error: string | null;
    refetch: (newParams?: P) => Promise<void>;
}

const useAsyncResource = <T, P extends ParamRecord | undefined = ParamRecord>({
    fn,
    params,
    skip = false,
}: UseAsyncResourceOptions<T, P>): UseAsyncResourceReturn<T, P | undefined> => {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(!skip);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef<P | undefined>(params);

    const resolveParams = useCallback(
        (incoming?: P): P | undefined => {
            if (incoming !== undefined) {
                paramsRef.current = incoming;
                return incoming;
            }
            if (paramsRef.current !== undefined) return paramsRef.current;
            const empty = {} as P;
            paramsRef.current = empty;
            return empty;
        },
        [],
    );

    const fetchData = useCallback(
        async (fetchParams?: P) => {
            const resolved = resolveParams(fetchParams);
            setLoading(true);
            setError(null);

            try {
                const result = await fn((resolved ?? ({} as P)) as any);
                setData(result);
            } catch (err: unknown) {
                const errorMessage =
                    err instanceof Error ? err.message : "An unknown error occurred";
                setError(errorMessage);
                Alert.alert("Error", errorMessage);
            } finally {
                setLoading(false);
            }
        },
        [fn, resolveParams],
    );

    useEffect(() => {
        paramsRef.current = params;
        if (!skip) {
            fetchData(params);
        } else if (params !== undefined) {
            resolveParams(params);
        }
    }, [params, skip, fetchData, resolveParams]);

    const refetch = useCallback(
        async (newParams?: P) => {
            await fetchData(newParams);
        },
        [fetchData],
    );

    return { data, loading, error, refetch };
};

export default useAsyncResource;

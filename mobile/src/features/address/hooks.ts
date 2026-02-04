import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "@/src/domain/types";
import { addressStore } from "./addressStore";

export const useAddresses = () => {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const boot = async () => {
            try {
                const list = await addressStore.list();
                if (mounted) {
                    setAddresses(list);
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        };
        void boot();
        const unsubscribe = addressStore.subscribe((list) => {
            if (mounted) {
                setAddresses(list);
            }
        });
        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        const list = await addressStore.list();
        setAddresses(list);
        setIsLoading(false);
        return list;
    }, []);

    return { addresses, isLoading, refresh };
};

const useMutation = () => {
    const [isMutating, setIsMutating] = useState(false);

    const run = useCallback(async <T,>(operation: () => Promise<T>) => {
        setIsMutating(true);
        try {
            return await operation();
        } finally {
            setIsMutating(false);
        }
    }, []);

    return { isMutating, run };
};

export const useAddressActions = () => {
    const { isMutating, run } = useMutation();

    const createAddress = useCallback(
        (payload: Parameters<typeof addressStore.create>[0]) => run(() => addressStore.create(payload)),
        [run],
    );
    const updateAddress = useCallback(
        (payload: Parameters<typeof addressStore.update>[0]) => run(() => addressStore.update(payload)),
        [run],
    );
    const removeAddress = useCallback(
        (id: string) => run(() => addressStore.remove(id)),
        [run],
    );
    const setDefaultAddress = useCallback(
        (id: string) => run(() => addressStore.setDefault(id)),
        [run],
    );

    return {
        isMutating,
        createAddress,
        updateAddress,
        removeAddress,
        setDefaultAddress,
    };
};

export const useDefaultAddress = () => {
    const { addresses, isLoading, refresh } = useAddresses();
    const defaultAddress = useMemo(
        () => addresses.find((address) => address.isDefault) ?? addresses[0],
        [addresses],
    );
    return { defaultAddress, addresses, isLoading, refresh };
};


import AsyncStorage from "@react-native-async-storage/async-storage";
import { nanoid } from "nanoid/non-secure";
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    setDoc,
} from "firebase/firestore";
import useAuthStore from "@/store/auth.store";
import { firestore } from "@/lib/firebase";
import type { Address } from "@/src/domain/types";

const LEGACY_STORAGE_KEY = "@hungrie/addresses";
const LEGACY_CLAIM_KEY = "@hungrie/addresses/legacy-claimed-by";

export type AddressInput = Omit<Address, "id" | "createdAt"> & { id?: string; isDefault?: boolean };
type Listener = (addresses: Address[]) => void;

let cache: Address[] | null = null;
let cacheOwnerId: string | null = null;
const listeners = new Set<Listener>();

const sortAddresses = (addresses: Address[]) =>
    [...addresses].sort((a, b) => {
        if (a.isDefault === b.isDefault) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.isDefault ? -1 : 1;
    });

const notify = (addresses: Address[]) => {
    listeners.forEach((cb) => {
        cb(addresses);
    });
};
const debugWarn = (message: string, error?: unknown) => {
    if (!__DEV__) return;
    if (error) {
        console.warn(`[AddressStore] ${message}`, error);
        return;
    }
    console.warn(`[AddressStore] ${message}`);
};
const notSignedInError = () => new Error("Please sign in to manage addresses.");
const getCurrentUserId = () => useAuthStore.getState().user?.accountId ?? null;

const resetCacheIfUserChanged = (nextUserId: string | null) => {
    if (cacheOwnerId === nextUserId) return;
    cacheOwnerId = nextUserId;
    cache = nextUserId ? null : [];
    notify([]);
};

const setCacheForUser = (userId: string, addresses: Address[]) => {
    const sorted = sortAddresses(addresses);
    cacheOwnerId = userId;
    cache = sorted;
    notify(sorted);
};
const resolveDefaultAddress = (addresses: Address[]) => {
    const sorted = sortAddresses(addresses);
    return sorted.find((address) => address.isDefault) ?? sorted[0] ?? null;
};
const buildAddressText = (address: Address | null) => {
    if (!address) return null;
    return [address.label, address.line1, address.block, address.room, address.city, address.country]
        .filter(Boolean)
        .join(", ");
};
const syncUserAddressSummary = async (userId: string, addresses: Address[]) => {
    if (!firestore) throw new Error("Address storage is not configured.");
    const defaultAddress = resolveDefaultAddress(addresses);
    const addressText = buildAddressText(defaultAddress);
    await setDoc(
        doc(firestore, "users", userId),
        {
            // Keep a simple field for quick visibility in Firestore console.
            address: addressText,
            defaultAddress,
            addressesCount: addresses.length,
            addressesUpdatedAt: Date.now(),
        },
        { merge: true },
    );
};

const sanitize = (input: AddressInput): AddressInput => ({
    ...input,
    label: input.label.trim(),
    line1: input.line1.trim(),
    block: input.block?.trim() || undefined,
    room: input.room?.trim() || undefined,
    city: input.city.trim(),
    country: input.country.trim(),
});

const nextDefaultIfMissing = (addresses: Address[], preferNotId?: string) => {
    if (addresses.some((address) => address.isDefault) || addresses.length === 0) {
        return addresses;
    }
    const fallback =
        addresses.find((address) => (preferNotId ? address.id !== preferNotId : true)) ?? addresses[0];
    return addresses.map((address) => ({
        ...address,
        isDefault: address.id === fallback.id,
    }));
};

const userAddressesCollection = (userId: string) => {
    if (!firestore) return null;
    return collection(firestore, "users", userId, "addresses");
};

const readFromFirestore = async (userId: string): Promise<Address[]> => {
    const col = userAddressesCollection(userId);
    if (!col) return [];
    const snap = await getDocs(col);
    const list: Address[] = snap.docs.map((docSnap) => docSnap.data() as Address);
    return sortAddresses(list);
};

const writeAllToFirestore = async (userId: string, addresses: Address[]) => {
    const col = userAddressesCollection(userId);
    if (!col) throw new Error("Firestore is not configured.");
    await Promise.all(
        addresses.map((address) => {
            const ref = doc(col, address.id);
            return setDoc(ref, address, { merge: true });
        }),
    );
};

const getUserContext = () => {
    const userId = getCurrentUserId();
    if (!userId) throw notSignedInError();
    if (!firestore) throw new Error("Address storage is not configured.");
    const col = userAddressesCollection(userId);
    if (!col) throw new Error("Address storage is not configured.");
    return { userId, col };
};

const coerceLegacyAddress = (value: any): Address | null => {
    if (!value || typeof value !== "object") return null;
    const label = String(value.label ?? "").trim();
    const line1 = String(value.line1 ?? "").trim();
    const city = String(value.city ?? "").trim();
    const country = String(value.country ?? "").trim();
    if (!label || !line1 || !city || !country) return null;

    return {
        id: String(value.id ?? nanoid()),
        label,
        line1,
        block: value.block ? String(value.block).trim() : undefined,
        room: value.room ? String(value.room).trim() : undefined,
        city,
        country,
        isDefault: Boolean(value.isDefault),
        createdAt: String(value.createdAt ?? new Date().toISOString()),
    };
};

const readLegacyAddresses = async (): Promise<Address[]> => {
    const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY).catch((error) => {
        debugWarn("Failed to read legacy addresses key.", error);
        return null;
    });
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const normalized = parsed
            .map((item) => coerceLegacyAddress(item))
            .filter((item): item is Address => Boolean(item));
        return sortAddresses(normalized);
    } catch {
        return [];
    }
};

const migrateLegacyAddressesIfNeeded = async (userId: string) => {
    const claimedBy = await AsyncStorage.getItem(LEGACY_CLAIM_KEY).catch((error) => {
        debugWarn("Failed to read legacy migration claim key.", error);
        return null;
    });
    if (claimedBy) return;

    const legacyAddresses = await readLegacyAddresses();
    if (!legacyAddresses.length) return;

    const remoteAddresses = await readFromFirestore(userId);
    if (remoteAddresses.length) return;

    await writeAllToFirestore(userId, legacyAddresses);
    await syncUserAddressSummary(userId, legacyAddresses).catch((error) => {
        debugWarn("Failed to sync legacy address summary to user profile.", error);
    });
    await AsyncStorage.setItem(LEGACY_CLAIM_KEY, userId).catch((error) => {
        debugWarn("Failed to persist legacy migration claim key.", error);
    });
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch((error) => {
        debugWarn("Failed to clear legacy addresses key after migration.", error);
    });
};

export const list = async () => {
    const userId = getCurrentUserId();
    resetCacheIfUserChanged(userId);
    if (!userId) return [];
    if (!firestore) {
        debugWarn("Firestore is not configured for address reads.");
        setCacheForUser(userId, []);
        return [];
    }

    try {
        await migrateLegacyAddressesIfNeeded(userId);
        const remote = await readFromFirestore(userId);
        if (getCurrentUserId() !== userId) {
            return [];
        }
        await syncUserAddressSummary(userId, remote).catch((error) => {
            debugWarn("Failed to sync user address summary during list.", error);
        });
        setCacheForUser(userId, remote);
        return remote;
    } catch (error) {
        debugWarn("Failed to read addresses from Firestore.", error);
        if (getCurrentUserId() === userId) {
            setCacheForUser(userId, []);
        }
        return [];
    }
};

export const create = async (payload: AddressInput): Promise<Address> => {
    const { userId } = getUserContext();
    const addresses = await list();
    const sanitized = sanitize(payload);
    const requestedDefault = sanitized.isDefault ?? false;
    const shouldBeDefault = addresses.length === 0 ? true : requestedDefault;

    const base = shouldBeDefault ? addresses.map((address) => ({ ...address, isDefault: false })) : [...addresses];
    const id = payload.id ?? nanoid();
    const newAddress: Address = {
        ...sanitized,
        id,
        isDefault: !!shouldBeDefault,
        createdAt: new Date().toISOString(),
    };

    const nextList = [...base, newAddress];
    try {
        if (getCurrentUserId() !== userId) throw notSignedInError();
        await writeAllToFirestore(userId, nextList);
        await syncUserAddressSummary(userId, nextList);
        setCacheForUser(userId, nextList);
    } catch (error) {
        debugWarn("Failed to create address.", error);
        throw new Error("Unable to save address right now.");
    }
    return newAddress;
};

export const update = async (payload: Address): Promise<Address> => {
    const { userId } = getUserContext();
    const addresses = await list();
    const index = addresses.findIndex((address) => address.id === payload.id);
    if (index === -1) {
        throw new Error("Address not found");
    }
    const sanitized = sanitize(payload);
    const shouldBeDefault = sanitized.isDefault ?? false;
    let updatedList = [...addresses];

    updatedList[index] = {
        ...updatedList[index],
        ...sanitized,
    };

    if (shouldBeDefault) {
        updatedList = updatedList.map((address, idx) => ({
            ...address,
            isDefault: idx === index,
        }));
    } else {
        updatedList = nextDefaultIfMissing(updatedList, payload.id);
    }

    try {
        if (getCurrentUserId() !== userId) throw notSignedInError();
        await writeAllToFirestore(userId, updatedList);
        await syncUserAddressSummary(userId, updatedList);
        setCacheForUser(userId, updatedList);
    } catch (error) {
        debugWarn("Failed to update address.", error);
        throw new Error("Unable to save address right now.");
    }
    return updatedList[index];
};

export const remove = async (id: string) => {
    const { userId, col } = getUserContext();
    const addresses = await list();
    const filtered = addresses.filter((address) => address.id !== id);
    const next = nextDefaultIfMissing(filtered, id);

    try {
        if (getCurrentUserId() !== userId) throw notSignedInError();
        await deleteDoc(doc(col, id));
        await writeAllToFirestore(userId, next);
        await syncUserAddressSummary(userId, next);
        setCacheForUser(userId, next);
    } catch (error) {
        debugWarn("Failed to remove address.", error);
        throw new Error("Unable to delete address right now.");
    }
};

export const setDefault = async (id: string) => {
    const { userId } = getUserContext();
    const addresses = await list();
    if (!addresses.some((address) => address.id === id)) return;
    const next = addresses.map((address) => ({
        ...address,
        isDefault: address.id === id,
    }));
    try {
        if (getCurrentUserId() !== userId) throw notSignedInError();
        await writeAllToFirestore(userId, next);
        await syncUserAddressSummary(userId, next);
        setCacheForUser(userId, next);
    } catch (error) {
        debugWarn("Failed to set default address.", error);
        throw new Error("Unable to update default address right now.");
    }
};

export const syncUp = async () => {
    await list();
};

export const syncDown = async () => {
    await list();
};

export const subscribe = (listener: Listener) => {
    listeners.add(listener);
    const userId = getCurrentUserId();
    resetCacheIfUserChanged(userId);
    if (cache && cacheOwnerId === userId) {
        listener(cache);
    } else {
        void list().catch(() => listener([]));
    }
    return () => listeners.delete(listener);
};

export const addressStore = {
    list,
    create,
    update,
    remove,
    setDefault,
    syncUp,
    syncDown,
    subscribe,
};

export type AddressStore = typeof addressStore;

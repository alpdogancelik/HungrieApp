import AsyncStorage from "@react-native-async-storage/async-storage";
import { nanoid } from "nanoid/non-secure";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    setDoc,
} from "firebase/firestore";
import useAuthStore from "@/store/auth.store";
import { firestore } from "@/lib/firebase";
import type { Address } from "@/src/domain/types";

const STORAGE_KEY = "@hungrie/addresses";

export type AddressInput = Omit<Address, "id" | "createdAt"> & { id?: string; isDefault?: boolean };
type Listener = (addresses: Address[]) => void;

let cache: Address[] | null = null;
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

const canUseFirestore = () => Boolean(firestore && useAuthStore.getState().user?.accountId);
const userAddressesCollection = () => {
    const uid = useAuthStore.getState().user?.accountId;
    if (!uid || !firestore) return null;
    return collection(firestore, "users", uid, "addresses");
};

const readFromStorage = async (): Promise<Address[]> => {
    if (cache) {
        return cache;
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
        cache = [];
        return cache;
    }
    try {
        const parsed = JSON.parse(raw);
        cache = Array.isArray(parsed) ? parsed : [];
    } catch {
        cache = [];
    }
    cache = sortAddresses(cache);
    return cache;
};

const persistToStorage = async (addresses: Address[]) => {
    const sorted = sortAddresses(addresses);
    cache = sorted;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    notify(sorted);
};

const persistToFirestore = async (addresses: Address[]) => {
    const col = userAddressesCollection();
    if (!col) return;
    // Write each address; in this simple approach we overwrite.
    await Promise.all(
        addresses.map((address) => {
            const ref = doc(col, address.id);
            return setDoc(ref, address, { merge: true });
        }),
    );
};

const readFromFirestore = async (): Promise<Address[] | null> => {
    const col = userAddressesCollection();
    if (!col) return null;
    const snap = await getDocs(col);
    const list: Address[] = snap.docs.map((docSnap) => docSnap.data() as Address);
    return sortAddresses(list);
};

const persistAll = async (addresses: Address[]) => {
    const sorted = sortAddresses(addresses);
    cache = sorted;
    if (canUseFirestore()) {
        await persistToFirestore(sorted).catch(() => null);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted)).catch(() => null);
    notify(sorted);
};

export const list = async () => {
    if (canUseFirestore()) {
        const remote = await readFromFirestore().catch(() => null);
        if (remote) {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote)).catch(() => null);
            cache = remote;
            notify(remote);
            return remote;
        }
    }
    const addresses = await readFromStorage();
    return sortAddresses(addresses);
};

export const create = async (payload: AddressInput): Promise<Address> => {
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
    await persistAll(nextList);
    return newAddress;
};

export const update = async (payload: Address): Promise<Address> => {
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

    await persistAll(updatedList);
    return updatedList[index];
};

export const remove = async (id: string) => {
    const addresses = await list();
    const filtered = addresses.filter((address) => address.id !== id);
    const next = nextDefaultIfMissing(filtered, id);

    if (canUseFirestore()) {
        const col = userAddressesCollection();
        if (col) {
            await deleteDoc(doc(col, id)).catch(() => null);
        }
    }

    await persistAll(next);
};

export const setDefault = async (id: string) => {
    const addresses = await list();
    if (!addresses.some((address) => address.id === id)) return;
    const next = addresses.map((address) => ({
        ...address,
        isDefault: address.id === id,
    }));
    await persistAll(next);
};

export const syncUp = async () => {
    const addresses = await readFromStorage();
    await persistToFirestore(addresses).catch(() => null);
};

export const syncDown = async () => {
    const remote = await readFromFirestore().catch(() => null);
    if (remote) {
        await persistAll(remote);
    }
};

export const subscribe = (listener: Listener) => {
    listeners.add(listener);
    if (cache) {
        listener(cache);
    } else {
        void list().then(listener).catch(() => null);
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

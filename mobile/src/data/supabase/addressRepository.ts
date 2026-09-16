import { nanoid } from "nanoid/non-secure";

import type { AddressRepository } from "@/src/data/contracts";
import type { Address } from "@/src/domain/types";
import { requireSupabase, throwIfError, withSupabaseAuthRetry } from "./utils";

const listeners = new Set<(addresses: Address[]) => void>();
let cache: Address[] = [];
let cacheGeneration = 0;
const ADDRESS_COLUMNS = "id,label,line1,block,room,city,country,is_default,created_at";

const mapAddress = (row: any): Address => ({
    id: String(row.id || ""),
    label: row.label || "",
    line1: row.line1 || "",
    block: row.block || undefined,
    room: row.room || undefined,
    city: row.city || "",
    country: row.country || "",
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at || new Date().toISOString(),
});

const notify = (addresses: Address[]) => {
    cache = addresses;
    listeners.forEach((listener) => listener(addresses));
};

export const list: AddressRepository["list"] = async () => {
    const requestGeneration = cacheGeneration;
    const rows = await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("list_my_customer_addresses_v1")));
    const addresses = rows.map(mapAddress);
    if (requestGeneration !== cacheGeneration) return [];
    notify(addresses);
    return addresses;
};

export const create: AddressRepository["create"] = async (payload) => {
    const existing = await list();
    const address: Address = {
        ...payload,
        id: payload.id || nanoid(),
        isDefault: existing.length === 0 || Boolean(payload.isDefault),
        createdAt: new Date().toISOString(),
    };
    await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("create_my_customer_address_v1", {
        p_id: address.id, p_label: address.label, p_line1: address.line1,
        p_block: address.block || undefined, p_room: address.room || undefined,
        p_city: address.city, p_country: address.country, p_is_default: address.isDefault,
    })));
    const saved = await list();
    return saved.find((item) => item.id === address.id) ?? address;
};

export const update: AddressRepository["update"] = async (payload) => {
    const existing = await list();
    const previous = existing.find((address) => address.id === payload.id);
    if (!previous) throw new Error("Address not found.");
    await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("update_my_customer_address_v1", {
        p_id: payload.id, p_label: payload.label, p_line1: payload.line1,
        p_block: payload.block || undefined, p_room: payload.room || undefined,
        p_city: payload.city, p_country: payload.country, p_is_default: payload.isDefault,
    })));
    const saved = await list();
    return saved.find((item) => item.id === payload.id) ?? { ...payload, isDefault: previous.isDefault };
};

export const remove: AddressRepository["remove"] = async (id) => {
    await withSupabaseAuthRetry(async () => throwIfError(await requireSupabase().rpc("delete_my_customer_address_v1", { p_id: id })));
    await list();
};

export const setDefault: AddressRepository["setDefault"] = async (id) => {
    await withSupabaseAuthRetry(async () => requireSupabase().rpc("set_my_customer_default_address_v1", { p_address_id: id }).then(throwIfError));
    await list();
};

export const syncUp: AddressRepository["syncUp"] = async () => {
    await list();
};
export const syncDown = syncUp;
export const clearSessionCache: AddressRepository["clearSessionCache"] = () => {
    cacheGeneration += 1;
    notify([]);
};
export const subscribe: AddressRepository["subscribe"] = (listener) => {
    listeners.add(listener);
    listener(cache);
    void list().catch(() => listener([]));
    return () => {
        listeners.delete(listener);
    };
};

export const supabaseAddressRepository: AddressRepository = {
    list,
    create,
    update,
    remove,
    setDefault,
    syncUp,
    syncDown,
    clearSessionCache,
    subscribe,
};

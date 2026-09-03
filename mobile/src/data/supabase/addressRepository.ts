import { nanoid } from "nanoid/non-secure";

import type { AddressRepository } from "@/src/data/contracts";
import type { Address } from "@/src/domain/types";
import { requireSupabase, throwIfError } from "./utils";

const listeners = new Set<(addresses: Address[]) => void>();
let cache: Address[] = [];

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
    const rows = throwIfError(await requireSupabase().from("addresses").select("*").order("is_default", { ascending: false }));
    const addresses = rows.map(mapAddress);
    notify(addresses);
    return addresses;
};

export const create: AddressRepository["create"] = async (payload) => {
    const currentProfile = throwIfError(await requireSupabase().from("profiles").select("id").limit(1).maybeSingle());
    const address: Address = {
        ...payload,
        id: payload.id || nanoid(),
        isDefault: payload.isDefault ?? false,
        createdAt: new Date().toISOString(),
    };
    throwIfError(
        await requireSupabase().from("addresses").insert({
            id: address.id,
            profile_id: currentProfile?.id || "",
            label: address.label,
            line1: address.line1,
            block: address.block || null,
            room: address.room || null,
            city: address.city,
            country: address.country,
            is_default: address.isDefault,
        }),
    );
    if (address.isDefault) await setDefault(address.id);
    await list();
    return address;
};

export const update: AddressRepository["update"] = async (payload) => {
    throwIfError(
        await requireSupabase().from("addresses").update({
            label: payload.label,
            line1: payload.line1,
            block: payload.block || null,
            room: payload.room || null,
            city: payload.city,
            country: payload.country,
            is_default: payload.isDefault,
        }).eq("id", payload.id),
    );
    if (payload.isDefault) await setDefault(payload.id);
    await list();
    return payload;
};

export const remove: AddressRepository["remove"] = async (id) => {
    throwIfError(await requireSupabase().from("addresses").delete().eq("id", id));
    await list();
};

export const setDefault: AddressRepository["setDefault"] = async (id) => {
    await requireSupabase().rpc("set_default_address", { p_address_id: id }).then(throwIfError);
    await list();
};

export const syncUp: AddressRepository["syncUp"] = async () => {
    await list();
};
export const syncDown = syncUp;
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
    subscribe,
};

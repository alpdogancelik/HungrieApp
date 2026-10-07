import { nanoid } from "nanoid/non-secure";

import type { AddressRepository } from "@/src/data/contracts";
import type { Address } from "@/src/domain/types";
import { assertTrustedCustomerUid, getTrustedCustomerUid, requireTrustedCustomerUid, withBoundCustomerClient } from "./identityBoundary";
import { throwIfError } from "./utils";

const listeners = new Set<(addresses: Address[]) => void>();
let cache: Address[] = [];
let cacheGeneration = 0;
let cacheOwnerUid: string | null = null;
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

const notify = (ownerUid: string | null, addresses: Address[]) => {
    cacheOwnerUid = ownerUid;
    cache = addresses;
    listeners.forEach((listener) => listener(addresses));
};

const captureOperation = () => ({ uid: requireTrustedCustomerUid(), generation: cacheGeneration });
const assertOperation = ({ uid, generation }: { uid: string; generation: number }) => {
    assertTrustedCustomerUid(uid);
    if (generation !== cacheGeneration) throw new Error("Address operation was invalidated.");
};
const rpc = async (uid: string, name: string, args?: Record<string, unknown>) =>
    withBoundCustomerClient(uid, async (client) => throwIfError(await client.rpc(name, args)));

export const list: AddressRepository["list"] = async () => {
    const operation = captureOperation();
    let rows;
    try {
        rows = await rpc(operation.uid, "list_my_customer_addresses_v1");
    } catch (error) {
        if (operation.generation !== cacheGeneration || getTrustedCustomerUid() !== operation.uid) return [];
        throw error;
    }
    const addresses = rows.map(mapAddress);
    if (operation.generation !== cacheGeneration || getTrustedCustomerUid() !== operation.uid) return [];
    notify(operation.uid, addresses);
    return addresses;
};

export const create: AddressRepository["create"] = async (payload) => {
    const operation = captureOperation();
    const existing = await list();
    assertOperation(operation);
    const address: Address = {
        ...payload,
        id: payload.id || nanoid(),
        isDefault: existing.length === 0 || Boolean(payload.isDefault),
        createdAt: new Date().toISOString(),
    };
    await rpc(operation.uid, "create_my_customer_address_v1", {
        p_id: address.id, p_label: address.label, p_line1: address.line1,
        p_block: address.block || undefined, p_room: address.room || undefined,
        p_city: address.city, p_country: address.country, p_is_default: address.isDefault,
    });
    assertOperation(operation);
    const saved = await list();
    assertOperation(operation);
    return saved.find((item) => item.id === address.id) ?? address;
};

export const update: AddressRepository["update"] = async (payload) => {
    const operation = captureOperation();
    const existing = await list();
    assertOperation(operation);
    const previous = existing.find((address) => address.id === payload.id);
    if (!previous) throw new Error("Address not found.");
    await rpc(operation.uid, "update_my_customer_address_v1", {
        p_id: payload.id, p_label: payload.label, p_line1: payload.line1,
        p_block: payload.block || undefined, p_room: payload.room || undefined,
        p_city: payload.city, p_country: payload.country, p_is_default: payload.isDefault,
    });
    assertOperation(operation);
    const saved = await list();
    assertOperation(operation);
    return saved.find((item) => item.id === payload.id) ?? { ...payload, isDefault: previous.isDefault };
};

export const remove: AddressRepository["remove"] = async (id) => {
    const operation = captureOperation();
    await rpc(operation.uid, "delete_my_customer_address_v1", { p_id: id });
    assertOperation(operation);
    await list();
    assertOperation(operation);
};

export const setDefault: AddressRepository["setDefault"] = async (id) => {
    const operation = captureOperation();
    await rpc(operation.uid, "set_my_customer_default_address_v1", { p_address_id: id });
    assertOperation(operation);
    await list();
    assertOperation(operation);
};

export const syncUp: AddressRepository["syncUp"] = async () => {
    await list();
};
export const syncDown = syncUp;
export const clearSessionCache: AddressRepository["clearSessionCache"] = () => {
    cacheGeneration += 1;
    notify(null, []);
};
export const subscribe: AddressRepository["subscribe"] = (listener) => {
    listeners.add(listener);
    const uid = getTrustedCustomerUid();
    listener(uid && cacheOwnerUid === uid ? cache : []);
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

import { addressStore as firebaseAddressRepository } from "@/src/data/firebase/addressRepository";
import { selectRepository } from "./backendFlags";
import type { AddressRepository } from "./contracts";
import { supabaseAddressRepository } from "./supabase/addressRepository";

export const addressRepository = selectRepository<AddressRepository>("address", {
    firebase: firebaseAddressRepository,
    supabase: supabaseAddressRepository,
});

export const addressStore = addressRepository;
export type AddressStore = AddressRepository;

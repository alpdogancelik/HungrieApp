"use client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import { auth } from "./firebase";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(typeof window!=="undefined"&&(!url||!key))throw new Error("Missing Supabase public configuration");
export const supabase=createClient<Database>(url||"https://build-proof.supabase.co",key||"build-proof",{accessToken:async()=>auth.currentUser?auth.currentUser.getIdToken():null,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

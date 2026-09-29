"use client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@hungrie/database-types";
import { auth } from "./firebase";
import {resolveAdminEnvironment} from "./environmentConfig";
const runtime=resolveAdminEnvironment(process.env),url=runtime.supabaseUrl,key=runtime.supabaseKey;
if(typeof window!=="undefined"&&(!url||!key))throw new Error("Missing Supabase public configuration");
export const supabase=createClient<Database>(url,key,{accessToken:async()=>auth.currentUser?auth.currentUser.getIdToken():null,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

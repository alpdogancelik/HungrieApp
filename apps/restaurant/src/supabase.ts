import{createClient}from"@supabase/supabase-js";import type{Database}from"@hungrie/database-types";import{auth}from"./firebase";
const url=process.env.EXPO_PUBLIC_SUPABASE_URL||"https://build-proof.supabase.co",key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"build-proof";
export const supabase=createClient<Database>(url,key,{accessToken:async()=>auth.currentUser?auth.currentUser.getIdToken():null,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

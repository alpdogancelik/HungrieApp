import{createClient}from"@supabase/supabase-js";import type{Database}from"@hungrie/database-types";import{auth}from"./firebase";import{resolveRestaurantEnvironment}from"./environmentConfig";
const runtime=resolveRestaurantEnvironment(process.env),url=runtime.supabaseUrl,key=runtime.supabaseKey;
export const supabase=createClient<Database>(url,key,{accessToken:async()=>auth.currentUser?auth.currentUser.getIdToken():null,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

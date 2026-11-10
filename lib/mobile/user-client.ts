import {createClient as createCookieClient} from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
/** User-scoped RPC calls preserve auth.uid(), RLS, audit attribution and canonical locking. */
export async function mobileUserClient(request:NextRequest){
 if(!request.headers.has("authorization"))return createCookieClient();
 const {url,key}=getSupabasePublicConfig();
 return createClient(url,key,{global:{headers:{Authorization:request.headers.get("authorization")||""}},auth:{persistSession:false,autoRefreshToken:false}});
}

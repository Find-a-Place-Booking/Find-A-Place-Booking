import type {NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
export async function authenticateHostIdentity(request:NextRequest){
 const authorization=request.headers.get("authorization");const admin=createAdminClient();
 if(authorization!==null){
  if(!authorization.startsWith("Bearer ")||authorization.length>8200)return {ok:false as const,status:401,message:"Sign in to your host account."};
  const {data,error}=await admin.auth.getUser(authorization.slice(7).trim());
  if(error||!data.user)return {ok:false as const,status:401,message:"Your session expired. Sign in again."};
  return {ok:true as const,admin,userId:data.user.id};
 }
 // Cookie writes are allowed only from this site's own browser context.
 if(!["GET","HEAD","OPTIONS"].includes(request.method)){
  const origin=request.headers.get("origin");
  if(origin!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")return {ok:false as const,status:403,message:"Invalid request origin."};
 }
 const user=await createClient();const {data,error}=await user.auth.getUser();
 if(error||!data.user)return {ok:false as const,status:401,message:"Sign in to your host account."};
 return {ok:true as const,admin,userId:data.user.id};
}

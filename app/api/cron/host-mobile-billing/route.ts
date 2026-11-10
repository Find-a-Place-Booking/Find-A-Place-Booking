import {NextRequest,NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {stopPartnerMobileRenewal} from "@/lib/payments/host-mobile-billing";
export const runtime="nodejs";export const maxDuration=60;
export async function GET(r:NextRequest){
 if(!process.env.CRON_SECRET||r.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const admin=createAdminClient();
 const partners=await admin.from("organizations").select("id").eq("partner_status","VERIFIED").neq("status","ARCHIVED").limit(1001);
 if(partners.error||(partners.data||[]).length>=1000)return NextResponse.json({error:"Partner list unavailable"},{status:503});
 if(!partners.data?.length)return NextResponse.json({updated:0,failed:0});
 const rows=await admin.from("host_mobile_access").select("organization_id,stripe_customer_id,stripe_subscription_id").in("organization_id",partners.data.map(o=>o.id)).not("stripe_customer_id","is",null).not("stripe_subscription_id","is",null).eq("stripe_cancel_at_period_end",false).order("updated_at").limit(10);
 if(rows.error)return NextResponse.json({error:"Billing reconciliation unavailable"},{status:503});
 let updated=0,failed=0;
 for(const row of rows.data||[]){
  const org=await admin.from("organizations").select("id").eq("id",row.organization_id).eq("partner_status","VERIFIED").maybeSingle();
  if(org.error){failed++;continue}if(!org.data)continue;
  try{await stopPartnerMobileRenewal(row.organization_id,row.stripe_customer_id,row.stripe_subscription_id);if(row.stripe_subscription_id){const saved=await admin.from("host_mobile_access").update({stripe_cancel_at_period_end:true}).eq("organization_id",row.organization_id).eq("stripe_subscription_id",row.stripe_subscription_id);if(saved.error)throw saved.error}updated++}catch{failed++;await admin.from("host_mobile_access").update({updated_at:new Date().toISOString()}).eq("organization_id",row.organization_id)}
 }
 return NextResponse.json({updated,failed},{status:failed?503:200});
}

import {NextRequest,NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {stopPartnerMobileRenewal} from "@/lib/payments/host-mobile-billing";
export const runtime="nodejs";export const maxDuration=60;
export async function GET(r:NextRequest){
 if(!process.env.CRON_SECRET||r.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const admin=createAdminClient();
 const rows=await admin.from("host_mobile_access").select("organization_id,stripe_customer_id,stripe_subscription_id").not("stripe_customer_id","is",null).eq("stripe_cancel_at_period_end",false).limit(100);
 if(rows.error)return NextResponse.json({error:"Billing reconciliation unavailable"},{status:503});
 let updated=0,failed=0;
 for(const row of rows.data||[]){
  const org=await admin.from("organizations").select("id").eq("id",row.organization_id).eq("partner_status","VERIFIED").maybeSingle();
  if(org.error){failed++;continue}if(!org.data)continue;
  try{await stopPartnerMobileRenewal(row.organization_id,row.stripe_customer_id,row.stripe_subscription_id);if(row.stripe_subscription_id)await admin.from("host_mobile_access").update({stripe_cancel_at_period_end:true}).eq("organization_id",row.organization_id).eq("stripe_subscription_id",row.stripe_subscription_id);updated++}catch{failed++}
 }
 return NextResponse.json({updated,failed},{status:failed?503:200});
}

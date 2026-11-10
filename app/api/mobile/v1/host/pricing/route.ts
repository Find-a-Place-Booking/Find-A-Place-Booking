import {NextRequest} from "next/server";
import {authenticateMobileHost} from "@/lib/mobile/host-access";
import {mobileUserClient} from "@/lib/mobile/user-client";
import {mobileJson,mobileOptions} from "@/lib/mobile/http";
import {revalidatePath} from "next/cache";
export async function OPTIONS(r:NextRequest){return mobileOptions(r)}
async function context(r:NextRequest,unitId:unknown){
 const auth=await authenticateMobileHost(r);
 if(!auth.ok)return {error:mobileJson(r,{error:auth.message},auth.status)};
 if(!auth.access.allowed)return {error:mobileJson(r,{error:"Host app access required."},402)};
 if(typeof unitId!=="string"||!/^[0-9a-f-]{36}$/i.test(unitId))return {error:mobileJson(r,{error:"Choose a unit."},400)};
 const unit=await auth.admin.from("property_units").select("property_id").eq("id",unitId).maybeSingle();
 const prop=unit.data?await auth.admin.from("properties").select("id").eq("id",unit.data.property_id).eq("organization_id",auth.access.organizationId).maybeSingle():null;
 if(unit.error||prop?.error||!prop?.data)return {error:mobileJson(r,{error:"Unit not found."},404)};
 return {unitId};
}
export async function GET(r:NextRequest){
 const c=await context(r,r.nextUrl.searchParams.get("unitId"));if(c.error)return c.error;
 const result=await (await mobileUserClient(r)).rpc("host_pricing_bundle",{target_unit_id:c.unitId!});
 if(result.error)return mobileJson(r,{error:"Rates unavailable."},503);
 return mobileJson(r,{pricing:result.data});
}
export async function POST(r:NextRequest){
 const b=await r.json().catch(()=>null);const c=await context(r,b?.unitId);if(c.error)return c.error;
 if(!b?.pricing||typeof b.pricing!=="object")return mobileJson(r,{error:"Pricing required."},400);
 const fields=["weeknight","weekend","cleaning","pet","extraGuest","includedGuests","minimumStay"];
 const data:Record<string,string>={};
 for(const field of fields){const v=b.pricing[field];if(typeof v!=="string"||v.length>20||!/^\d*(\.\d{1,2})?$/.test(v))return mobileJson(r,{error:"Enter valid nonnegative rates."},400);data[field]=v;}
 if(!["PER_NIGHT","PER_PET_PER_STAY","FLAT_PER_STAY"].includes(b.pricing.petCalculation))return mobileJson(r,{error:"Invalid pet fee calculation."},400);
 data.petCalculation=b.pricing.petCalculation;
 const result=await (await mobileUserClient(r)).rpc("save_unit_base_pricing",{target_unit_id:c.unitId!,pricing_data:data});
 if(result.error)return mobileJson(r,{error:result.error.message},409);
 revalidatePath("/stays");revalidatePath("/host/rates");revalidatePath("/host/calendar");
 return mobileJson(r,{ok:true});
}

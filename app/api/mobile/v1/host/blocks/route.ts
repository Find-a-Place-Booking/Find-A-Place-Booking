import {NextRequest} from "next/server";
import {authenticateMobileHost} from "@/lib/mobile/host-access";
import {mobileUserClient} from "@/lib/mobile/user-client";
import {mobileJson,mobileOptions} from "@/lib/mobile/http";
export async function OPTIONS(r:NextRequest){return mobileOptions(r)}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(r:NextRequest){
 const auth=await authenticateMobileHost(r); if(!auth.ok)return mobileJson(r,{error:auth.message},auth.status);
 if(!auth.access.allowed)return mobileJson(r,{error:"Host app access required."},402);
 const props=await auth.admin.from("properties").select("id").eq("organization_id",auth.access.organizationId).neq("status","ARCHIVED");
 if(props.error)return mobileJson(r,{error:"Calendar unavailable."},503);
 const ids=(props.data||[]).map(p=>p.id); if(!ids.length)return mobileJson(r,{units:[],blocks:[]});
 const units=await auth.admin.from("property_units").select("id,property_id,name").in("property_id",ids).order("name");
 if(units.error)return mobileJson(r,{error:"Calendar unavailable."},503);
 const unitIds=(units.data||[]).map(u=>u.id); if(!unitIds.length)return mobileJson(r,{units:[],blocks:[]});
 const month=r.nextUrl.searchParams.get("month")||new Date().toISOString().slice(0,7);
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return mobileJson(r,{error:"Choose a valid month."},400);
 const start=month+"-01"; const endDate=new Date(start+"T12:00:00Z");endDate.setUTCMonth(endDate.getUTCMonth()+1);const end=endDate.toISOString().slice(0,10);
 const blocks=await auth.admin.from("availability_blocks").select("id,unit_id,block_type,start_date,end_date,label,expires_at")
   .in("unit_id",unitIds).eq("state","ACTIVE").lt("start_date",end).gt("end_date",start).order("start_date").limit(2000);
 if(blocks.error)return mobileJson(r,{error:"Calendar unavailable."},503);
 return mobileJson(r,{units:units.data,blocks:(blocks.data||[]).filter(b=>!b.expires_at||Date.parse(b.expires_at)>Date.now())});
}
export async function POST(r:NextRequest){
 const auth=await authenticateMobileHost(r); if(!auth.ok)return mobileJson(r,{error:auth.message},auth.status);
 if(!auth.access.allowed)return mobileJson(r,{error:"Host app access required."},402);
 const body=await r.json().catch(()=>null);
 if(!body||typeof body.unitId!=="string"||!uuid.test(body.unitId))return mobileJson(r,{error:"Choose a calendar."},400);
 const unit=await auth.admin.from("property_units").select("property_id").eq("id",body.unitId).maybeSingle();
 const prop=unit.data?await auth.admin.from("properties").select("id").eq("id",unit.data.property_id).eq("organization_id",auth.access.organizationId).maybeSingle():null;
 if(unit.error||prop?.error||!prop?.data)return mobileJson(r,{error:"Calendar not found."},404);
 const user=await mobileUserClient(r);
 if(body.action==="remove"){
  if(typeof body.blockId!=="string"||!uuid.test(body.blockId))return mobileJson(r,{error:"Choose an owner block."},400);
  const block=await auth.admin.from("availability_blocks").select("id").eq("id",body.blockId).eq("unit_id",body.unitId).eq("block_type","OWNER_BLOCK").eq("state","ACTIVE").maybeSingle();
  if(block.error||!block.data)return mobileJson(r,{error:"Only active owner blocks can be removed here."},404);
  const result=await user.rpc("cancel_owner_availability_block",{target_unit_id:body.unitId,target_block_id:body.blockId});
  if(result.error)return mobileJson(r,{error:result.error.message},409);
 }else if(body.action==="create"){
  const valid=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T12:00:00Z"))&&new Date(v+"T12:00:00Z").toISOString().slice(0,10)===v;
  if(!valid(body.start)||!valid(body.end)||body.end<=body.start)return mobileJson(r,{error:"Choose a valid date range."},400);
  const result=await user.rpc("create_owner_availability_block",{target_unit_id:body.unitId,block_start:body.start,block_end:body.end,block_label:typeof body.label==="string"?body.label.trim().slice(0,180):null});
  if(result.error)return mobileJson(r,{error:result.error.message},409);
 }else return mobileJson(r,{error:"Unknown calendar action."},400);
 return mobileJson(r,{ok:true});
}

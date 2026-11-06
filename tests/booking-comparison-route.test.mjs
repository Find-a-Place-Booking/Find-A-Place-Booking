import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=readFileSync(new URL('../app/api/booking/airbnb-comparison/route.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(js.diagnostics.length,0);
const baseQuote={quote:{currency:'USD',pre_tax_total_cents:30000,commission_base_cents:27000,lodging_subtotal_cents:27000,cleaning_fee_cents:3000,extra_guest_fee_cents:0,guest_service_fee_cents:0,fee_payer:'HOST'}};
const sampleUnit='00000000-0000-4000-8000-000000000111';
const q={unitId:sampleUnit,checkIn:'2026-12-11',checkOut:'2026-12-13',guests:'2'};
function request(x={}){return {nextUrl:{searchParams:new URLSearchParams({...q,...x})}};}
function setup({airbnb=false,listingId='12345678',cached=null,canClaim=true,fapQuote=baseQuote,directCents=37000}={}){
  const logs={rpc:[],queried:[],upserts:[],fetchCount:0};
  const unit={id:sampleUnit,property_id:'prop1',is_active:true};
  const rows={property_units:unit,properties:{status:'PUBLISHED',organization_id:'org1'},calendar_connections:airbnb?{feed_url:`https://www.airbnb.com/calendar/ical/${listingId}.ics?s=secret`}:null,organizations:{commission_tier:'PARTNER_5'},airbnb_price_comparisons:cached};
  const admin={
    from(name){
      logs.queried.push(name);
      const chain={
        select(){return this;},eq(){return this;},limit(){return this;},
        maybeSingle(){return Promise.resolve({data:rows[name],error:null});},
        upsert(value){logs.upserts.push(value);return Promise.resolve({data:null,error:null});},
      };
      return chain;
    },
    rpc(name,args){logs.rpc.push({name,args});if(name==='fap_quote_guest_checkout_estimate_v2')return Promise.resolve({data:fapQuote,error:null});if(name==='claim_airbnb_price_comparison')return Promise.resolve({data:canClaim,error:null});throw new Error('unrecognized rpc '+name)}
  };
  const models={
    'next/server':{NextResponse:{json(payload){return {body:payload};}}},
    '@/lib/bookings/airbnb-direct-pricing':{fetchInHouseAirbnbQuote:async()=>{logs.fetchCount++;return directCents?{cents:directCents,currency:'USD',observedAt:new Date().toISOString(),source:'DIRECT_PUBLIC_PAGE'}:null;}},
    '@/lib/bookings/airbnb-savings-estimate':{TYPICAL_AIRBNB_HOST_FEE_BPS:1550,estimateAirbnbDifference:({fapPreTaxTotalCents})=>({airbnbEquivalentTotalCents:fapPreTaxTotalCents+1200,estimatedSavingsCents:1200,assumptions:'SAME_HOST_PROCEEDS_BEFORE_PROCESSING'})},
    '@/lib/payments/booking-runtime':{stripeEnvironment:()=> 'LIVE'},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
  };
  const module={exports:{}};
  new Function('module','exports','require',js.outputText)(module,module.exports,k=>{if(!(k in models))throw Error('unmapped '+k);return models[k]});
  return {get:module.exports.GET,logs};
}
test('non-Airbnb stays receive explicitly estimated fee model and breakdown',async()=>{
  const {get,logs}=setup();const p=(await get(request())).body;
  assert.equal(p.available,true);assert.equal(p.comparisonType,'ESTIMATED');
  assert.equal(p.findAPlaceTotalCents,30000);assert.equal(p.breakdown.lodgingCents,27000);
  assert.equal(p.breakdown.cleaningCents,3000);assert.equal(p.hostFeeComparison.fapHostCommissionCents,1350);assert.ok(p.hostFeeComparison.modeledAirbnbHostFeeCents>0);assert.equal(logs.fetchCount,0);
});
test('linked stay never falls back to estimated quote if collector returns nothing',async()=>{
  const {get,logs}=setup({airbnb:true,directCents:null});const p=(await get(request())).body;
  assert.equal(p.available,false);assert.equal(logs.fetchCount,1);assert.equal(logs.upserts.length,0);
});
test('linked quote is obtained in-house and saved for two-hour cache',async()=>{
  const {get,logs}=setup({airbnb:true,directCents:37000});const p=(await get(request())).body;
  assert.equal(p.comparisonType,'VERIFIED');assert.equal(p.savingsCents,7000);
  assert.equal(p.breakdown.cleaningCents,3000);
  assert.equal(logs.upserts[0].total_cents,37000);assert.equal(logs.upserts[0].source,'DIRECT_PUBLIC_PAGE');
});
test('fresh price cache avoids second request',async()=>{
  const cached={listing_id:'12345678',total_cents:39000,currency:'USD',observed_at:new Date().toISOString(),price_basis:'BEFORE_TAXES',source:'DIRECT_PUBLIC_PAGE'};
  const {get,logs}=setup({airbnb:true,cached});const p=(await get(request())).body;
  assert.equal(p.comparisonType,'VERIFIED');assert.equal(p.savingsCents,9000);
  assert.equal(logs.fetchCount,0);assert.equal(logs.upserts.length,0);
});
test('throttle never causes a fabricated price',async()=>{
  const {get,logs}=setup({airbnb:true,canClaim:false});const p=(await get(request())).body;
  assert.equal(p.available,false);assert.equal(logs.fetchCount,0);
});
test('bad dates stop before database',async()=>{
  const {get,logs}=setup();const p=(await get(request({checkOut:'2026-12-10'}))).body;
  assert.equal(p.available,false);assert.equal(logs.queried.length,0);
});
test('missing quote does not create an estimated comparison',async()=>{
  const {get}=setup({fapQuote:{quote:{pre_tax_total_cents:null}}});const p=(await get(request())).body;
  assert.equal(p.available,false);
});

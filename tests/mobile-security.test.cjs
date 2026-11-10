const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:name=>{if(name in mocks)return mocks[name];throw Error(`Unmocked ${name}`)},Date,console,process,URL});return module.exports}
process.env.HOST_MOBILE_APP_ENABLED='true';
const policy=load('lib/host/mobile-access-policy.ts');
const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
for(const [name,input,expected]of [
 ['verified partner at any commission',{partnerStatus:'VERIFIED'},'PARTNER'],
 ['unverified former partner',{partnerStatus:'PENDING'},'LOCKED'],
 ['active paid period',{stripeSubscriptionStatus:'active',subscriptionExpiresAt:future},'SUBSCRIBED'],
 ['cancelled subscription',{stripeSubscriptionStatus:'canceled',subscriptionExpiresAt:future},'LOCKED'],
 ['past due subscription',{stripeSubscriptionStatus:'past_due',subscriptionExpiresAt:future},'LOCKED'],
 ['expired paid period',{stripeSubscriptionStatus:'active',subscriptionExpiresAt:past},'LOCKED'],
 ['unexpired free trial',{trialExpiresAt:future},'TRIAL'],
 ['expired free trial',{trialExpiresAt:past},'LOCKED'],
])test(name,()=>assert.equal(policy.hostMobileAccessMode(input),expected));
function query(result){const q={then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};for(const name of ['select','eq','neq','in','order','limit','maybeSingle'])q[name]=()=>q;return q}
function authModule({members=[{organization_id:'org-a',role:'OWNER'}],org={id:'org-a',name:'Host',partner_status:'VERIFIED'},access=null,identity={id:'user-a'},accessError=null,adminError=null}={}){
 const admin={auth:{getUser:async()=>({data:{user:identity},error:null})},from:table=>query(table==='organization_members'?{data:members,error:null}:table==='organizations'?{data:org,error:null}:table==='host_mobile_access'?{data:access,error:accessError}:{data:null,error:adminError})};
 return load('lib/mobile/host-access.ts',{'@/lib/mobile/identity':{authenticateHostIdentity:async request=>{const header=request.headers.get('authorization');if(!header||!header.startsWith('Bearer ')||!identity)return {ok:false,status:401,message:'Sign in'};return {ok:true,admin,userId:identity.id}}},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/host/mobile-access-policy':policy,'@/lib/payments/host-mobile-billing':{stopPartnerMobileRenewal:async()=>{}}}).authenticateMobileHost;
}
function req(headers={authorization:'Bearer valid-token'}){return {headers:new Headers(headers)}}
test('missing bearer denied before database access',async()=>assert.equal((await authModule()(req({}))).status,401));
test('revoked identity denied',async()=>assert.equal((await authModule({identity:null})(req())).status,401));
test('organization spoof rejected',async()=>assert.equal((await authModule()(req({authorization:'Bearer token','x-fap-organization':'org-other'}))).status,403));
test('no membership denied',async()=>assert.equal((await authModule({members:[]})(req())).status,403));
test('partner entitlement independent of fee',async()=>{const r=await authModule()(req());assert.equal(r.ok,true);assert.equal(r.access.allowed,true);assert.equal(r.access.reason,'PARTNER')});
test('access lookup failure does not unlock host',async()=>assert.equal((await authModule({accessError:{message:'db down'}})(req())).status,503));
test('admin lookup failure does not grant admin',async()=>assert.equal((await authModule({adminError:{message:'db down'}})(req())).status,503));
test('expired trial does not unlock nonpartner',async()=>{const r=await authModule({org:{id:'org-a',name:'Host',partner_status:'NONE'},access:{trial_started_at:past,trial_expires_at:past}})(req());assert.equal(r.access.allowed,false);assert.equal(r.access.canStartTrial,false)});
const json=(r,body,status=200)=>({body,status}),http={mobileJson:json,mobileOptions:()=>({status:204})};
function blocks(auth,rpc){return load('app/api/mobile/v1/host/blocks/route.ts',{'@/lib/mobile/host-access':{authenticateMobileHost:async()=>auth},'@/lib/mobile/http':http,'@/lib/mobile/user-client':{mobileUserClient:()=>({rpc})}})}
test('calendar mutation denies locked host before RPC',async()=>{let called=false;const route=blocks({ok:true,access:{allowed:false}},()=>{called=true});assert.equal((await route.POST({})).status,402);assert.equal(called,false)});
test('calendar mutation denies invalid identity',async()=>{const route=blocks({ok:false,status:401,message:'Sign in'},()=>assert.fail('RPC called'));assert.equal((await route.POST({})).status,401)});
const stripe={subscriptions:{retrieve:async()=>({id:'sub',customer:'cus',metadata:{organization_id:'org',fap_product:'HOST_MOBILE'},status:'active',cancel_at_period_end:false}),update:async()=>{}},checkout:{sessions:{list:async()=>({data:[]}),expire:async()=>{}}}};
function billing(s){return load('lib/payments/host-mobile-billing.ts',{'@/lib/payments/stripe-checkout':{getStripeClient:()=>s}})}
test('partner transition cancels future app renewal',async()=>{let updated;const s={...stripe,subscriptions:{...stripe.subscriptions,update:async(id,data)=>{updated={id,data}}}};await billing(s).stopPartnerMobileRenewal('org','cus','sub');assert.equal(updated.id,'sub');assert.equal(updated.data.cancel_at_period_end,true)});
test('partner transition rejects another customer subscription',async()=>{await assert.rejects(billing(stripe).stopPartnerMobileRenewal('org','other','sub'),/ownership mismatch/)});
test('partner transition expires open app checkout only',async()=>{const expired=[];const s={...stripe,checkout:{sessions:{list:async()=>({data:[{id:'app',metadata:{fap_product:'HOST_MOBILE',organization_id:'org'}},{id:'booking',metadata:{fap_product:'BOOKING',organization_id:'org'}}]}),expire:async(id)=>expired.push(id)}}};await billing(s).stopPartnerMobileRenewal('org','cus',null);assert.deepEqual(expired,['app'])});

function identityModule(user){return load('lib/mobile/identity.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({auth:{getUser:async token=>({data:{user:token==='valid'?user:null},error:null})}})},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user},error:null})}})}}).authenticateHostIdentity}
function webRequest(method,origin,userHeaders={}){return {url:'https://www.findaplacebooking.com/api/mobile/v1/host/blocks',method,headers:new Headers({...userHeaders,...(origin?{origin}:{})})}}
test('guest without host session cannot authenticate cookie API',async()=>assert.equal((await identityModule(null)(webRequest('GET'))).status,401));
test('valid cookie session can authenticate same-origin API',async()=>assert.equal((await identityModule({id:'host'})(webRequest('POST','https://www.findaplacebooking.com'))).ok,true));
test('cross-site cookie mutation rejected before data access',async()=>assert.equal((await identityModule({id:'host'})(webRequest('POST','https://evil.example'))).status,403));
test('cookie mutation without origin rejected',async()=>assert.equal((await identityModule({id:'host'})(webRequest('POST'))).status,403));
test('invalid bearer does not fall back to valid browser cookies',async()=>assert.equal((await identityModule({id:'host'})(webRequest('POST',null,{authorization:'Bearer invalid'}))).status,401));
test('same-origin guest with no host membership still denied management',async()=>assert.equal((await authModule({members:[]})(req())).status,403));
test('configured price amount cannot exceed advertised price',async()=>{const s={...stripe,prices:{retrieve:async()=>({id:'price_wrong',active:true,type:'recurring',currency:'usd',unit_amount:999,recurring:{interval:'month',interval_count:1}})}};process.env.STRIPE_HOST_MOBILE_MONTHLY_PRICE_ID='price_wrong';await assert.rejects(billing(s).resolveHostMobilePrice('monthly'),/does not match/);delete process.env.STRIPE_HOST_MOBILE_MONTHLY_PRICE_ID});
function eventHarness({status='active',storedOrg='org',canonicalCustomer='cus'}={}){
 const updates=[];const sub={id:'sub',customer:canonicalCustomer,metadata:{fap_product:'HOST_MOBILE',organization_id:'org'},status,cancel_at_period_end:false,items:{data:[{current_period_end:Math.floor(Date.now()/1000)+3600}]}};
 const row={organization_id:storedOrg,stripe_subscription_id:'sub',stripe_subscription_status:'active',subscription_expires_at:future};
 const q={then:(resolve,reject)=>Promise.resolve({data:row,error:null}).then(resolve,reject),select(){return q},eq(){return q},maybeSingle(){return Promise.resolve({data:row,error:null})},update(data){updates.push(data);return q}};
 const admin={from:()=>q};const sdk={subscriptions:{retrieve:async()=>sub}};
 const mod=load('lib/payments/host-app-events.ts',{'@/lib/payments/stripe-checkout':{getStripeClient:()=>sdk},'@/lib/supabase/admin':{createAdminClient:()=>admin}});
 return {mod,updates};
}
test('invoice renewal refreshes canonical subscription access',async()=>{const h=eventHarness();assert.equal(await h.mod.handleHostAppStripeEvent({type:'invoice.paid',data:{object:{parent:{subscription_details:{subscription:'sub'}}}}}),'processed');assert.equal(h.updates[0].stripe_subscription_status,'active');assert.ok(h.updates[0].subscription_expires_at)});
test('failed invoice removes access when canonical subscription past due',async()=>{const h=eventHarness({status:'past_due'});await h.mod.handleHostAppStripeEvent({type:'invoice.payment_failed',data:{object:{parent:{subscription_details:{subscription:'sub'}}}}});assert.equal(h.updates[0].subscription_expires_at,null)});
test('stale subscription payload cannot overwrite canonical state',async()=>{const h=eventHarness();await h.mod.handleHostAppStripeEvent({type:'customer.subscription.deleted',data:{object:{id:'sub',status:'canceled'}}});assert.equal(h.updates[0].stripe_subscription_status,'active')});
test('webhook cannot grant app access to mismatched organization',async()=>{const h=eventHarness({storedOrg:'other'});await assert.rejects(h.mod.reconcileHostAppSubscription('sub'),/does not match/);assert.equal(h.updates.length,0)});
test('connected-account events do not change platform app subscriptions',async()=>{const h=eventHarness();assert.equal(await h.mod.handleHostAppStripeEvent({account:'acct_connected',type:'customer.subscription.updated',data:{object:{id:'sub'}}}),'ignored');assert.equal(h.updates.length,0)});

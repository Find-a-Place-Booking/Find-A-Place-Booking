/**
 * Focused free-host/guest-app and shared booking chat regressions.
 * Run from project root: node --test tests/fap-free-apps-smoke.test.cjs
 * No real guests, payments, or bookings are modified.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');
const load = (file,mocks={}) => {
  const module={exports:{}};
  const js=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:(id)=>id in mocks?mocks[id]:require(id),process,console,Date,URL,Headers,Request,Response,AbortSignal,setTimeout,clearTimeout},{filename:file});
  return module.exports;
};
const reservationId='11111111-1111-4111-8111-111111111111';
const orgId='22222222-2222-4222-8222-222222222222';
const otherOrg='33333333-3333-4333-8333-333333333333';

// Never infer host authority from the app URL or a claimed organization ID.
function hostAdmin({memberships=[{organization_id:orgId,role:'OWNER'}],partner_status='NONE',archived=false}={}) {
  const calls=[];
  return {
    calls,
    from(name) {
      calls.push(['table',name]);
      const query={
        select:()=>query,
        eq:()=>query,
        in:()=>query,
        order:()=>query,
        neq:()=>query,
        maybeSingle:async()=>({data:name==='organizations'&&!archived?{id:orgId,name:'Owner Org',partner_status}:null,error:null}),
        then:(yes,no)=>Promise.resolve({data:name==='organization_members'?memberships:[],error:null}).then(yes,no),
      };
      return query;
    },
  };
}

function hostAuth({auth=true,memberships,partner_status,archived,requestOrg}={}) {
  const admin=hostAdmin({memberships,partner_status,archived});
  const mod=load('lib/mobile/host-access.ts',{
    '@/lib/mobile/identity':{authenticateHostIdentity:async()=> auth?{ok:true,admin,userId:'current-host'}:{ok:false,status:401,message:'Sign in'}},
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
  });
  const headers=new Headers(requestOrg?{'x-fap-organization':requestOrg}:{});
  return mod.authenticateMobileHost({headers});
}

test('free host app entitlement does not depend on partner, trial, or subscription',()=>{
  const policy=load('lib/host/mobile-access-policy.ts');
  assert.equal(policy.hostMobileAccessMode({partnerStatus:'VERIFIED',stripeSubscriptionStatus:null,trialExpiresAt:null,subscriptionExpiresAt:null}),'PARTNER');
  assert.equal(policy.hostMobileAccessMode({partnerStatus:'NONE',stripeSubscriptionStatus:'canceled',trialExpiresAt:null,subscriptionExpiresAt:null}),'FREE');
  assert.equal(policy.hostMobileAccessMode({partnerStatus:null,stripeSubscriptionStatus:null,trialExpiresAt:null,subscriptionExpiresAt:null}),'FREE');
  assert.equal(load('lib/payments/host-mobile-billing.ts',{'@/lib/payments/stripe-checkout':{getStripeClient:()=>({})}}).mobileBillingEnabled(),false);
});

test('host owner/manager membership still required; guest and other organization denied',async()=>{
  const standard=await hostAuth();
  assert.equal(standard.ok,true);assert.equal(standard.access.allowed,true);assert.equal(standard.access.reason,'FREE');
  const manager=await hostAuth({memberships:[{organization_id:orgId,role:'MANAGER'}]});
  assert.equal(manager.ok,true);assert.equal(manager.access.isOwner,false);
  const partner=await hostAuth({partner_status:'VERIFIED'});
  assert.equal(partner.ok,true);assert.equal(partner.access.reason,'PARTNER');
  const guest=await hostAuth({auth:false});assert.equal(guest.status,401);
  const noMember=await hostAuth({memberships:[]});assert.equal(noMember.status,403);
  const crossOrg=await hostAuth({requestOrg:otherOrg});assert.equal(crossOrg.status,403);
  const inactive=await hostAuth({archived:true});assert.equal(inactive.status,503);
});

function sharedDb() {
  const messages=[];
  const conversations=[];
  const notifications=[];
  const writes=[];
  let num=0;
  function from(table) {
    const query={table,filters:[],action:'select',payload:null,
      select(){return this},
      eq(key,value){this.filters.push({kind:'eq',key,value});return this},
      is(key,value){this.filters.push({kind:'is',key,value});return this},
      order(key,options={}){this.orderBy={key,ascending:options.ascending!==false};return this},limit(){return this},
      insert(payload){this.action='insert';this.payload=payload;return this},
      update(payload){this.action='update';this.payload=payload;return this},
      async maybeSingle(){const response=await this.run();return {data:response.data?.[0]||null,error:response.error}},
      async single(){const response=await this.run();return {data:response.data?.[0]||null,error:response.error}},
      then(ok,bad){return this.run().then(ok,bad)},
      async run(){
        const rows=table==='reservations'?[{id:reservationId,organization_id:orgId,status:'CONFIRMED',confirmation_code:'FAP-TEST'}]:table==='reservation_conversations'?conversations:table==='reservation_messages'?messages:[];
        const match=(row)=>this.filters.every(f=>f.kind==='eq'?row[f.key]===f.value:row[f.key]==null);
        if(this.action==='insert') {
          if(table==='reservation_conversations'&&conversations.some(x=>x.reservation_id===this.payload.reservation_id))return {data:null,error:{message:'already exists'}};
          const inserted={id:'row-'+(++num),created_at:new Date(Date.now()+num*1000).toISOString(),...this.payload};rows.push(inserted);writes.push([table,'insert',inserted]);return {data:[inserted],error:null};
        }
        if(this.action==='update') {
          const changed=rows.filter(match);
          for(const row of changed)Object.assign(row,this.payload);
          writes.push([table,'update',this.filters]);return {data:changed,error:null};
        }
        const selected=rows.filter(match).map(row=>({...row}));
        if(this.orderBy)selected.sort((a,b)=>{const c=String(a[this.orderBy.key]||'').localeCompare(String(b[this.orderBy.key]||''));return this.orderBy.ascending?c:-c});
        return {data:selected,error:null};
      },
    };
    return query;
  }
  return {admin:{from},user:{from},messages,conversations,notifications,writes};
}
function fakeRequest(api,params={},body=null) {
  const url=new URL('https://www.findaplacebooking.com'+api);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  return {nextUrl:url,headers:new Headers({'origin':url.origin}),json:async()=>body,method:body?'POST':'GET'};
}

function chatHandlers(db) {
  const mobileHttp={
    mobileJson:(request,data,status=200)=>Response.json(data,{status}),
    mobileOptions:async()=>new Response(null,{status:204}),
    readMobileObject:async(request)=>({ok:true,body:await request.json()}),
  };
  const notify={sendReservationMessageNotification:async(_admin,info)=>{db.notifications.push(info)}};
  const host=load('app/api/mobile/v1/host/messages/route.ts',{
    '@/lib/mobile/host-access':{authenticateMobileHost:async()=>({ok:true,admin:db.admin,access:{allowed:true,organizationId:orgId,userId:'current-host'}})},
    '@/lib/mobile/http':mobileHttp,
    '@/lib/mobile/user-client':{mobileUserClient:async()=>db.user},
    '@/lib/notifications/message-emails':notify,
  });
  const guest=load('app/api/trip/messages/route.ts',{
    'next/server':{NextResponse:{json:(data,{status=200}={})=>Response.json(data,{status})}},
    '@/lib/payments/booking-runtime':{guestCheckoutTokenMatches:(id,token)=>id===reservationId&&token==='valid-guest-token',sameOrigin:()=>true},
    '@/lib/supabase/admin':{createAdminClient:()=>db.admin},
    '@/lib/notifications/message-emails':notify,
  });
  return {host,guest};
}

test('guest and host app messages share one reservation thread with notifications both directions',async()=>{
  const db=sharedDb();const {host,guest}=chatHandlers(db);
  let r=await guest.POST(fakeRequest('/api/trip/messages',{}, {reservationId,checkoutToken:'valid-guest-token',message:'Guest question'}));
  assert.equal(r.status,200);
  r=await host.GET(fakeRequest('/api/mobile/v1/host/messages',{reservationId}));
  assert.equal(r.status,200);assert.equal((await r.json()).messages[0].body,'Guest question');
  r=await host.POST(fakeRequest('/api/mobile/v1/host/messages',{}, {reservationId,message:'Host response'}));
  assert.equal(r.status,200);
  r=await guest.GET(fakeRequest('/api/trip/messages',{reservationId,checkoutToken:'valid-guest-token'}));
  assert.deepEqual((await r.json()).messages.map(m=>m.body),['Guest question','Host response']);
  assert.equal(db.notifications.length,2);
  assert.equal(db.notifications[0].senderType,'GUEST');
  assert.equal(db.notifications[1].senderType,'HOST');
  assert.equal(db.conversations.length,1);
});

test('host marks guest messages read through authorized server write, not unsupported user UPDATE',async()=>{
  const db=sharedDb();const {host,guest}=chatHandlers(db);
  await guest.POST(fakeRequest('/api/trip/messages',{}, {reservationId,checkoutToken:'valid-guest-token',message:'Hello'}));
  const r=await host.POST(fakeRequest('/api/mobile/v1/host/messages',{}, {reservationId,action:'read'}));
  assert.equal(r.status,200);assert.ok(db.messages[0].read_by_host_at);
  assert.ok(db.writes.some(([table,kind,filters])=>table==='reservation_messages'&&kind==='update'&&filters.some(f=>f.key==='sender_type'&&f.value==='GUEST')));
});

test('guest without a valid booking token cannot read or send messages',async()=>{
  const db=sharedDb();const {guest}=chatHandlers(db);
  const get=await guest.GET(fakeRequest('/api/trip/messages',{reservationId,checkoutToken:'bad'}));
  assert.equal(get.status,403);
  const post=await guest.POST(fakeRequest('/api/trip/messages',{}, {reservationId,checkoutToken:'bad',message:'Unauthorized'}));
  assert.equal(post.status,403);assert.equal(db.messages.length,0);
});

test('guest and host app installation pages stay separate and have no price copy',()=>{
  const apps=read('app/apps/page.tsx');
  assert.ok(apps.includes('href="/apps/guest"'));
  assert.ok(apps.includes('href="/host/mobile"'));
  assert.doesNotMatch(apps,/subscribe|trial or|\$4\.99|\$29\.99|\$39\.99/i);
  assert.doesNotMatch(read('app/host/mobile/page.tsx'),/subscribe|\$4\.99|\$29\.99|\$39\.99|checkout/i);
  assert.match(read('components/webapp/HostWebApp.tsx'),/Host app · Free/);
});

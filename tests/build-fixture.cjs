/** Static-render QA fixture. Never enable on a deployment or use with real credentials. */
if(process.env.FAP_QA_BUILD_FIXTURE!=='1')throw Error('Build fixture requires explicit QA opt-in');
globalThis.fetch=async function fixtureFetch(input,options={}){
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.hostname!=='qa-fixture.supabase.co')throw Error('Fixture build blocked unexpected outbound request: '+url.hostname);
 if(!url.pathname.startsWith('/rest/v1/'))throw Error('Fixture build does not emulate authentication or mutations');
 const method=(options.method||input.method||'GET').toUpperCase();
 // Supabase RPC reads use POST; empty public fixture data is intentionally sufficient for prerender.
 if(!['GET','HEAD','POST'].includes(method))throw Error('Fixture build blocked mutation');
 if(method==='POST'&&!url.pathname.startsWith('/rest/v1/rpc/'))throw Error('Fixture build blocked table write');
 return new Response(method==='HEAD'?null:'[]',{status:200,headers:{'content-type':'application/json','content-range':'*/0'}});
};

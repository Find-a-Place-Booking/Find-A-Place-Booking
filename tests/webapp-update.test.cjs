const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.deepEqual(out.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  vm.runInNewContext(out.outputText, {
    module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name),
    process: { env: { NEXT_PUBLIC_FAP_WEBAPP_RELEASE: 'release-a' } },
    Response, AbortController, fetch, Date, console, ...globals,
  });
  return module.exports;
}
const util = load('lib/webapp/update.ts');
test('release checker requests current deployment without credentials or cache', async () => {
  const signal = new AbortController().signal;
  const result = await util.checkWebAppRelease('release-a', async (url, options) => {
    assert.equal(url, '/api/mobile/v1/app-version');
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.signal, signal);
    return Response.json({ version: 'release-b' });
  }, signal);
  assert.equal(result.state, 'available');
  assert.equal(result.version, 'release-b');
});
test('matching release is current; changed ID including rollback is available', async () => {
  assert.equal((await util.checkWebAppRelease('release-a', async () => Response.json({ version: 'release-a' }))).state, 'current');
  assert.equal((await util.checkWebAppRelease('release-b', async () => Response.json({ version: 'release-a' }))).state, 'available');
});
test('invalid and unavailable responses fail without inventing an update', async () => {
  for (const reply of [Response.json({}), Response.json({ version: null }), Response.json({ version: '<script>' }), new Response('<html>', { status: 200 }), new Response('', { status: 503 })]) {
    await assert.rejects(util.checkWebAppRelease('release-a', async () => reply));
  }
  await assert.rejects(util.checkWebAppRelease('', async () => assert.fail('invalid local version should not fetch')));
  await assert.rejects(util.checkWebAppRelease('release-a', async () => { throw Error('network down'); }));
});
test('public version endpoint serves only the build ID with no-store headers', async () => {
  const route = load('app/api/mobile/v1/app-version/route.ts', { '@/lib/webapp/update': util });
  const r = route.GET();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { version: 'release-a' });
  for (const h of ['cache-control','cdn-cache-control','vercel-cdn-cache-control']) assert.match(r.headers.get(h), /no-store/);
  const missing = load('app/api/mobile/v1/app-version/route.ts', { '@/lib/webapp/update': { ...util, WEBAPP_RELEASE: '' } });
  assert.equal(missing.GET().status, 503);
});
test('deployment release changes on different deployments and is opaque', () => {
  const config = id => load('next.config.ts', {}, { process: { env: { VERCEL_DEPLOYMENT_ID: id, NODE_ENV: 'production' } } }).default;
  const a = config('dpl_a'), b = config('dpl_b');
  assert.match(a.env.NEXT_PUBLIC_FAP_WEBAPP_RELEASE, /^[a-f0-9]{32}$/);
  assert.notEqual(a.env.NEXT_PUBLIC_FAP_WEBAPP_RELEASE, b.env.NEXT_PUBLIC_FAP_WEBAPP_RELEASE);
  assert.equal(a.env.NEXT_PUBLIC_FAP_WEBAPP_RELEASE, config('dpl_a').env.NEXT_PUBLIC_FAP_WEBAPP_RELEASE);
  assert.equal(a.experimental.serverActions.bodySizeLimit, '4mb');
});
test('host manifest preserves installed app identity and scope, refreshes icon URL', async () => {
  const manifest = load('app/apps/host/manifest.webmanifest/route.ts', { 'next/server': { NextResponse: Response } });
  const response = await manifest.GET(), data = await response.json();
  assert.equal(data.id, '/apps/host');
  assert.equal(data.scope, '/host/mobile');
  assert.equal(data.start_url, '/host/mobile/workspace');
  assert.equal(data.background_color, '#ffffff');
  assert.deepEqual(data.icons.map(i=>i.src), ['/webapps/icons/host-192.png?v=20261125-white','/webapps/icons/host-512.png?v=20261125-white']);
  assert.match(response.headers.get('cache-control'), /no-cache/);
});
// A small deterministic hook harness exercises the real component's handlers
// without a browser, dependency installation, or network requests.
function harness(app='host') {
  let cursor=0, effects=[], slots=[], tree, reloads=0, now=100000, version='release-b', fail=false;
  const events=new Map(), timers=new Map(); let timerId=0, checks=0;
  const navigator={onLine:true};
  const document={visibilityState:'visible',addEventListener:(n,f)=>events.set('doc:'+n,f),removeEventListener:n=>events.delete('doc:'+n)};
  const window={location:{reload:()=>reloads++},setTimeout:()=>++timerId,clearTimeout:()=>{},setInterval:f=>{timers.set(++timerId,f);return timerId},clearInterval:id=>timers.delete(id),addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
  const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useCallback(fn){const i=cursor++;if(!(i in slots))slots[i]=fn;return slots[i]},useEffect(fn){const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn)}}};
  const jsx=(type,props)=>({type,props});
  const mod=load('components/webapp/WebAppUpdates.tsx',{'react':hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'./WebAppUpdates.module.css':{},'@/lib/webapp/update':util},{navigator,document,window,fetch:async()=>{checks++;if(fail)throw Error('offline');return Response.json({version})},Date:{now:()=>now}});
  const render=()=>{cursor=0;tree=mod.WebAppUpdates({app});return tree};
  render();const cleanup=effects.map(f=>f());
  function walk(n,fn){if(Array.isArray(n))return n.forEach(x=>walk(x,fn));if(n&&typeof n==='object'){fn(n);walk(n.props?.children,fn)}}
  const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:n?.props?text(n.props.children):'';
  function click(label){render();let found;walk(tree,n=>{if(n.type==='button'&&text(n)===label)found=n});assert.ok(found,'button '+label);found.props.onClick()}
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {render,click,settle,read:()=>text(render()),setVersion:v=>version=v,setFail:v=>fail=v,navigator,document,events,timers,advance:ms=>now+=ms,checks:()=>checks,reloads:()=>reloads,cleanup:()=>cleanup.forEach(f=>f())};
}
test('new release is shown automatically; later and confirm never auto-reload', async () => {
  const h=harness();await h.settle();assert.match(h.read(), /Find A Place update available/);
  h.click('Later');assert.doesNotMatch(h.read(), /Find A Place update available/);assert.equal(h.reloads(),0);
  h.click('Check for updates');await h.settle();assert.match(h.read(), /Find A Place update available/);
  h.click('Update now');assert.match(h.read(), /Unsaved edits/);assert.equal(h.reloads(),0);
  h.click('Cancel');assert.equal(h.reloads(),0);h.click('Update now');h.click('I’ve saved — refresh');assert.equal(h.reloads(),1);
  h.cleanup();assert.equal(h.events.size,0);assert.equal(h.timers.size,0);
});
test('automatic check respects visibility, resumes and detects new release after dismiss', async () => {
  const h=harness('guest');await h.settle();h.click('Later');let checks=h.checks();
  h.advance(300000);h.document.visibilityState='hidden';[...h.timers.values()][0]();await h.settle();assert.equal(h.checks(),checks);
  h.document.visibilityState='visible';h.setVersion('release-c');h.events.get('doc:visibilitychange')();await h.settle();assert.equal(h.checks(),checks+1);assert.match(h.read(), /Find A Place update available/);
  h.click('Update now');h.navigator.onLine=false;h.click('I’ve saved — refresh');assert.equal(h.reloads(),0);assert.match(h.read(), /Reconnect/);
  h.cleanup();
});
test('manual check reports matching release and network errors; no update for guest account', async () => {
  const h=harness('guest');await h.settle();h.setVersion('release-a');h.click('Check for updates');await h.settle();assert.match(h.read(), /up to date/);assert.doesNotMatch(h.read(), /white host icon/);
  h.setFail(true);h.click('Check for updates');await h.settle();assert.match(h.read(), /Couldn't check/);assert.equal(h.reloads(),0);
  h.navigator.onLine=false;h.click('Check for updates');assert.match(h.read(), /offline/);h.cleanup();
});

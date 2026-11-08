const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
function loadTS(rel, libs={}) {
  const source = fs.readFileSync(path.join(root,rel),'utf8');
  const script = ts.transpileModule(source,{fileName:rel,compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  const module = { exports };
  vm.runInNewContext(script,{exports,module,require:(name)=>{
    if(libs[name]) return libs[name];
    throw new Error('Unexpected import '+name);
  },process:{env:{}}, console},{filename:rel,timeout:2000});
  return module.exports;
}
// Syntax parsing of new TS and TSX files (no entire application checkout needed).
for (const rel of ['lib/public/discovery-categories.ts','lib/public/buffalo-river-discovery.ts','components/HostResourcesMenu.tsx','app/property-managers/page.tsx']) {
  const file=ts.createSourceFile(rel,fs.readFileSync(path.join(root,rel),'utf8'),ts.ScriptTarget.Latest,true,rel.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(file.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[],`Parsing ${rel}`);
}
const {isUniqueStay,isLargeGroupStay}=loadTS('lib/public/discovery-categories.ts');
const mk=(type,sleeps,name='A Place',tags=[])=>({type,sleeps,name,tags});
assert.equal(isUniqueStay(mk('Glamping',2)),true);
assert.equal(isUniqueStay(mk('Tiny Home',2)),true);
assert.equal(isUniqueStay(mk('Cabin',4,'Normal cabin')),false);
assert.equal(isUniqueStay(mk('Cabin',4,'A-frame cabin',['A-frame'])),true);
assert.equal(isLargeGroupStay(mk('Cabin',10)),true);
assert.equal(isLargeGroupStay(mk('House',8)),true);
assert.equal(isLargeGroupStay(mk('RV Site',25)),false);
assert.equal(isLargeGroupStay(mk('Other',25,'Camping site 1-3')),false);
assert.equal(isLargeGroupStay(mk('Cabin',7)),false);
const fakeCatalog={propertyMatchesDestination:(p,d)=>`${p.city} ${p.location}`.toLowerCase().includes(d.toLowerCase())};
const nearby=loadTS('lib/public/buffalo-river-discovery.ts',{'@/data/catalog':fakeCatalog});
const p=(slug,lat,lng,city='Ozarks')=>({slug,lat,lng,city,location:city,state:'AR',region:'AR'});
(async()=>{
 const test=[p('upper',36.041,-93.345),p('middle',35.987,-92.763),p('lower',36.085,-92.566),p('far-away',34.5,-93.1)];
 const result=nearby.searchBuffaloRiverStays(test,'Buffalo National River',15);
 assert.equal(nearby.isBuffaloRiverSearch('Buffalo National River'),true);
 assert.equal(nearby.isBuffaloRiverSearch('Buffalo, NY'),false);
 assert.deepEqual(Array.from(result,r=>r.slug).sort(),['lower','middle','upper']);
 const small=nearby.searchBuffaloRiverStays(test,'Buffalo River',15);
 assert.equal(small.length,3);
 console.log('TS/TSX parsed; unique/group filters and 3-district Buffalo search passed');
})().catch(e=>{console.error(e); process.exit(1)});

// After APPLY_OVERLAY, confirm these are real browse chips and existing
// homepage stay-type buttons, not extra destination cards or plain text.
const home = fs.readFileSync(path.join(root,'app/page.tsx'),'utf8');
const staysPage = fs.readFileSync(path.join(root,'app/stays/page.tsx'),'utf8');
const results = fs.readFileSync(path.join(root,'components/StayResults.tsx'),'utf8');
for (const label of ['Buffalo National River','Unique stays','Group getaways']) {
  assert.ok(home.includes(`label: "${label}"`), `Missing homepage button: ${label}`);
}
for (const label of ['Buffalo National River','Unique stays','Sleeps 8+']) {
  assert.ok(results.includes(`"${label}"`), `Missing search-results chip: ${label}`);
  assert.ok(staysPage.includes(`"${label}":`), `Missing heading for filter: ${label}`);
}
assert.ok(home.includes('className="stay-type-card"'), 'Must reuse existing targeted buttons');
assert.ok(home.includes('{destinations.map('), 'Existing destinations must remain intact');
assert.ok(!home.includes('destination.name !== "Jasper"'), 'Jasper destination should not be hidden');
console.log('Homepage button + results chip wiring checked for all three categories');

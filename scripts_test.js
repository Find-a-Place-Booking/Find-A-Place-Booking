const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const dir = '/mnt/data/fap-home-nearby-overlay';
const sourceFiles = [
  'components/FindAPlacePartnerMap.tsx',
  'lib/public/nearby-destination-search.ts',
];
for (const p of sourceFiles) {
  const code = fs.readFileSync(`${dir}/${p}`,'utf8');
  const result = ts.transpileModule(code, {
    fileName: p,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics.length, 0, `Syntax/parse errors in ${p}: ${result.diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText, '\n'))}`);
}
const code = ts.transpileModule(fs.readFileSync(`${dir}/lib/public/nearby-destination-search.ts`,'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleOut = { exports: {} };
const sandbox = {
  module: moduleOut,
  exports: moduleOut.exports,
  console,
  process: { env: {} },
  URL,
  AbortSignal,
  fetch: async () => { throw new Error('Mock: geocoding unavailable'); },
  require: (name) => {
    if (name === '@/data/catalog') return {
      propertyMatchesDestination: (property, dest) => {
        if (!dest || /^(anywhere|anywhere nearby)$/i.test(dest)) return true;
        const text = [property.location, property.city, property.state, property.region].join(' ').toLowerCase();
        return text.includes(dest.toLowerCase());
      },
    };
    throw new Error('Unexpected require: '+name);
  },
};
vm.runInNewContext(code, sandbox);
const { searchPublishedStaysNearby, normalizeSearchRadiusMiles } = moduleOut.exports;
function stay(name,city,lat,lng,state='AR') {
  return { name, slug: name.toLowerCase().replace(/ /g,'-'), city, state, region:state==='AR'?'Arkansas':'Missouri', location: `${city}, ${state}`, lat, lng };
}
(async()=>{
  const records = [
    stay('Hot Springs cabin', 'Hot Springs', 34.5, -93.056),
    stay('Pearcy cottage', 'Pearcy', 34.447, -93.291),
    stay('Royal cabin', 'Royal', 34.51, -93.22),
    stay('Mount Ida stay','Mount Ida',34.56,-93.63),
    stay('Hollister stay','Hollister',36.62,-93.218,'MO'),
    stay('Branson stay','Branson',36.64,-93.22,'MO'),
    stay('Jasper escape','Jasper',36.01,-93.185),
    stay('Amity cabin','Amity',34.27,-93.46),
  ];
  let results=await searchPublishedStaysNearby(records, 'Hot Springs', 40);
  assert(results.usedNearby);
  assert(results.properties.some(p=>p.name==='Pearcy cottage'));
  assert(results.properties.some(p=>p.name==='Royal cabin'));
  assert(!results.properties.some(p=>p.name==='Branson stay'));
  results=await searchPublishedStaysNearby(records, 'Hot Springs, AR',15);
  assert(!results.properties.some(p=>p.name==='Mount Ida stay'));
  results=await searchPublishedStaysNearby(records,'Branson',40);
  assert(results.properties.some(p=>p.name==='Hollister stay'));
  results=await searchPublishedStaysNearby(records,'Lake Ouachita',40);
  assert(results.properties.some(p=>p.name==='Mount Ida stay'));
  results=await searchPublishedStaysNearby(records,'Amity',40);
  assert(results.properties.some(p=>p.name==='Amity cabin'));
  results=await searchPublishedStaysNearby(records,'Anywhere',40);
  assert(results.properties.length===records.length);
  assert.equal(normalizeSearchRadiusMiles('50'),40);
  assert.equal(normalizeSearchRadiusMiles('100'),100);
  console.log('PASS: TypeScript parsing, known destination regions, freeform towns, radius limits, empty/anywhere, fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});

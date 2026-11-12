const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/NightlySavingsPreview.tsx'), 'utf8');
const parsed = ts.createSourceFile('NightlySavingsPreview.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0, 'New preview TSX parses');
const transpiled = ts.transpileModule(source, {
 compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
 reportDiagnostics: true,
});
assert.equal((transpiled.diagnostics || []).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const m = {exports:{}};
const illustrativeModel = ({fapPreTaxTotalCents,lodgingBaseCents, guestServiceFeeCents}) => {
 assert.equal(fapPreTaxTotalCents, lodgingBaseCents+guestServiceFeeCents);
 const other = Math.round(lodgingBaseCents / .845);
 return {estimatedSavingsCents: other-fapPreTaxTotalCents};
};
const mockRequire = (id) => {
 if(id==='@/lib/bookings/airbnb-savings-estimate') return {estimateAirbnbDifference: illustrativeModel};
 if(id.endsWith('NightlySavingsPreview.module.css')) return {default:{preview:'x',minimal:'y'}};
 if(id==='react/jsx-runtime') return {jsx:(tag,props)=>({tag,props}),jsxs:(tag,props)=>({tag,props})};
 throw Error('Unexpected dependency: '+id);
};
vm.runInNewContext(transpiled.outputText,{module:m,exports:m.exports,require:mockRequire,Math,Number});
assert.equal(m.exports.getIllustrativeNightlySavings(100),11);
assert.equal(m.exports.getIllustrativeNightlySavings(200),22);
assert.equal(m.exports.getIllustrativeNightlySavings(0),null);
assert.equal(m.exports.getIllustrativeNightlySavings(-50),null);
assert.equal(m.exports.getIllustrativeNightlySavings(NaN),null);
assert.equal(m.exports.getIllustrativeNightlySavings(100_001),null);
let jsx=m.exports.NightlySavingsPreview({nightlyPriceUsd:100});
assert.ok(JSON.stringify(jsx).includes('11'), 'preview displays the modeled savings amount');
jsx=m.exports.NightlySavingsPreview({nightlyPriceUsd:0});
assert.equal(jsx,null);
const patched = fs.readFileSync(path.join(root,'APPLY_IMMEDIATE_PRICES.py'),'utf8');
assert.ok(patched.includes('className={styles.comparisonImmediate}'));
assert.ok(patched.includes('NightlySavingsPreview nightlyPriceUsd={price}'));
assert.ok(patched.includes('NightlySavingsPreview nightlyPriceUsd={property.price} minimal'));
assert.ok(patched.includes('NightlySavingsPreview nightlyPriceUsd={s.startingNightlyUsd} minimal'));
assert.ok(patched.includes('NightlySavingsPreview nightlyPriceUsd={detail.startingNightlyUsd}'));
console.log('PASS nightly savings $100 and $200; low/invalid prices; JSX preview; all price placements');

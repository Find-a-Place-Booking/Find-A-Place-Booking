import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/bookings/airbnb-direct-pricing.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(js.diagnostics?.length || 0,0);
const module = {exports:{}};
new Function('module','exports','require',js.outputText)(module,module.exports,require);
const {parseExactAirbnbQuote,parsePublicPageQuote}=module.exports;
const query={listingId:'12345678',checkIn:'2026-12-11',checkOut:'2026-12-14',guests:2};
const exact={listing_id:'12345678',check_in:'2026-12-11',check_out:'2026-12-14',adults:2,currency:'USD',total_before_taxes:650.42};
test('accepts exact linked guest quote',()=>assert.equal(parseExactAirbnbQuote(exact,query),65042));
test('rejects mismatched date',()=>assert.equal(parseExactAirbnbQuote({...exact,check_out:'2026-12-15'},query),null));
test('rejects mismatched guest count',()=>assert.equal(parseExactAirbnbQuote({...exact,adults:3},query),null));
test('rejects different Airbnb property',()=>assert.equal(parseExactAirbnbQuote({...exact,listing_id:'12345679'},query),null));
test('rejects nightly-only prices',()=>assert.equal(parseExactAirbnbQuote({...exact,total_before_taxes:undefined,price:217},query),null));
test('rejects missing currency',()=>assert.equal(parseExactAirbnbQuote({...exact,currency:undefined},query),null));
test('rejects tax-inclusive opaque total',()=>assert.equal(parseExactAirbnbQuote({...exact,total_before_taxes:undefined,total:675},query),null));
test('rejects unavailable dates',()=>assert.equal(parseExactAirbnbQuote({...exact,available:false},query),null));
test('nested JSON script supported',()=>assert.equal(parsePublicPageQuote(`<html><script type="application/json">${JSON.stringify({listing:exact})}</script></html>`,query),65042));
test('text in HTML cannot spoof a price',()=>assert.equal(parsePublicPageQuote(`<html>${JSON.stringify(exact)}</html>`,query),null));

test('never mistakes a recommended listing price for the booked listing price',()=>{
  const payload={...exact,total_before_taxes:undefined,recommended_stays:[{total_before_taxes:450,currency:'USD'}]};
  assert.equal(parseExactAirbnbQuote(payload,query),null);
});

test('pricing child may inherit listing/date context',()=>{
  const payload={...exact,total_before_taxes:undefined,quote:{total_before_taxes:655.50}};
  assert.equal(parseExactAirbnbQuote(payload,query),65550);
});

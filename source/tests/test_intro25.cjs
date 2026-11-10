// Run after overlay application: node tests/test_intro25.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
for(const p of [
  'components/IntroMarketingForm.tsx',
  'lib/public/intro-offers.ts',
  'lib/notifications/host-marketing.ts',
  'app/host/marketing/page.tsx',
  'app/host/marketing/actions.ts',
  'components/PropertyCard.tsx',
  'app/host/onboarding/page.tsx',
  'components/GuestCheckout.tsx',
  'app/api/booking/hold/route.ts',
  'app/checkout/page.tsx'
]){
  const source=read(p);
  const tree=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(tree.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')),[],`${p} contains syntax errors`);
}
const sql=read('supabase/migrations/20261110050000_new_host_intro_25_three_stays.sql');
assert.match(sql,/intro_discount_enabled boolean not null default false/);
assert.match(sql,/max_redemptions.*is_active/is);
assert.match(sql,/3-confirmed_count/);
assert.match(sql,/promo\.redemption_count < promo\.max_redemptions/);
assert.match(sql,/reserved_until>now\(\)/);
assert.match(sql,/p\.status='PUBLISHED'/);
assert.match(sql,/m\.role='OWNER'/);
assert.match(sql,/revoke all on public\.host_marketing_ad_requests from public, anon, authenticated/);
assert.match(sql,/after insert or update of is_primary,is_active on public\.property_units/);
assert.match(read('app/api/booking/hold/route.ts'),/requested_promotion_code: body\.promotionCode\?\.trim\(\) \|\| systemIntroOffer\?\.code \|\| null/);
assert.match(read('app/checkout/page.tsx'),/promotion_code: input\.promotionCode \|\| null/);
assert.match(read('components/GuestCheckout.tsx'),/useState\(initialPromotionCode\)/);
assert.match(read('components/PropertyCard.tsx'),/introOfferRemaining/);
assert.match(read('app/host/onboarding/page.tsx'),/IntroMarketingForm/);
assert.match(read('components/IntroMarketingForm.tsx'),/extra === "YES"/);
assert.match(read('lib/notifications/host-marketing.ts'),/gezplus4@yahoo\.com/);
assert.match(read('lib/notifications/host-marketing.ts'),/fancyhillcabinsandrvpark@gmail\.com/);
console.log('Intro25 source syntax and integration checks passed. Still run full project typecheck/build and live sandbox checkout QA.');

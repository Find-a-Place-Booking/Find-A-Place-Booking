import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const home = resolve('app/page.tsx');
const selector = resolve('lib/public/featured-launch-cabins.ts');

test('homepage never uses unfiltered inventory in featured areas', () => {
  const s = readFileSync(home, 'utf8');
  assert.ok(s.includes('getPublishedProperties({ featuredPriority: true })'));
  assert.ok(s.includes('selectLaunchPartnerCabins(published)'));
  assert.doesNotMatch(s, /const featuredStay = published\[0\]/);
  assert.doesNotMatch(s, /const primaryStays = published\.slice/);
  assert.doesNotMatch(s, /const moreStays = published\.slice/);
});

test('selector enforces published verified partner cabins', () => {
  const s = readFileSync(selector, 'utf8');
  for (const term of ['.eq("status", "PUBLISHED")', '.eq("homepage_feature_priority", 1)', '.eq("property_type", "Cabin")', '.eq("partner_status", "VERIFIED")', 'return []']) assert.ok(s.includes(term), `missing ${term}`);
});

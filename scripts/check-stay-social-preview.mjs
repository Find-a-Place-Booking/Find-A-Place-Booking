#!/usr/bin/env node
/*
  Run after production deploy:
  node scripts/check-stay-social-preview.mjs the-40-steps-cabin paradiso lone-cedar-cabin-at-lone-cedar-cabins
  No credentials, mutations or third-party packages.
*/
const slugs = process.argv.slice(2);
if (!slugs.length) {
  console.error('Usage: node scripts/check-stay-social-preview.mjs <stay-slug> [stay-slug ...]');
  process.exitCode = 2;
} else {
  const base = 'https://www.findaplacebooking.com';
  const agent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  let failures = 0;
  const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
  function meta(html, property) {
    const tags = [...html.matchAll(/<meta\s+[^>]*>/gi)].map(m => m[0]);
    for (const tag of tags) {
      const attrs = Object.fromEntries(
        [...tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), decode(m[3])]),
      );
      if (attrs.property === property || attrs.name === property) return attrs.content ?? null;
    }
    return null;
  }
  for (const slug of slugs) {
    try {
      const pageUrl = `${base}/stays/${encodeURIComponent(slug)}`;
      const page = await fetch(pageUrl, { headers: { 'User-Agent': agent }, redirect: 'follow' });
      const html = await page.text();
      const imageUrl = meta(html, 'og:image');
      const twitterImage = meta(html, 'twitter:image');
      const title = meta(html, 'og:title');
      if (!page.ok) throw Error(`page HTTP ${page.status}`);
      if (!imageUrl?.startsWith(`${base}/stay-preview/${encodeURIComponent(slug)}?v=`)) {
        throw Error(`incorrect og:image: ${imageUrl || '(missing)'}`);
      }
      if (twitterImage !== imageUrl) throw Error(`twitter:image differs: ${twitterImage}`);
      const response = await fetch(imageUrl, { headers: { 'User-Agent': agent, Accept: 'image/jpeg,image/png,image/webp,image/*' }, redirect: 'follow' });
      const mime = response.headers.get('content-type') ?? '';
      const body = await response.arrayBuffer();
      if (!response.ok || !mime.startsWith('image/') || body.byteLength < 10_000) {
        throw Error(`image HTTP ${response.status}, content-type ${mime}, bytes ${body.byteLength}`);
      }
      console.log(`PASS ${slug} — ${title} — HTTP ${response.status} ${mime} ${body.byteLength} bytes — ${imageUrl}`);
    } catch (e) {
      failures++;
      console.error(`FAIL ${slug}: ${e.message}`);
    }
  }
  if (failures) process.exitCode = 1;
}

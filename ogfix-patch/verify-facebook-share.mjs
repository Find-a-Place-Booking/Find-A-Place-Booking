// Run AFTER Vercel deployment: node verify-facebook-share.mjs
const origin = "https://www.findaplacebooking.com";
const slugs = [
  "livingston-junction-cabooses-and-cabins",
  "lil-rustic",
  "lone-cedar-cabins-oak-ridge-cabin",
];
const fb = { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" };
let failed = false;

for (const slug of slugs) {
  const imageUrl = `${origin}/stay-share/${slug}`;
  const pageUrl = `${origin}/stays/${slug}`;
  const page = await fetch(pageUrl, { headers: fb, redirect: "follow" });
  const html = await page.text();
  const metaOK = html.includes(imageUrl);
  const image = await fetch(imageUrl, { headers: fb, redirect: "follow" });
  const ab = await image.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const type = image.headers.get("content-type") ?? "";
  const binaryOK = (png && type.startsWith("image/png")) || (jpg && type.startsWith("image/jpeg"));
  const ok = page.status === 200 && image.status === 200 && metaOK && binaryOK && bytes.length <= 8 * 1024 * 1024;
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"} ${slug}: page=${page.status}, correct_og_url=${metaOK}, image=${image.status}, type=${type}, size=${bytes.length}, genuine_image_bytes=${binaryOK}`);
}
if (failed) process.exitCode = 1;

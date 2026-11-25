/**
 * Find A Place: prepare the host improvements overlay for Next build.
 * Runs automatically from `npm run build`. No separate commands or installer.
 * Original branded PNG icons stay authoritative; this changes colors only.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const patches = [
  'hosts-guest-fee-copy.patch',
  'host-onboarding-fee-copy.patch',
  'host-rates-fee-copy.patch',
  'host-custom-fees.patch',
  'stripe-webhook-deposit-integration.patch',
];
function applyExistingSourceUpdates() {
  for (const name of patches) {
    const file = path.join(root, '.fap-build', 'patches', name);
    if (!fs.existsSync(file)) throw new Error(`Missing FAP source update: ${name}`);
    const check = cp.spawnSync('git', ['apply', '--check', '--whitespace=nowarn', file], { cwd:root, encoding:'utf8' });
    if (check.status === 0) {
      const applied = cp.spawnSync('git', ['apply', '--whitespace=nowarn', file], { cwd:root, encoding:'utf8' });
      if (applied.status !== 0) throw new Error(`Couldn't apply ${name}: ${applied.stderr}`);
      console.log(`[FAP overlay] Source update applied: ${name}`);
      continue;
    }
    const already = cp.spawnSync('git', ['apply', '--reverse', '--check', '--whitespace=nowarn', file], { cwd:root, encoding:'utf8' });
    if (already.status === 0) { console.log(`[FAP overlay] Already in source: ${name}`); continue; }
    throw new Error(`FAP overlay cannot safely match ${name} to this source checkout. No partial/forced patching. ${check.stderr || ''}`);
  }
}

// PNG codec for standard 8-bit noninterlaced PNG images. Uses only Node built-ins.
// Recolors pixel values; never changes the Find A Place logo's outline/layout.
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type, data) {
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, 'ascii');
  data.copy(result, 8);
  let crc = 0xFFFFFFFF;
  for (const b of result.subarray(4, 8 + data.length)) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
  }
  result.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, result.length - 4);
  return result;
}
function decodePng(png) {
  if (!png.subarray(0,8).equals(signature)) throw new Error('Original branded icon is not PNG.');
  let offset=8, width=0, height=0, depth=0, colorType=0, interlace=0, palette=null, transparency=null;
  const idat=[];
  while (offset + 12 <= png.length) {
    const length=png.readUInt32BE(offset);
    const tag=png.toString('ascii', offset+4, offset+8);
    if(offset + 12 + length > png.length) throw new Error('Truncated branded PNG.');
    const data=png.subarray(offset+8,offset+8+length);
    if(tag==='IHDR') {width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];colorType=data[9];interlace=data[12];}
    if(tag==='PLTE') palette=Buffer.from(data);
    if(tag==='tRNS') transparency=Buffer.from(data);
    if(tag==='IDAT') idat.push(data);
    offset += 12 + length;
    if(tag==='IEND') break;
  }
  const channels = {0:1,2:3,3:1,4:2,6:4}[colorType];
  if(depth!==8 || interlace!==0 || !channels || width<1 || height<1 || width*height>4194304) throw new Error('Unsupported original PNG format; keep original icons rather than guess.');
  const stride=width*channels, data=zlib.inflateSync(Buffer.concat(idat));
  if(data.length<(stride+1)*height) throw new Error('Truncated PNG pixel data.');
  const rgba=Buffer.alloc(width*height*4), prior=Buffer.alloc(stride);
  let d=0;
  for(let y=0;y<height;y++) {
    const filter=data[d++], row=Buffer.from(data.subarray(d,d+stride));d+=stride;
    for(let x=0;x<stride;x++) {
      const a=x>=channels?row[x-channels]:0, b=prior[x], c=x>=channels?prior[x-channels]:0;
      if(filter===1) row[x]=(row[x]+a)&255;
      else if(filter===2) row[x]=(row[x]+b)&255;
      else if(filter===3) row[x]=(row[x]+Math.floor((a+b)/2))&255;
      else if(filter===4) {const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);row[x]=(row[x]+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}
      else if(filter!==0) throw new Error('Unsupported PNG row filter.');
    }
    for(let x=0;x<width;x++) {
      const i=x*channels, j=(y*width+x)*4;
      if(colorType===0) {rgba[j]=rgba[j+1]=rgba[j+2]=row[i];rgba[j+3]=255;}
      else if(colorType===2) {rgba[j]=row[i];rgba[j+1]=row[i+1];rgba[j+2]=row[i+2];rgba[j+3]=255;}
      else if(colorType===3) {const pi=row[i];rgba[j]=palette?.[3*pi]??0;rgba[j+1]=palette?.[3*pi+1]??0;rgba[j+2]=palette?.[3*pi+2]??0;rgba[j+3]=transparency?.[pi]??255;}
      else if(colorType===4) {rgba[j]=rgba[j+1]=rgba[j+2]=row[i];rgba[j+3]=row[i+1];}
      else {rgba[j]=row[i];rgba[j+1]=row[i+1];rgba[j+2]=row[i+2];rgba[j+3]=row[i+3];}
    }
    row.copy(prior);
  }
  return {width,height,rgba};
}
function encodePng({width,height,rgba}) {
  const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width,0);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++) rgba.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([signature,chunk('IHDR',hdr),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function tintLogo(original, palette) {
  const out=Buffer.from(original.rgba);
  for(let i=0;i<out.length;i+=4){
    // The original source is the actual Find A Place icon, not new artwork.
    // Light elements stay cream, dark portions adopt the app's accent color.
    const light=Math.max(0,Math.min(1,(0.2126*out[i]+0.7152*out[i+1]+0.0722*out[i+2])/255));
    const t=light*light*(3-2*light);
    out[i]=Math.round(palette[0]*(1-t)+250*t);
    out[i+1]=Math.round(palette[1]*(1-t)+246*t);
    out[i+2]=Math.round(palette[2]*(1-t)+234*t);
  }
  return encodePng({width:original.width,height:original.height,rgba:out});
}
// Existing original art has a dark background and light logo. Invert its tonal
// relationship for a white host tile with a dark forest-green logo; keep alpha
// edges antialiased by compositing on white. Guest icon logic remains unchanged.
function tintWhiteHostLogo(original) {
  const out=Buffer.from(original.rgba);
  const ink=[20,54,42];
  for(let i=0;i<out.length;i+=4) {
    const light=(0.2126*out[i]+0.7152*out[i+1]+0.0722*out[i+2])/255;
    const x=Math.max(0,Math.min(1,(light-0.20)/0.80));
    const t=x*x*(3-2*x)*(out[i+3]/255);
    for(let k=0;k<3;k++) out[i+k]=Math.round(255*(1-t)+ink[k]*t);
    out[i+3]=255;
  }
  return encodePng({width:original.width,height:original.height,rgba:out});
}
function prepareOriginalBrandIcons() {
  const icons=path.join(root,'public','webapps','icons');
  const originals=path.join(root,'public','brand','fap-app-icon-sources');
  fs.mkdirSync(originals,{recursive:true});
  for (const size of [192,512]) {
    const original=path.join(originals,`find-a-place-${size}.png`);
    if(!fs.existsSync(original)) {
      const current=path.join(icons,`guest-${size}.png`);
      if(!fs.existsSync(current)) throw new Error(`Missing original Find A Place ${size}px app icon; cannot recolor safely.`);
      fs.copyFileSync(current,original);
    }
    const logo=decodePng(fs.readFileSync(original));
    if(logo.width!==size||logo.height!==size) throw new Error(`Original Find A Place ${size}px icon has wrong dimensions.`);
    fs.writeFileSync(path.join(icons,`guest-${size}.png`),tintLogo(logo,[20,79,54]));
    fs.writeFileSync(path.join(icons,`host-${size}.png`),tintWhiteHostLogo(logo));
  }
  console.log('[FAP overlay] Existing Find A Place icon preserved; green guest and white host icons generated.');
}
if (require.main === module) {
  applyExistingSourceUpdates();
  prepareOriginalBrandIcons();
}
module.exports={decodePng,encodePng,tintLogo,tintWhiteHostLogo,prepareOriginalBrandIcons};

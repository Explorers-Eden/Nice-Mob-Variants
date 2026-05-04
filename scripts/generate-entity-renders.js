#!/usr/bin/env node
// scripts/generate-entity-renders.js
// Generates wiki/images/entity/<type>/<variant>/adult.png and baby.png.
// Source of truth: data/<namespace>/<type>_variant/*.json.
// Model source: scripts/entity-models/<minecraft-version>/<type>/<model>.json, falling back to common/.

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const OUTPUT_ROOT = path.join('wiki', 'images', 'entity');
const MODEL_ROOT = path.join('scripts', 'entity-models');
const IMAGE_SIZE = 768;
const SUPPORTED_VARIANT_DIRS = [
  'cat_variant', 'chicken_variant', 'cow_variant', 'frog_variant',
  'pig_variant', 'wolf_variant', 'zombie_nautilus_variant'
];
const TYPE_BY_DIR = Object.fromEntries(SUPPORTED_VARIANT_DIRS.map(d => [d, d.replace(/_variant$/, '')]));
const BABY_CAPABLE = new Set(['cat', 'chicken', 'cow', 'pig', 'wolf']);

function readVanillaVersion() {
  const file = path.join('.cache', 'vanilla-assets', 'version.txt');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : 'common';
}
function walk(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function clean(v) { return String(v || 'default').replace(/\.json$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'default'; }
function idParts(id, fallbackNs = 'minecraft') {
  if (!id || typeof id !== 'string') return null;
  const i = id.indexOf(':');
  return i >= 0 ? [id.slice(0, i), id.slice(i + 1)] : [fallbackNs, id];
}
function basenameId(id) { const p = idParts(id); return p ? clean(path.basename(p[1])) : 'default'; }
function nestedGet(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    let ok = true;
    for (const k of p.split('.')) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k]; else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}
function discoverVariants() {
  const files = walk('data').filter(f => f.endsWith('.json'));
  const variants = [];
  for (const file of files) {
    const parts = file.split(path.sep);
    const dir = parts[parts.length - 2];
    if (!TYPE_BY_DIR[dir]) continue;
    const type = TYPE_BY_DIR[dir];
    const variant = clean(path.basename(file, '.json'));
    const json = readJson(file);
    const adultAsset = nestedGet(json, ['asset_id', 'texture', 'texture_asset_id', 'assets.adult.asset_id', 'assets.adult.texture']);
    const babyAsset = nestedGet(json, ['baby_asset_id', 'baby_texture', 'baby_texture_asset_id', 'assets.baby.asset_id', 'assets.baby.texture']);
    const adultModel = nestedGet(json, ['model', 'model_id', 'model_asset_id', 'assets.adult.model', 'adult_model']);
    const babyModel = nestedGet(json, ['baby_model', 'baby_model_id', 'baby_model_asset_id', 'assets.baby.model']);
    if (!adultAsset) {
      console.warn(`Skipping ${file}: no asset_id/texture field found.`);
      continue;
    }
    variants.push({ file, type, variant, adultAsset, babyAsset, adultModel, babyModel });
  }
  variants.sort((a, b) => `${a.type}/${a.variant}`.localeCompare(`${b.type}/${b.variant}`));
  return variants;
}
function textureCandidates(assetId, type, variant) {
  const p = idParts(assetId);
  if (!p) return [];
  const [ns, raw] = p;
  const noTex = raw.replace(/^textures\//, '').replace(/\.png$/i, '');
  const base = path.basename(noTex);
  return [
    path.join('assets', ns, 'textures', `${noTex}.png`),
    path.join('assets', ns, 'textures', 'entity', `${noTex}.png`),
    path.join('assets', ns, 'textures', 'entity', type, `${base}.png`),
    path.join('assets', ns, 'textures', 'entity', type, `${variant}.png`),
    path.join('.cache', 'vanilla-assets', 'assets', ns, 'textures', `${noTex}.png`),
    path.join('.cache', 'vanilla-assets', 'assets', ns, 'textures', 'entity', `${noTex}.png`),
  ];
}
function resolveTexture(assetId, type, variant) {
  const hit = textureCandidates(assetId, type, variant).find(f => fs.existsSync(f));
  if (!hit) throw new Error(`texture not found for ${assetId}. Checked ${textureCandidates(assetId, type, variant).slice(0, 4).join(', ')}`);
  return hit;
}
function normalizeModelKey(value, type, age, assetId) {
  let key = value ? basenameId(value) : 'default';
  const hay = `${value || ''} ${assetId || ''}`.toLowerCase();
  if (!value) {
    if (type === 'chicken' && /cold|penguin/.test(hay)) key = 'cold';
    else if (type === 'chicken' && /warm|ostrich|flamingo|duck|goose/.test(hay)) key = 'warm';
    else if (type === 'cow' && /cold/.test(hay)) key = 'cold';
    else if (type === 'cow' && /warm/.test(hay)) key = 'warm';
    else if (type === 'zombie_nautilus' && /coral|warm/.test(hay)) key = 'coral';
  }
  if (age === 'baby' && key === 'default') key = 'baby';
  return key;
}
function modelCandidates(version, type, key, age) {
  const versionBases = [version, '26.1.2', 'common'];
  const keys = [...new Set([key, age === 'baby' ? 'baby' : 'default', 'default'])];
  const out = [];
  for (const v of versionBases) for (const k of keys) out.push(path.join(MODEL_ROOT, v, type, `${k}.json`));
  return out;
}
function resolveModel(version, type, key, age) {
  const hit = modelCandidates(version, type, key, age).find(f => fs.existsSync(f));
  if (!hit) throw new Error(`model not found for ${type}/${key}/${age}`);
  return { file: hit, model: readJson(hit) };
}
function deg(v) { return (v || 0) * Math.PI / 180; }
function vec(a, d = [0,0,0]) { return { x: a?.[0] ?? d[0], y: a?.[1] ?? d[1], z: a?.[2] ?? d[2] }; }
function add(a,b){ return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}; }
function sub(a,b){ return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}; }
function rot(p, r) {
  let {x,y,z} = p;
  const cx=Math.cos(r.x), sx=Math.sin(r.x); let y1=y*cx-z*sx, z1=y*sx+z*cx; y=y1; z=z1;
  const cy=Math.cos(r.y), sy=Math.sin(r.y); let x1=x*cy+z*sy, z2=-x*sy+z*cy; x=x1; z=z2;
  const cz=Math.cos(r.z), sz=Math.sin(r.z); let x2=x*cz-y*sz, y2=x*sz+y*cz; x=x2; y=y2;
  return {x,y,z};
}
function transformPoint(p, part) {
  const pivot = vec(part.pivot);
  const rotation = { x: deg(part.rotation?.[0]), y: deg(part.rotation?.[1]), z: deg(part.rotation?.[2]) };
  return add(pivot, rot(sub(p, pivot), rotation));
}
function boxCorners(origin, size, inflate=0) {
  const x0=origin[0]-inflate, y0=origin[1]-inflate, z0=origin[2]-inflate;
  const x1=origin[0]+size[0]+inflate, y1=origin[1]+size[1]+inflate, z1=origin[2]+size[2]+inflate;
  return {x0,y0,z0,x1,y1,z1};
}
function facesForBox(c) { return {
  north:[{x:c.x1,y:c.y0,z:c.z0},{x:c.x0,y:c.y0,z:c.z0},{x:c.x0,y:c.y1,z:c.z0},{x:c.x1,y:c.y1,z:c.z0}],
  south:[{x:c.x0,y:c.y0,z:c.z1},{x:c.x1,y:c.y0,z:c.z1},{x:c.x1,y:c.y1,z:c.z1},{x:c.x0,y:c.y1,z:c.z1}],
  west:[{x:c.x0,y:c.y0,z:c.z0},{x:c.x0,y:c.y0,z:c.z1},{x:c.x0,y:c.y1,z:c.z1},{x:c.x0,y:c.y1,z:c.z0}],
  east:[{x:c.x1,y:c.y0,z:c.z1},{x:c.x1,y:c.y0,z:c.z0},{x:c.x1,y:c.y1,z:c.z0},{x:c.x1,y:c.y1,z:c.z1}],
  up:[{x:c.x0,y:c.y1,z:c.z1},{x:c.x1,y:c.y1,z:c.z1},{x:c.x1,y:c.y1,z:c.z0},{x:c.x0,y:c.y1,z:c.z0}],
  down:[{x:c.x0,y:c.y0,z:c.z0},{x:c.x1,y:c.y0,z:c.z0},{x:c.x1,y:c.y0,z:c.z1},{x:c.x0,y:c.y0,z:c.z1}],
}; }
function uvFromBox(uv, size) {
  const [u,v] = uv; const [w,h,d] = size;
  return {
    west:{u:u, v:v+d, w:d, h:h}, north:{u:u+d, v:v+d, w:w, h:h}, east:{u:u+d+w, v:v+d, w:d, h:h}, south:{u:u+d+w+d, v:v+d, w:w, h:h},
    up:{u:u+d, v:v, w:w, h:d}, down:{u:u+d+w, v:v, w:w, h:d}
  };
}
function view(p, camera) {
  const yaw = deg(camera.yaw ?? 225); // 225 = front-right, face visible for -Z-facing mobs
  const pitch = deg(camera.pitch ?? 0);
  let x = p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
  let z = p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  let y = p.y;
  const y2 = y * Math.cos(pitch) - z * Math.sin(pitch);
  const z2 = y * Math.sin(pitch) + z * Math.cos(pitch);
  return {x, y:y2, z:z2};
}
function project(p, camera, scale, center) {
  const q = view(p, camera);
  return { x: center.x + q.x * scale, y: center.y - (q.y - q.z * 0.26) * scale, z: q.z };
}
function area(pts){let s=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];s+=(b.x-a.x)*(b.y+a.y)}return s;}
function crop(texture, uv) {
  const u=Math.max(0,Math.min(texture.width-1,Math.round(uv.u)));
  const v=Math.max(0,Math.min(texture.height-1,Math.round(uv.v)));
  const w=Math.max(1,Math.min(texture.width-u,Math.round(uv.w)));
  const h=Math.max(1,Math.min(texture.height-v,Math.round(uv.h)));
  const c=createCanvas(w,h), ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.drawImage(texture,u,v,w,h,0,0,w,h); return c;
}
function shade(img, amount) { const c=createCanvas(img.width,img.height), ctx=c.getContext('2d'); ctx.drawImage(img,0,0); if(amount){ctx.globalCompositeOperation='source-atop'; ctx.fillStyle=amount>0?`rgba(255,255,255,${amount})`:`rgba(0,0,0,${-amount})`; ctx.fillRect(0,0,c.width,c.height);} return c; }
function drawQuad(ctx,img,p0,p1,p2,p3){ctx.save();ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);ctx.closePath();ctx.clip();ctx.setTransform((p1.x-p0.x)/img.width,(p1.y-p0.y)/img.width,(p3.x-p0.x)/img.height,(p3.y-p0.y)/img.height,p0.x,p0.y);ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0);ctx.restore();}
const SHADE = { north:0.02, east:-0.06, up:0.12, west:-0.18, south:-0.25, down:-0.35 };
function flattenParts(model) {
  const out = [];
  function visit(part, parentRot=[0,0,0]) {
    const own = {...part, rotation: [(part.rotation?.[0]||0)+parentRot[0], (part.rotation?.[1]||0)+parentRot[1], (part.rotation?.[2]||0)+parentRot[2]]};
    if (part.boxes) for (const b of part.boxes) out.push({part: own, box: b});
    if (part.children) for (const c of part.children) visit(c, own.rotation);
  }
  for (const p of model.parts || []) visit(p);
  return out;
}
function render(model, texture, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const canvas=createCanvas(IMAGE_SIZE,IMAGE_SIZE), ctx=canvas.getContext('2d'); ctx.clearRect(0,0,IMAGE_SIZE,IMAGE_SIZE); ctx.imageSmoothingEnabled=false;
  const camera = model.camera || {};
  const scale = model.render?.scale || 16;
  const center = { x: model.render?.center?.[0] ?? IMAGE_SIZE/2, y: model.render?.center?.[1] ?? IMAGE_SIZE*0.66 };
  const draw=[];
  for (const {part, box} of flattenParts(model)) {
    const c = boxCorners(box.origin, box.size, box.inflate || 0);
    const f3 = facesForBox(c);
    const uvs = uvFromBox(box.uv || [0,0], box.uv_size || box.size);
    for (const key of Object.keys(f3)) {
      const pts3 = f3[key].map(p => transformPoint(p, part));
      const pts2 = pts3.map(p => project(p,camera,scale,center));
      if (area(pts2) >= 0) continue;
      draw.push({key, pts2, uv: uvs[key], depth: pts3.reduce((s,p)=>s+view(p,camera).z,0)/4});
    }
  }
  draw.sort((a,b)=>b.depth-a.depth);
  for (const f of draw) drawQuad(ctx, shade(crop(texture,f.uv), SHADE[f.key]||0), ...f.pts2);
  fs.writeFileSync(output, canvas.toBuffer('image/png'));
}
function outputPath(type, variant, age) { return path.join(OUTPUT_ROOT, type, variant, `${age}.png`); }
async function renderVariant(version, v, age) {
  const assetId = age === 'baby' ? (v.babyAsset || v.adultAsset) : v.adultAsset;
  const modelField = age === 'baby' ? (v.babyModel || v.adultModel) : v.adultModel;
  const key = normalizeModelKey(modelField, v.type, age, assetId);
  const textureFile = resolveTexture(assetId, v.type, v.variant);
  const {file: modelFile, model} = resolveModel(version, v.type, key, age);
  const texture = await loadImage(textureFile);
  const out = outputPath(v.type, v.variant, age);
  render(model, texture, out);
  return { out, textureFile, modelFile };
}
async function main() {
  const version = readVanillaVersion();
  console.log(`Generating entity renders for Minecraft ${version}.`);
  console.log('Using variant JSON asset_id/baby_asset_id/model fields and local exported model JSON files.');
  const variants = discoverVariants();
  if (!variants.length) return console.log('No supported entity variant JSONs found.');
  let count = 0;
  for (const v of variants) {
    try {
      const adult = await renderVariant(version, v, 'adult'); count++;
      console.log(`Rendered ${v.type}/${v.variant}/adult using ${v.adultAsset} + ${path.relative('.', adult.modelFile)}`);
      if (v.babyAsset || v.babyModel || BABY_CAPABLE.has(v.type)) {
        const baby = await renderVariant(version, v, 'baby'); count++;
        console.log(`Rendered ${v.type}/${v.variant}/baby using ${(v.babyAsset || v.adultAsset)} + ${path.relative('.', baby.modelFile)}`);
      }
    } catch (err) {
      console.warn(`Skipped ${v.type}/${v.variant}: ${err.message}`);
    }
  }
  console.log(`Generated ${count} entity render image(s) under ${OUTPUT_ROOT}.`);
}
main().catch(err => { console.error(err); process.exit(1); });

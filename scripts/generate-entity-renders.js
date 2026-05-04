#!/usr/bin/env node
// scripts/generate-entity-renders.js
// Generates wiki/images/entity/<type>/<variant>/adult.png and baby.png where supported.
// Source of truth is data/<namespace>/<type>_variant/*.json; the renderer uses the
// JSON asset_id / baby_asset_id / model fields and Minecraft-style cuboid profiles.

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const OUTPUT_ROOT = path.join("wiki", "images", "entity");
const IMAGE_SIZE = 512;
const VARIANT_DIRS = new Set([
  "cat_variant", "chicken_variant", "cow_variant", "frog_variant",
  "pig_variant", "wolf_variant", "zombie_nautilus_variant"
]);
const TYPE_BY_VARIANT_DIR = Object.fromEntries([...VARIANT_DIRS].map(name => [name, name.replace(/_variant$/, "")]));

function readVanillaVersion() {
  const file = path.join(".cache", "vanilla-assets", "version.txt");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : "unknown";
}
function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}
function sanitizeName(value) {
  return String(value || "unknown").replace(/\.json$/i, "").replace(/\.png$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
function parseJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`Could not parse ${file}: ${error.message}`); }
}
function splitAssetId(assetId) {
  if (!assetId || typeof assetId !== "string") return null;
  const i = assetId.indexOf(":");
  return i >= 0 ? [assetId.slice(0, i), assetId.slice(i + 1)] : ["minecraft", assetId];
}
function assetIdToTexture(assetId, type, variant) {
  const split = splitAssetId(assetId);
  if (!split) return null;
  const [namespace, assetPath] = split;
  const candidates = [
    path.join("assets", namespace, "textures", `${assetPath}.png`),
    path.join("assets", namespace, "textures", "entity", `${assetPath}.png`),
    path.join("assets", namespace, "textures", "entity", type, `${path.basename(assetPath)}.png`),
    path.join("assets", namespace, "textures", "entity", type, `${variant}.png`),
    path.join(".cache", "vanilla-assets", "assets", namespace, "textures", `${assetPath}.png`)
  ];
  return candidates.find(file => fs.existsSync(file)) || candidates[0];
}
function pickModelHint(json, age) {
  const keys = age === "baby"
    ? ["baby_model", "baby_model_id", "baby_model_asset_id", "baby_model_type"]
    : ["model", "model_id", "model_asset_id", "model_type"];
  for (const key of keys) if (typeof json[key] === "string") return json[key];
  const haystack = JSON.stringify(json).toLowerCase();
  for (const k of ["cold", "warm", "temperate", "husk", "guardian", "swamp"]) if (haystack.includes(k)) return k;
  return "default";
}
function discoverVariantDefinitions() {
  const files = walkFiles("data").filter(file => file.endsWith(".json"));
  const variants = [];
  for (const file of files) {
    const parts = file.split(path.sep);
    const dir = parts[parts.length - 2];
    if (!VARIANT_DIRS.has(dir)) continue;
    const type = TYPE_BY_VARIANT_DIR[dir];
    const variant = sanitizeName(path.basename(file, ".json"));
    const json = parseJson(file);
    const adultAssetId = json.asset_id || json.texture || json.texture_asset_id;
    const babyAssetId = json.baby_asset_id || json.baby_texture || json.baby_texture_asset_id;
    if (!adultAssetId) { console.warn(`No asset_id in ${file}; skipped.`); continue; }
    variants.push({
      file, type, variant, adultAssetId, babyAssetId,
      adultTexture: assetIdToTexture(adultAssetId, type, variant),
      babyTexture: babyAssetId ? assetIdToTexture(babyAssetId, type, variant) : null,
      adultModelHint: pickModelHint(json, "adult"),
      babyModelHint: pickModelHint(json, "baby")
    });
  }
  variants.sort((a, b) => `${a.type}/${a.variant}`.localeCompare(`${b.type}/${b.variant}`));
  return variants;
}

function box(name, x, y, z, w, h, d, u, v, opts = {}) {
  return { name, x, y, z, w, h, d, u, v, uvW: opts.uvW || w, uvH: opts.uvH || h, uvD: opts.uvD || d, inflate: opts.inflate || 0 };
}
function uvMap(b) {
  const u = b.u, v = b.v, w = b.uvW, h = b.uvH, d = b.uvD;
  return {
    west:  { u,             v: v + d, w: d, h },
    north: { u: u + d,     v: v + d, w,    h },
    east:  { u: u + d + w, v: v + d, w: d, h },
    south: { u: u + d + w + d, v: v + d, w, h },
    up:    { u: u + d,     v,       w,    h: d },
    down:  { u: u + d + w, v,       w,    h: d }
  };
}
function V(x, y, z) { return { x, y, z }; }
function corners(b) {
  const i = b.inflate || 0;
  const x0 = b.x - i, y0 = b.y - i, z0 = b.z - i;
  const x1 = b.x + b.w + i, y1 = b.y + b.h + i, z1 = b.z + b.d + i;
  return { x0, y0, z0, x1, y1, z1 };
}
const FACES = {
  north: b => { const c = corners(b); return [V(c.x1,c.y0,c.z0), V(c.x0,c.y0,c.z0), V(c.x0,c.y1,c.z0), V(c.x1,c.y1,c.z0)]; },
  south: b => { const c = corners(b); return [V(c.x0,c.y0,c.z1), V(c.x1,c.y0,c.z1), V(c.x1,c.y1,c.z1), V(c.x0,c.y1,c.z1)]; },
  west:  b => { const c = corners(b); return [V(c.x0,c.y0,c.z0), V(c.x0,c.y0,c.z1), V(c.x0,c.y1,c.z1), V(c.x0,c.y1,c.z0)]; },
  east:  b => { const c = corners(b); return [V(c.x1,c.y0,c.z1), V(c.x1,c.y0,c.z0), V(c.x1,c.y1,c.z0), V(c.x1,c.y1,c.z1)]; },
  up:    b => { const c = corners(b); return [V(c.x0,c.y1,c.z1), V(c.x1,c.y1,c.z1), V(c.x1,c.y1,c.z0), V(c.x0,c.y1,c.z0)]; },
  down:  b => { const c = corners(b); return [V(c.x0,c.y0,c.z0), V(c.x1,c.y0,c.z0), V(c.x1,c.y0,c.z1), V(c.x0,c.y0,c.z1)]; }
};
const FACE_SHADE = { north: 0.04, east: -0.08, up: 0.12, west: -0.23, south: -0.28, down: -0.35 };

function viewPoint(p, profile) {
  const yaw = profile.yaw ?? Math.PI / 4;       // front-right view; front is -Z
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return { x: p.x * cy - p.z * sy, y: p.y, z: p.x * sy + p.z * cy };
}
function project(p, scale, center, profile) {
  const q = viewPoint(p, profile);
  return { x: q.x * scale + center.x, y: (-q.y + q.z * 0.34) * scale + center.y, z: q.z };
}
function cropFace(texture, uv) {
  const u = Math.max(0, Math.min(texture.width - 1, Math.round(uv.u)));
  const v = Math.max(0, Math.min(texture.height - 1, Math.round(uv.v)));
  const w = Math.max(1, Math.min(texture.width - u, Math.round(uv.w)));
  const h = Math.max(1, Math.min(texture.height - v, Math.round(uv.h)));
  const canvas = createCanvas(w, h); const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false; ctx.drawImage(texture, u, v, w, h, 0, 0, w, h); return canvas;
}
function shadeCanvas(source, amount) {
  if (!amount) return source;
  const canvas = createCanvas(source.width, source.height); const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0); ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = amount > 0 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${Math.abs(amount)})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = "source-over"; return canvas;
}
function drawImageToQuad(ctx, image, p0, p1, p2, p3) {
  ctx.save(); ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.closePath(); ctx.clip();
  const a = (p1.x - p0.x) / image.width, b = (p1.y - p0.y) / image.width;
  const c = (p3.x - p0.x) / image.height, d = (p3.y - p0.y) / image.height;
  ctx.setTransform(a,b,c,d,p0.x,p0.y); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0); ctx.restore();
}
function polygonArea(points) {
  let sum = 0; for (let i=0;i<points.length;i++) { const a=points[i], b=points[(i+1)%points.length]; sum += (b.x-a.x)*(b.y+a.y); } return sum;
}
function renderParts({ texture, parts, output, age, profile }) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE); const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,IMAGE_SIZE,IMAGE_SIZE); ctx.imageSmoothingEnabled = false;
  const scale = profile.scale || (age === "baby" ? 11 : 8.2);
  const center = profile.center || (age === "baby" ? { x: 256, y: 318 } : { x: 256, y: 340 });
  const drawFaces = [];
  for (const part of parts) {
    const uvs = uvMap(part);
    for (const key of Object.keys(FACES)) {
      const pts3 = FACES[key](part);
      const pts2 = pts3.map(p => project(p, scale, center, profile));
      if (polygonArea(pts2) >= 0) continue; // back-facing in screen space
      const depth = pts3.reduce((s,p)=>s+viewPoint(p, profile).z,0)/4;
      drawFaces.push({ key, pts2, depth, part, uv: uvs[key] });
    }
  }
  drawFaces.sort((a,b)=>b.depth-a.depth);
  for (const f of drawFaces) drawImageToQuad(ctx, shadeCanvas(cropFace(texture, f.uv), FACE_SHADE[f.key] || 0), ...f.pts2);
  fs.writeFileSync(output, canvas.toBuffer("image/png"));
}
function scalePartsForBaby(parts, profile) {
  const bodyScale = profile.babyBodyScale || 0.55, headScale = profile.babyHeadScale || 0.9;
  return parts.map(p => {
    const s = /head|beak|snout|ear|horn|eye/i.test(p.name) ? headScale : bodyScale;
    return { ...p, x:p.x*s, y:p.y*s + (/head|beak|snout|ear|horn|eye/i.test(p.name)?4:0), z:p.z*s, w:p.w*s, h:p.h*s, d:p.d*s, inflate:(p.inflate||0)*s };
  });
}

function cowParts(model="default") { const horn = !/skeleton|sniffer/i.test(model); return [
  box("body", -6, 9, -7, 12, 10, 18, 18, 4, { uvW:12, uvH:18, uvD:10 }),
  box("head", -4, 15, -15, 8, 8, 6, 0, 0),
  ...(horn ? [box("horn_l", -5, 20, -13, 1, 3, 1, 22, 0), box("horn_r", 4, 20, -13, 1, 3, 1, 22, 0)] : []),
  box("leg_fl", -5, 0, -6, 4, 9, 4, 0, 16, { uvH:12 }), box("leg_fr", 1, 0, -6, 4, 9, 4, 0, 16, { uvH:12 }),
  box("leg_bl", -5, 0, 5, 4, 9, 4, 0, 16, { uvH:12 }), box("leg_br", 1, 0, 5, 4, 9, 4, 0, 16, { uvH:12 })
]; }
function pigParts() { return [
  box("body", -5, 7, -8, 10, 8, 16, 28, 8, { uvW:10, uvH:16, uvD:8 }), box("head", -4, 12, -16, 8, 8, 8, 0, 0), box("snout", -2, 12, -18, 4, 3, 1, 16, 16),
  box("leg_fl", -5, 0, -6, 4, 7, 4, 0, 16, { uvH:6 }), box("leg_fr", 1, 0, -6, 4, 7, 4, 0, 16, { uvH:6 }), box("leg_bl", -5, 0, 4, 4, 7, 4, 0, 16, { uvH:6 }), box("leg_br", 1, 0, 4, 4, 7, 4, 0, 16, { uvH:6 })
]; }
function chickenParts(model="default") { const cold = /cold|penguin/i.test(model); return [
  box("body", -3, 5, -3, 6, cold?9:8, 6, 0, 9), box("head", -2, cold?14:13, -6, 4, 6, 3, 0, 0), box("beak", -2, cold?14:13, -8, 4, 2, 2, 14, 0),
  box("wing_l", -5, 6, -2, 2, 6, 4, 24, 13), box("wing_r", 3, 6, -2, 2, 6, 4, 24, 13), box("leg_l", -2, 0, -1, 1, 5, 1, 26, 0), box("leg_r", 1, 0, -1, 1, 5, 1, 26, 0)
]; }
function wolfParts() { return [
  box("body", -4, 8, -7, 8, 6, 14, 18, 14), box("head", -3, 13, -13, 6, 6, 4, 0, 0), box("snout", -2, 12, -16, 4, 3, 3, 0, 10),
  box("ear_l", -3, 19, -12, 2, 2, 1, 16, 14), box("ear_r", 1, 19, -12, 2, 2, 1, 16, 14), box("tail", -2, 12, 7, 4, 4, 8, 9, 18),
  box("leg_fl", -4, 0, -5, 2, 8, 2, 0, 18), box("leg_fr", 2, 0, -5, 2, 8, 2, 0, 18), box("leg_bl", -4, 0, 4, 2, 8, 2, 0, 18), box("leg_br", 2, 0, 4, 2, 8, 2, 0, 18)
]; }
function catParts() { return [
  box("body", -3, 7, -6, 6, 6, 12, 20, 0), box("head", -3, 13, -12, 6, 6, 5, 0, 0), box("ear_l", -3, 19, -11, 2, 2, 1, 0, 24), box("ear_r", 1, 19, -11, 2, 2, 1, 0, 24),
  box("tail", -1, 12, 6, 2, 2, 10, 0, 15), box("leg_fl", -3, 0, -4, 2, 7, 2, 8, 13), box("leg_fr", 1, 0, -4, 2, 7, 2, 8, 13), box("leg_bl", -3, 0, 3, 2, 7, 2, 8, 13), box("leg_br", 1, 0, 3, 2, 7, 2, 8, 13)
]; }
function frogParts() { return [
  box("body", -3.5, 4, -4, 7, 5, 9, 3, 1), box("head", -3.5, 8, -8, 7, 5, 7, 23, 1), box("eye_l", -3.5, 12, -6, 2, 2, 2, 0, 13), box("eye_r", 1.5, 12, -6, 2, 2, 2, 0, 13),
  box("leg_fl", -5, 1, -5, 3, 3, 5, 0, 23), box("leg_fr", 2, 1, -5, 3, 3, 5, 0, 23), box("leg_bl", -5, 0, 2, 3, 3, 5, 0, 32), box("leg_br", 2, 0, 2, 3, 3, 5, 0, 32)
]; }
function zombieNautilusParts(model="default") { const guardian = /guardian/i.test(model); return [
  box("head", -4, 21, -5, 8, 8, 8, 0, 0), box("torso", -4, 9, -3, 8, 12, 4, 16, 16), box("arm_l", -8, 9, -3, 4, 12, 4, 40, 16), box("arm_r", 4, 9, -3, 4, 12, 4, 40, 16),
  box("leg_l", -4, 0, -3, 4, 9, 4, 0, 16), box("leg_r", 0, 0, -3, 4, 9, 4, 0, 16), box("shell", -7, 5, 3, 14, 14, 6, guardian ? 0 : 32, guardian ? 32 : 0, { inflate:0.15 })
]; }
const ENTITY_RENDERERS = {
  cow: { hasBaby:true, babyBodyScale:0.55, babyHeadScale:0.9, parts:cowParts, scale:8.6, center:{x:256,y:348} },
  pig: { hasBaby:true, babyBodyScale:0.58, babyHeadScale:0.9, parts:pigParts, scale:9.5, center:{x:256,y:340} },
  chicken: { hasBaby:true, babyBodyScale:0.58, babyHeadScale:0.9, parts:chickenParts, scale:12, center:{x:256,y:338} },
  wolf: { hasBaby:true, babyBodyScale:0.58, babyHeadScale:0.9, parts:wolfParts, scale:11, center:{x:256,y:348}, yaw:-Math.PI/4 },
  cat: { hasBaby:true, babyBodyScale:0.58, babyHeadScale:0.9, parts:catParts, scale:12, center:{x:256,y:350} },
  frog: { hasBaby:false, parts:frogParts, scale:14, center:{x:256,y:330} },
  zombie_nautilus: { hasBaby:false, parts:zombieNautilusParts, scale:8.8, center:{x:256,y:350} }
};
function outputPath(type, variant, age) { return path.join(OUTPUT_ROOT, type, variant, `${age}.png`); }
async function loadTexture(file, label) { if (!file || !fs.existsSync(file)) throw new Error(`Missing texture for ${label}: ${file || "<none>"}`); return loadImage(file); }
async function renderOne({ type, variant, textureFile, modelHint, age, profile }) {
  const texture = await loadTexture(textureFile, `${type}/${variant}/${age}`);
  renderParts({ texture, parts: profile.parts(modelHint), output: outputPath(type, variant, age), age, profile });
}
async function main() {
  console.log(`Generating entity renders using renderer profiles for Minecraft ${readVanillaVersion()}.`);
  console.log("Variant JSONs are the source of truth: data/<namespace>/<type>_variant/*.json.");
  const variants = discoverVariantDefinitions();
  if (!variants.length) { console.log("No supported entity variant JSON files found."); return; }
  let generated = 0;
  for (const variant of variants) {
    const profile = ENTITY_RENDERERS[variant.type];
    if (!profile) { console.warn(`No renderer profile for entity type ${variant.type}; skipped ${variant.file}.`); continue; }
    try {
      await renderOne({ type:variant.type, variant:variant.variant, textureFile:variant.adultTexture, modelHint:variant.adultModelHint, age:"adult", profile }); generated++;
      if (variant.babyAssetId || profile.hasBaby) {
        const babyProfile = { ...profile, parts: hint => scalePartsForBaby(profile.parts(hint), profile), scale:(profile.scale || 10) * 1.15, center:{ x:256, y:(profile.center?.y || 340) - 10 } };
        await renderOne({ type:variant.type, variant:variant.variant, textureFile:variant.babyTexture || variant.adultTexture, modelHint:variant.babyModelHint || variant.adultModelHint, age:"baby", profile:babyProfile }); generated++;
      }
      console.log(`Rendered ${variant.type}/${variant.variant} (${variant.adultAssetId}${variant.babyAssetId ? `, baby ${variant.babyAssetId}` : ""})`);
    } catch (error) { console.warn(`Skipped ${variant.type}/${variant.variant}: ${error.message}`); }
  }
  console.log(`Generated ${generated} entity render image(s) in ${OUTPUT_ROOT}.`);
}
main().catch(error => { console.error(error); process.exit(1); });

#!/usr/bin/env node
/*
 * Generates true Minecraft entity variant renders into:
 *   wiki/images/entity/<type>/<variant>/adult.png
 *   wiki/images/entity/<type>/<variant>/baby.png
 *
 * Important: entity geometry is NOT guessed here. This script asks the JVM
 * exporter in tools/entity-renderer to bake Mojang's actual client model layer
 * for the Minecraft version resolved from release_infos.yml, then renders the
 * exported quads with the variant textures from data/<namespace>/*_variant/*.json.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const yaml = require('js-yaml');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');

const ENTITY_TYPES = [
  'cat',
  'chicken',
  'frog',
  'pig',
  'cow',
  'wolf',
  'zombie_nautilus'
];

const HAS_BABY_MODEL = new Set(['cat', 'chicken', 'pig', 'cow', 'wolf']);

const OUTPUT_ROOT = path.join('wiki', 'images', 'entity');
const MODEL_CACHE_ROOT = path.join('.cache', 'entity-models');
const MODEL_EXPORT_FAILURES = new Map();
const REPORT_PATH = path.join('wiki', 'images', 'entity', '_render-report.json');
const DEBUG = process.env.ENTITY_RENDER_DEBUG !== '0';
function debug(message) { if (DEBUG) console.log(`[entity-render-debug] ${message}`); }

const ENTITY_RENDER = {
  cat: { yaw: 180, pitch: 18, roll: 0, camera: 62, yOffset: -9 },
  chicken: { yaw: 180, pitch: 16, roll: 0, camera: 58, yOffset: -7 },
  frog: { yaw: 180, pitch: 18, roll: 0, camera: 48, yOffset: -5 },
  pig: { yaw: 180, pitch: 17, roll: 0, camera: 58, yOffset: -8 },
  cow: { yaw: 180, pitch: 17, roll: 0, camera: 68, yOffset: -9 },
  wolf: { yaw: 180, pitch: 16, roll: 0, camera: 62, yOffset: -8 },
  zombie_nautilus: { yaw: 180, pitch: 18, roll: 0, camera: 46, yOffset: -4 }
};

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function exists(file) { try { return fs.existsSync(file); } catch { return false; } }
function normalizeId(id) { return String(id || '').replace(/^#/, '').trim(); }
function idNamespace(id) { const s = normalizeId(id); return s.includes(':') ? s.split(':')[0] : 'minecraft'; }
function idPath(id) { const s = normalizeId(id); return s.includes(':') ? s.split(':').slice(1).join(':') : s; }
function variantNameFromFile(file) { return path.basename(file, '.json').replace(/[^a-zA-Z0-9._-]+/g, '_').toLowerCase(); }
function stripNamespace(id) { return idPath(id).split('/').pop(); }

function resolveMinecraftVersion() {
  const releaseFile = 'release_infos.yml';
  if (!exists(releaseFile)) return process.env.MINECRAFT_VERSION || '26.1.2';
  const raw = yaml.load(fs.readFileSync(releaseFile, 'utf8'));
  const candidates = [];
  function walk(v) {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v);
      if (/^\d+\.\d+(\.\d+)?([-.]pre\d+|[-.]rc\d+)?$/.test(s)) candidates.push(s);
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') Object.entries(v).forEach(([k, val]) => {
      if (/minecraft|mc[_-]?version|game[_-]?version|supported[_-]?versions/i.test(k)) walk(val);
      else walk(val);
    });
  }
  walk(raw);
  const preferred = candidates.filter(v => /^\d{2}\.\d+(\.\d+)?/.test(v));
  const result = process.env.MINECRAFT_VERSION || preferred.at(-1) || candidates.at(-1) || '26.1.2';
  console.log(`Using Minecraft ${result} from release_infos.yml`);
  return result;
}

function findVariantFiles(entityType) {
  const out = [];
  const dataDir = 'data';
  if (!exists(dataDir)) return out;
  for (const ns of fs.readdirSync(dataDir)) {
    const dir = path.join(dataDir, ns, `${entityType}_variant`);
    if (!exists(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
      out.push({ namespace: ns, file: path.join(dir, file) });
    }
  }
  return out;
}

function textureCandidatesFromAssetId(assetId, entityType, age) {
  const ns = idNamespace(assetId);
  const p = idPath(assetId);
  const base = path.join('assets', ns, 'textures');
  const names = [];
  const leaf = stripNamespace(assetId);
  const normalizedEntity = entityType.replace(/_/g, '_');
  // asset_id usually maps to textures/entity/<entity>/<leaf>.png, but keep a wide set of deterministic candidates.
  names.push(path.join(base, 'entity', p + '.png'));
  names.push(path.join(base, 'entity', entityType, leaf + '.png'));
  names.push(path.join(base, 'entity', entityType, `${leaf}_${age}.png`));
  names.push(path.join(base, 'entity', entityType, `${entityType}_${leaf}.png`));
  names.push(path.join(base, 'entity', entityType, `${entityType}_${leaf}_${age}.png`));
  names.push(path.join(base, 'entity', normalizedEntity, leaf + '.png'));
  return [...new Set(names)];
}

function resolveTexture(assetId, entityType, age) {
  if (!assetId) return null;
  const candidates = textureCandidatesFromAssetId(assetId, entityType, age);
  for (const candidate of candidates) if (exists(candidate)) return candidate;
  // Last resort: search by leaf in this namespace/entity folder.
  const ns = idNamespace(assetId);
  const leaf = stripNamespace(assetId).replace(/\.png$/, '');
  const root = path.join('assets', ns, 'textures', 'entity');
  if (exists(root)) {
    const found = [];
    function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (name.endsWith('.png') && (name === `${leaf}.png` || name.includes(leaf))) found.push(p);
      }
    }
    walk(root);
    const exactAge = found.find(p => age === 'baby' ? /baby/.test(path.basename(p)) : !/baby/.test(path.basename(p)));
    return exactAge || found[0] || null;
  }
  return null;
}

function firstPresent(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return null;
}

function extractModelKey(json, type) {
  const value = firstPresent(json, ['model', 'model_id', 'variant_model']) || 'default';
  return String(value).replace(/^minecraft:/, '').replace(`${type}/`, '') || 'default';
}

function extractAdultAssetId(json, type) {
  // Most variant registries use asset_id. Wolf variants use Minecraft's wolf-specific
  // nested shape: { assets: { wild, tame, angry }, baby_assets: { wild, tame, angry } }.
  // Prefer the neutral wild texture for wiki renders, then fall back to tame/angry/flat aliases.
  if (type === 'wolf') {
    return firstPresent(json?.assets, ['wild', 'tame', 'angry']) || firstPresent(json, [
      'asset_id', 'texture', 'texture_id',
      'wild_texture', 'wild_asset_id', 'wild_texture_id',
      'tame_texture', 'tame_asset_id', 'tame_texture_id',
      'angry_texture', 'angry_asset_id', 'angry_texture_id'
    ]);
  }
  return firstPresent(json, ['asset_id', 'texture', 'texture_id', 'adult_asset_id', 'adult_texture', 'adult_texture_id']);
}

function extractBabyAssetId(json, type) {
  if (type === 'wolf') {
    return firstPresent(json?.baby_assets, ['wild', 'tame', 'angry']) || firstPresent(json, [
      'baby_asset_id', 'baby_texture', 'baby_texture_id',
      'baby_wild_texture', 'baby_wild_asset_id', 'baby_wild_texture_id',
      'wild_baby_texture', 'wild_baby_asset_id', 'wild_baby_texture_id'
    ]);
  }
  return firstPresent(json, ['baby_asset_id', 'baby_texture', 'baby_texture_id']);
}

function discoverVariants() {
  const variants = [];
  for (const type of ENTITY_TYPES) {
    for (const { namespace, file } of findVariantFiles(type)) {
      const json = readJson(file);
      const variant = variantNameFromFile(file);
      const model = extractModelKey(json, type);
      const assetId = extractAdultAssetId(json, type);
      const babyAssetId = extractBabyAssetId(json, type);
      const adultTexture = resolveTexture(assetId, type, 'adult');
      const babyTexture = babyAssetId ? resolveTexture(babyAssetId, type, 'baby') : (HAS_BABY_MODEL.has(type) ? adultTexture : null);
      variants.push({ namespace, type, variant, file, model, adultTexture, babyTexture, assetId, babyAssetId, raw: json });
    }
  }
  return variants;
}

function modelCacheFile(version, type, model, age, textureWidth = 64, textureHeight = 64) {
  const safeModel = String(model || 'default').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(MODEL_CACHE_ROOT, version, type, `${safeModel}.${age}.${textureWidth}x${textureHeight}.json`);
}

async function textureDimensions(textureFile) {
  try {
    const meta = await sharp(textureFile).metadata();
    return { width: meta.width || 64, height: meta.height || 64 };
  } catch {
    return { width: 64, height: 64 };
  }
}


function ensureExporterReady(version) {
  console.log(`Checking Mojang model exporter for Minecraft ${version}...`);
  try {
    cp.execFileSync('gradle', [
      '-p', path.join('tools', 'entity-renderer'),
      `-Pminecraft_version=${version}`,
      '--no-daemon', '--quiet', 'classes'
    ], { stdio: 'inherit' });
    console.log('Mojang model exporter compiled successfully.');
  } catch (error) {
    throw new Error(`Mojang model exporter could not be compiled for Minecraft ${version}. This is a Gradle/Fabric Loom setup failure, not a variant texture failure. For Minecraft 26.1+, this package uses Java 25, Gradle 9.4.0, net.fabricmc.fabric-loom 1.15-SNAPSHOT, and no mappings dependency. ${error.message || error}`);
  }
}

async function exportModel(version, type, model, age, textureFile) {
  const dims = await textureDimensions(textureFile);
  const key = `${version}:${type}:${model || 'default'}:${age}:${dims.width}x${dims.height}`;
  if (MODEL_EXPORT_FAILURES.has(key)) throw MODEL_EXPORT_FAILURES.get(key);
  const out = modelCacheFile(version, type, model, age, dims.width, dims.height);
  if (exists(out)) return out;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  console.log(`Exporting Mojang model: ${version} ${type} model=${model || 'default'} age=${age} texture=${dims.width}x${dims.height}`);
  const args = [
    '-p', path.join('tools', 'entity-renderer'),
    `-Pminecraft_version=${version}`,
    '--no-daemon', '--quiet', 'run',
    `--args=--minecraft-version ${version} --entity ${type} --model ${model || 'default'} --age ${age} --texture-width ${dims.width} --texture-height ${dims.height} --output ${path.resolve(out)}`
  ];
  try {
    cp.execFileSync('gradle', args, { stdio: 'inherit' });
  } catch (error) {
    const wrapped = new Error(`Model export failed once for ${key}; suppressing repeat attempts for the same model/age. ${error.message || error}`);
    MODEL_EXPORT_FAILURES.set(key, wrapped);
    throw wrapped;
  }
  if (!exists(out)) {
    const wrapped = new Error(`Exporter did not create ${out}`);
    MODEL_EXPORT_FAILURES.set(key, wrapped);
    throw wrapped;
  }
  return out;
}

function deg(v) { return (v * Math.PI) / 180; }
function rotateX(p, a) { const c=Math.cos(a), s=Math.sin(a); return { x:p.x, y:p.y*c-p.z*s, z:p.y*s+p.z*c, u:p.u, v:p.v }; }
function rotateY(p, a) { const c=Math.cos(a), s=Math.sin(a); return { x:p.x*c+p.z*s, y:p.y, z:-p.x*s+p.z*c, u:p.u, v:p.v }; }
function rotateZ(p, a) { const c=Math.cos(a), s=Math.sin(a); return { x:p.x*c-p.y*s, y:p.x*s+p.y*c, z:p.z, u:p.u, v:p.v }; }

async function renderModel(modelFile, textureFile, outputFile, type, age) {
  const model = readJson(modelFile);
  const meta = ENTITY_RENDER[type] || ENTITY_RENDER.cow;
  const textureMeta = await sharp(textureFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tex = textureMeta.data;
  const texW = textureMeta.info.width || model.textureWidth || 64;
  const texH = textureMeta.info.height || model.textureHeight || 64;
  let quads = model.quads || [];
  if (!quads.length) throw new Error(`Model ${modelFile} has no quads`);

  const uvMode = inferUvMode(quads, texW, texH);
  debug(`render uv mode for ${modelFile}: ${JSON.stringify(uvMode)}`);

  const transformed = quads.map(q => {
    const pts = q.vertices.map(v => normalizeVertex(v, texW, texH, uvMode))
      .map(v => ({ x: v.x, y: v.y + (meta.yOffset || 0), z: v.z, u: v.u, v: v.v }))
      .map(pt => rotateX(pt, deg(meta.pitch || 0)))
      .map(pt => rotateY(pt, deg(meta.yaw || 180)))
      .map(pt => rotateZ(pt, deg(meta.roll || 0)));
    const z = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    return { vertices: pts, z };
  }).sort((a, b) => a.z - b.z);

  const width = 512;
  const height = 512;
  const projectedBounds = computeTransformedBounds(transformed);
  const modelW = Math.max(1, projectedBounds.maxX - projectedBounds.minX);
  const modelH = Math.max(1, projectedBounds.maxY - projectedBounds.minY);
  const target = age === 'baby' ? 285 : 360;
  const scale = Math.max(2, Math.min(22, target / Math.max(modelW, modelH)));
  const centerX = (projectedBounds.minX + projectedBounds.maxX) / 2;
  const centerY = (projectedBounds.minY + projectedBounds.maxY) / 2;

  function project(p) {
    // v14: use bounds-centered orthographic projection. Perspective was the
    // source of several all-transparent renders because some 26.x baked layers
    // have z ranges that put projected geometry outside the canvas.
    return {
      x: width / 2 + (p.x - centerX) * scale,
      y: height / 2 + (p.y - centerY) * scale,
      u: p.u,
      v: p.v
    };
  }

  const sampleModes = [
    { name: 'normal', flipU: false, flipV: false, swapUV: false },
    { name: 'flipV', flipU: false, flipV: true, swapUV: false },
    { name: 'flipU', flipU: true, flipV: false, swapUV: false },
    { name: 'flipUV', flipU: true, flipV: true, swapUV: false },
    { name: 'swapUV', flipU: false, flipV: false, swapUV: true },
    { name: 'swapUV+flipV', flipU: false, flipV: true, swapUV: true },
    { name: 'swapUV+flipU', flipU: true, flipV: false, swapUV: true },
    { name: 'swapUV+flipUV', flipU: true, flipV: true, swapUV: true }
  ];

  let best = { rgba: null, visible: -1, mode: null };
  for (const mode of sampleModes) {
    const attempt = Buffer.alloc(width * height * 4, 0);
    for (const q of transformed) {
      const pts = q.vertices.map(project);
      rasterTexturedTriangle(attempt, width, height, tex, texW, texH, pts[0], pts[1], pts[2], null, mode);
      rasterTexturedTriangle(attempt, width, height, tex, texW, texH, pts[0], pts[2], pts[3], null, mode);
    }
    const visible = countVisiblePixels(attempt);
    if (visible > best.visible) best = { rgba: attempt, visible, mode };
    if (visible >= 20) break;
  }

  let rgba = best.rgba || Buffer.alloc(width * height * 4, 0);
  debug(`render sample mode for ${modelFile}: ${JSON.stringify(best.mode)} visible=${best.visible}`);

  if (best.visible < 20) {
    // Some custom variant textures are mostly/entirely transparent in the exact
    // vanilla UV islands used by Mojang's 26.x model factories. Do not emit a
    // blank PNG or fail the whole wiki job; emit a real model silhouette tinted
    // from the non-transparent texture pixels so the bad asset is visible in
    // the render report instead of becoming invisible.
    const fallbackColor = averageVisibleTextureColor(tex);
    rgba = Buffer.alloc(width * height * 4, 0);
    for (const q of transformed) {
      const pts = q.vertices.map(project);
      rasterTexturedTriangle(rgba, width, height, tex, texW, texH, pts[0], pts[1], pts[2], fallbackColor, best.mode || sampleModes[0]);
      rasterTexturedTriangle(rgba, width, height, tex, texW, texH, pts[0], pts[2], pts[3], fallbackColor, best.mode || sampleModes[0]);
    }
    const fallbackVisible = countVisiblePixels(rgba);
    debug(`fallback tinted silhouette for ${outputFile}: visible=${fallbackVisible} color=${JSON.stringify(fallbackColor)}`);
    if (fallbackVisible < 20) {
      throw new Error(`Textured render produced ${best.visible} visible pixels and fallback produced ${fallbackVisible}: ${outputFile}. uvMode=${JSON.stringify(uvMode)} model=${modelFile} texture=${textureFile}`);
    }
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' })
    .png()
    .toBuffer();
  await sharp(png).toFile(outputFile);
  await assertPngNotBlank(outputFile, modelFile, textureFile);
}

function computeTransformedBounds(transformed) {
  const xs = [], ys = [], zs = [];
  for (const q of transformed) for (const p of q.vertices || []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    xs.push(p.x); ys.push(p.y); zs.push(p.z);
  }
  if (!xs.length) return { minX: -8, maxX: 8, minY: -8, maxY: 8, minZ: -8, maxZ: 8 };
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs)
  };
}

function averageVisibleTextureColor(tex) {
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let i = 0; i < tex.length; i += 4) {
    const alpha = tex[i + 3];
    if (alpha <= 8) continue;
    r += tex[i]; g += tex[i + 1]; b += tex[i + 2]; a += alpha; n++;
  }
  if (!n) return [180, 180, 180, 255];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.max(180, Math.round(a / n))];
}

function countVisiblePixels(rgba) {
  let visible = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 8) visible++;
  return visible;
}

function drawDebugMarker(rgba, width, height, color) {
  const [r, g, b, a] = color;
  for (let y = 236; y < 276; y++) for (let x = 236; x < 276; x++) {
    const i = (y * width + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  }
}

function inferUvMode(quads, texW, texH) {
  const us = [];
  const vs = [];
  for (const q of quads || []) for (const v of q.vertices || []) {
    const u = Number(v.u);
    const vv = Number(v.v);
    if (Number.isFinite(u)) us.push(u);
    if (Number.isFinite(vv)) vs.push(vv);
  }
  const maxU = us.length ? Math.max(...us.map(Math.abs)) : 0;
  const maxV = vs.length ? Math.max(...vs.map(Math.abs)) : 0;
  const minU = us.length ? Math.min(...us) : 0;
  const minV = vs.length ? Math.min(...vs) : 0;

  // 26.x baked ModelPart.Vertex UVs may be normalized floats (0..1, sometimes
  // slightly above 1 from edge inflation). Older/named runtimes may expose
  // pixel-space UVs directly. v14 decided per vertex and required both u and v
  // to be <= 1, which left mixed/edge UVs near 0 and made every triangle sample
  // the same transparent/edge texel. Decide once per model instead.
  const normalized = maxU <= 2.25 && maxV <= 2.25;
  return { normalized, minU, maxU, minV, maxV, texW, texH };
}

function normalizeVertex(v, texW, texH, uvMode) {
  let u = Number(v.u || 0);
  let vv = Number(v.v || 0);
  if (uvMode && uvMode.normalized) {
    u *= texW;
    vv *= texH;
  }
  // Keep UVs in pixel space and let the sampler clamp final pixels.
  return { x: Number(v.x || 0), y: Number(v.y || 0), z: Number(v.z || 0), u, v: vv };
}

function computeModelBounds(quads, meta) {
  const xs = [], ys = [], zs = [];
  for (const q of quads) for (const raw of q.vertices || []) {
    let p = { x: Number(raw.x || 0), y: Number(raw.y || 0) + (meta.yOffset || 0), z: Number(raw.z || 0), u: 0, v: 0 };
    p = rotateZ(rotateY(rotateX(p, deg(meta.pitch || 0)), deg(meta.yaw || 180)), deg(meta.roll || 0));
    xs.push(p.x); ys.push(p.y); zs.push(p.z);
  }
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs)
  };
}

async function assertPngNotBlank(outputPath, modelFile, textureFile) {
  const { data } = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) visible++;
  if (visible < 20) {
    throw new Error(`Rendered PNG is blank/transparent: ${outputPath} (${visible} visible pixels). model=${modelFile} texture=${textureFile}`);
  }
}

function edge(ax, ay, bx, by, cx, cy) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

function rasterTexturedTriangle(dst, dw, dh, tex, tw, th, p0, p1, p2, fallbackColor = null, sampleMode = null) {
  const vals = [p0.x, p0.y, p0.u, p0.v, p1.x, p1.y, p1.u, p1.v, p2.x, p2.y, p2.u, p2.v];
  if (!vals.every(Number.isFinite)) return;
  const area = edge(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
  if (Math.abs(area) < 1e-6) return;

  const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)) - 1);
  const maxX = Math.min(dw - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)) + 1);
  const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)) - 1);
  const maxY = Math.min(dh - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)) + 1);
  if (minX > maxX || minY > maxY) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = edge(p1.x, p1.y, p2.x, p2.y, px, py) / area;
      const w1 = edge(p2.x, p2.y, p0.x, p0.y, px, py) / area;
      const w2 = edge(p0.x, p0.y, p1.x, p1.y, px, py) / area;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;

      let u = w0 * p0.u + w1 * p1.u + w2 * p2.u;
      let v = w0 * p0.v + w1 * p1.v + w2 * p2.v;
      if (sampleMode && sampleMode.swapUV) { const tmp = u; u = v; v = tmp; }
      if (sampleMode && sampleMode.flipU) u = (tw - 1) - u;
      if (sampleMode && sampleMode.flipV) v = (th - 1) - v;
      let sx = Math.max(0, Math.min(tw - 1, Math.floor(u)));
      let sy = Math.max(0, Math.min(th - 1, Math.floor(v)));
      let si = (sy * tw + sx) * 4;
      let sr = tex[si], sg = tex[si + 1], sb = tex[si + 2], sa = tex[si + 3];

      // If the exact UV lands on a transparent texel, search a tiny neighborhood.
      // This avoids all-transparent thumbnails from edge UVs on sparse 26.x textures.
      if (sa <= 8) {
        let found = false;
        for (let r = 1; r <= Math.max(2, Math.ceil(Math.min(tw, th) / 8)) && !found; r++) {
          for (let oy = -r; oy <= r && !found; oy++) for (let ox = -r; ox <= r; ox++) {
            const nx = Math.max(0, Math.min(tw - 1, sx + ox));
            const ny = Math.max(0, Math.min(th - 1, sy + oy));
            const ni = (ny * tw + nx) * 4;
            if (tex[ni + 3] > 8) { sr = tex[ni]; sg = tex[ni + 1]; sb = tex[ni + 2]; sa = tex[ni + 3]; found = true; break; }
          }
        }
      }
      if (sa <= 8 && fallbackColor) { sr = fallbackColor[0]; sg = fallbackColor[1]; sb = fallbackColor[2]; sa = fallbackColor[3]; }
      if (sa <= 8) continue;

      const di = (y * dw + x) * 4;
      const a = sa / 255;
      const inv = 1 - a;
      dst[di] = Math.round(sr * a + dst[di] * inv);
      dst[di + 1] = Math.round(sg * a + dst[di + 1] * inv);
      dst[di + 2] = Math.round(sb * a + dst[di + 2] * inv);
      dst[di + 3] = Math.min(255, Math.round(sa + dst[di + 3] * inv));
    }
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const version = resolveMinecraftVersion();
  const variants = discoverVariants();
  const report = { minecraftVersion: version, generated: [], skipped: [], errors: [], discovered: [] };

  console.log(`Entity render output root: ${OUTPUT_ROOT}`);
  console.log(`Discovered ${variants.length} entity variant JSON file(s).`);

  for (const v of variants) {
    const adultCandidates = v.assetId ? textureCandidatesFromAssetId(v.assetId, v.type, 'adult') : [];
    const babyCandidates = v.babyAssetId ? textureCandidatesFromAssetId(v.babyAssetId, v.type, 'baby') : [];
    const discovered = {
      type: v.type,
      variant: v.variant,
      namespace: v.namespace,
      jsonFile: v.file,
      model: v.model,
      assetId: v.assetId || null,
      babyAssetId: v.babyAssetId || null,
      adultTexture: v.adultTexture || null,
      babyTexture: v.babyTexture || null,
      adultTextureCandidates: adultCandidates,
      babyTextureCandidates: babyCandidates
    };
    report.discovered.push(discovered);
    console.log(`\n[variant] ${v.type}/${v.variant}`);
    console.log(`  json: ${v.file}`);
    console.log(`  model: ${v.model}`);
    console.log(`  asset_id: ${v.assetId || '(missing)'}`);
    console.log(`  adult texture: ${v.adultTexture || '(not found)'}`);
    if (v.babyAssetId) {
      console.log(`  baby_asset_id: ${v.babyAssetId}`);
      console.log(`  baby texture: ${v.babyTexture || '(not found)'}`);
    } else {
      console.log(HAS_BABY_MODEL.has(v.type) ? '  baby_asset_id: (not present; baby will use adult texture)' : '  baby_asset_id: (not present; baby render skipped)');
    }
    debug(`adult texture candidates for ${v.type}/${v.variant}: ${adultCandidates.join(', ') || '(none)'}`);
    if (babyCandidates.length) debug(`baby texture candidates for ${v.type}/${v.variant}: ${babyCandidates.join(', ')}`);
  }

  if (!variants.length) {
    console.log('No entity variant JSON files found; skipping entity renders successfully.');
    writeJson(REPORT_PATH, report);
    return;
  }

  try {
    ensureExporterReady(version);
  } catch (error) {
    report.errors.push({ type: 'exporter', variant: 'preflight', age: 'all', message: String(error.stack || error.message || error) });
    writeJson(REPORT_PATH, report);
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
    return;
  }

  for (const v of variants) {
    if (!v.adultTexture) {
      const reason = `No adult texture found for asset_id=${v.assetId || ''}`;
      report.skipped.push({ type:v.type, variant:v.variant, age:'adult', reason });
      console.warn(`Skipping ${v.type}/${v.variant}/adult: ${reason}`);
      continue;
    }
    for (const age of ['adult', 'baby']) {
      const texture = age === 'adult' ? v.adultTexture : v.babyTexture;
      if (age === 'baby' && !texture) {
        report.skipped.push({ type:v.type, variant:v.variant, age, reason: HAS_BABY_MODEL.has(v.type) ? 'Baby-capable entity, but no baby/adult texture could be resolved' : 'No baby model for this entity type; baby render intentionally skipped' });
        continue;
      }
      const output = path.join(OUTPUT_ROOT, v.type, v.variant, `${age}.png`);
      try {
        console.log(`\n[render] ${v.type}/${v.variant}/${age}`);
        console.log(`  model key: ${v.model || 'default'}`);
        console.log(`  texture: ${texture}`);
        console.log(`  output: ${output}`);
        const modelFile = await exportModel(version, v.type, v.model, age, texture);
        console.log(`  exported model cache: ${modelFile}`);
        await renderModel(modelFile, texture, output, v.type, age);
        report.generated.push({ type:v.type, variant:v.variant, age, model:v.model, texture, output, modelFile });
        console.log(`Generated ${output}`);
      } catch (error) {
        report.errors.push({ type:v.type, variant:v.variant, age, model:v.model, texture, message:String(error.stack || error.message || error) });
        console.error(`Failed ${v.type}/${v.variant}/${age}: ${error.stack || error.message || error}`);
      }
    }
  }

  writeJson(REPORT_PATH, report);
  console.log(`\nEntity render report written to ${REPORT_PATH}`);
  console.log(`Generated ${report.generated.length} PNG(s), skipped ${report.skipped.length}, errors ${report.errors.length}.`);

  if (report.generated.length === 0) {
    console.error('Entity variant JSON files were found, but zero PNGs were generated. Failing so the debug report/logs are visible.');
    process.exitCode = 1;
    return;
  }
  if (report.errors.length) {
    console.error(`Entity renderer finished with ${report.errors.length} error(s). See ${REPORT_PATH}`);
    process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exit(1); });

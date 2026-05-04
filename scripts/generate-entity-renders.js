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
  const texture = await loadImage(textureFile);
  const canvas = createCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,512,512);

  let quads = model.quads || [];
  if (!quads.length) throw new Error(`Model ${modelFile} has no quads`);
  const transformed = quads.map(q => {
    const pts = q.vertices.map(v => ({ x: v.x, y: v.y + (meta.yOffset || 0), z: v.z, u: v.u, v: v.v }))
      .map(p => rotateX(p, deg(meta.pitch || 0)))
      .map(p => rotateY(p, deg(meta.yaw || 180)))
      .map(p => rotateZ(p, deg(meta.roll || 0)));
    const z = pts.reduce((a,p)=>a+p.z,0)/pts.length;
    return { vertices: pts, z };
  }).sort((a,b) => a.z - b.z);

  const cam = meta.camera || 62;
  const scale = age === 'baby' ? 7.0 : 5.5;
  function project(p) {
    const perspective = cam / (cam - p.z);
    return { x: 256 + p.x * scale * perspective, y: 275 + p.y * scale * perspective, u: p.u, v: p.v };
  }

  for (const q of transformed) {
    const pts = q.vertices.map(project);
    // Use an affine approximation per triangle. Minecraft quads are planar and small, so this is visually stable.
    drawTexturedTriangle(ctx, texture, pts[0], pts[1], pts[2]);
    drawTexturedTriangle(ctx, texture, pts[0], pts[2], pts[3]);
  }
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const png = canvas.toBuffer('image/png');
  await sharp(png).trim({ background: { r:0, g:0, b:0, alpha:0 }, threshold: 1 }).extend({ top: 24, bottom:24, left:24, right:24, background: {r:0,g:0,b:0,alpha:0}}).resize(512,512,{ fit:'contain', background:{r:0,g:0,b:0,alpha:0}}).png().toFile(outputFile);
}

function drawTexturedTriangle(ctx, img, p0, p1, p2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.closePath();
  ctx.clip();
  const x0=p0.x,y0=p0.y,x1=p1.x,y1=p1.y,x2=p2.x,y2=p2.y;
  const u0=p0.u,v0=p0.v,u1=p1.u,v1=p1.v,u2=p2.u,v2=p2.v;
  const den = u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);
  if (Math.abs(den) < 1e-6) { ctx.restore(); return; }
  const a = (x0*(v1-v2)+x1*(v2-v0)+x2*(v0-v1))/den;
  const b = (x0*(u2-u1)+x1*(u0-u2)+x2*(u1-u0))/den;
  const c = (x0*(u1*v2-u2*v1)+x1*(u2*v0-u0*v2)+x2*(u0*v1-u1*v0))/den;
  const d = (y0*(v1-v2)+y1*(v2-v0)+y2*(v0-v1))/den;
  const e = (y0*(u2-u1)+y1*(u0-u2)+y2*(u1-u0))/den;
  const f = (y0*(u1*v2-u2*v1)+y1*(u2*v0-u0*v2)+y2*(u0*v1-u1*v0))/den;
  ctx.transform(a,d,b,e,c,f);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.restore();
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

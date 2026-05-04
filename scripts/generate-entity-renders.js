#!/usr/bin/env node
// scripts/generate-entity-renders.js
// Generates wiki/images/entity/<type>/<variant>/adult.png and baby.png where supported.
// Variant discovery is driven by data/<namespace>/<type>_variant/*.json so asset_id,
// baby_asset_id, and model/model-like fields are respected instead of guessed from filenames.

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const OUTPUT_ROOT = path.join("wiki", "images", "entity");
const IMAGE_SIZE = 512;
const VARIANT_DIRS = new Set([
  "cat_variant",
  "chicken_variant",
  "cow_variant",
  "frog_variant",
  "pig_variant",
  "wolf_variant",
  "zombie_nautilus_variant"
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
  return String(value || "unknown")
    .replace(/\.json$/i, "")
    .replace(/\.png$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function parseJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error.message}`);
  }
}

function assetIdToTexture(assetId) {
  if (!assetId || typeof assetId !== "string") return null;
  const [namespace, assetPath] = assetId.includes(":") ? assetId.split(/:(.*)/s).filter(Boolean) : ["minecraft", assetId];
  const candidates = [
    path.join("assets", namespace, "textures", `${assetPath}.png`),
    path.join("assets", namespace, "textures", "entity", `${assetPath}.png`),
    path.join(".cache", "vanilla-assets", "assets", namespace, "textures", `${assetPath}.png`)
  ];
  return candidates.find(file => fs.existsSync(file)) || candidates[0];
}

function collectModelHints(value, hints = []) {
  if (typeof value === "string") {
    hints.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectModelHints(item, hints);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/model|asset_id/i.test(key)) collectModelHints(child, hints);
      else if (typeof child === "object") collectModelHints(child, hints);
    }
  }
  return hints;
}

function pickModelHint(json, age) {
  const explicitKeys = age === "baby"
    ? ["baby_model", "baby_model_id", "baby_model_asset_id", "baby_model_type"]
    : ["model", "model_id", "model_asset_id", "model_type"];
  for (const key of explicitKeys) {
    if (typeof json[key] === "string") return json[key];
  }
  const hints = collectModelHints(json).join(" ").toLowerCase();
  if (hints.includes("cold")) return "cold";
  if (hints.includes("warm")) return "warm";
  if (hints.includes("temperate")) return "temperate";
  return "default";
}

function discoverVariantDefinitions() {
  const files = walkFiles("data").filter(file => file.endsWith(".json"));
  const variants = [];

  for (const file of files) {
    const segments = file.split(path.sep);
    const dir = segments[segments.length - 2];
    if (!VARIANT_DIRS.has(dir)) continue;

    const type = TYPE_BY_VARIANT_DIR[dir];
    const variant = sanitizeName(path.basename(file, ".json"));
    const json = parseJson(file);
    const adultAssetId = json.asset_id || json.texture || json.texture_asset_id;
    const babyAssetId = json.baby_asset_id || json.baby_texture || json.baby_texture_asset_id;
    const adultTexture = assetIdToTexture(adultAssetId);
    const babyTexture = babyAssetId ? assetIdToTexture(babyAssetId) : null;

    if (!adultAssetId) {
      console.warn(`No asset_id in ${file}; skipped.`);
      continue;
    }

    variants.push({
      file,
      type,
      variant,
      adultAssetId,
      babyAssetId,
      adultTexture,
      babyTexture,
      adultModelHint: pickModelHint(json, "adult"),
      babyModelHint: pickModelHint(json, "baby")
    });
  }

  variants.sort((a, b) => `${a.type}/${a.variant}`.localeCompare(`${b.type}/${b.variant}`));
  return variants;
}

function vec(x, y, z) { return { x, y, z }; }

// Render from the opposite side compared with the previous script. The prior output showed
// the back of many mobs; this 180-degree yaw makes negative-Z faces visible to the viewer.
function rotateForCamera(point) {
  return { x: -point.x, y: point.y, z: -point.z };
}

function project(point, scale, center) {
  const p = rotateForCamera(point);
  const angle = Math.PI / 6;
  const sx = (p.x - p.z) * Math.cos(angle) * scale + center.x;
  const sy = (-p.y + (p.x + p.z) * Math.sin(angle)) * scale + center.y;
  return { x: sx, y: sy };
}

function shadeCanvas(source, amount) {
  if (!amount) return source;
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = amount > 0 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${Math.abs(amount)})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function cropFace(texture, uv) {
  const u = Math.max(0, Math.min(texture.width - 1, Math.round(uv.u)));
  const v = Math.max(0, Math.min(texture.height - 1, Math.round(uv.v)));
  const w = Math.max(1, Math.min(texture.width - u, Math.round(uv.w)));
  const h = Math.max(1, Math.min(texture.height - v, Math.round(uv.h)));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(texture, u, v, w, h, 0, 0, w, h);
  return canvas;
}

function drawImageToParallelogram(ctx, image, p0, p1, p2, p3) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.clip();
  const a = (p1.x - p0.x) / image.width;
  const b = (p1.y - p0.y) / image.width;
  const c = (p3.x - p0.x) / image.height;
  const d = (p3.y - p0.y) / image.height;
  ctx.setTransform(a, b, c, d, p0.x, p0.y);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function cuboidUvs(u, v, w, h, d) {
  return {
    east:  { u,                 v: v + d, w: d, h },
    north: { u: u + d,         v: v + d, w,    h },
    west:  { u: u + d + w,     v: v + d, w: d, h },
    south: { u: u + d + w + d, v: v + d, w,    h },
    up:    { u: u + d,         v,       w,    h: d },
    down:  { u: u + d + w,     v,       w,    h: d }
  };
}

function addBox(parts, name, x, y, z, w, h, d, u, v, opts = {}) {
  parts.push({ name, x, y, z, w, h, d, u, v, inflate: opts.inflate || 0 });
}

function boxCorners(box) {
  const i = box.inflate || 0;
  return {
    x0: box.x - i,
    y0: box.y - i,
    z0: box.z - i,
    x1: box.x + box.w + i,
    y1: box.y + box.h + i,
    z1: box.z + box.d + i
  };
}

function drawBox(ctx, texture, box, renderScale, center) {
  const { x0, y0, z0, x1, y1, z1 } = boxCorners(box);
  const p = point => project(point, renderScale, center);
  const uvs = cuboidUvs(box.u, box.v, box.w, box.h, box.d);
  // Visible after the 180-degree yaw: south + west + top. This is the actual front-facing view
  // for the coordinate convention used by the profiles below.
  const faces = [
    { key: "south", shade: -0.05, pts: [vec(x1,y0,z1), vec(x0,y0,z1), vec(x0,y1,z1), vec(x1,y1,z1)] },
    { key: "west",  shade: -0.24, pts: [vec(x0,y0,z1), vec(x0,y0,z0), vec(x0,y1,z0), vec(x0,y1,z1)] },
    { key: "up",    shade:  0.10, pts: [vec(x0,y1,z0), vec(x1,y1,z0), vec(x1,y1,z1), vec(x0,y1,z1)] }
  ];
  for (const face of faces) {
    const img = shadeCanvas(cropFace(texture, uvs[face.key]), face.shade);
    const [p0, p1, p2, p3] = face.pts.map(p);
    drawImageToParallelogram(ctx, img, p0, p1, p2, p3);
  }
}

function renderParts({ texture, parts, output, age, profile }) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  ctx.imageSmoothingEnabled = false;
  const scale = (profile && profile.scale) || (age === "baby" ? 9.6 : 7.8);
  const center = (profile && profile.center) || (age === "baby" ? { x: 256, y: 300 } : { x: 256, y: 312 });
  const ordered = [...parts].sort((a, b) => ((b.z - b.x) + b.y * 0.05) - ((a.z - a.x) + a.y * 0.05));
  for (const box of ordered) drawBox(ctx, texture, box, scale, center);
  fs.writeFileSync(output, canvas.toBuffer("image/png"));
}

function scalePartsForBaby(parts, profile) {
  const bodyScale = profile.babyBodyScale || 0.55;
  const headScale = profile.babyHeadScale || 0.85;
  return parts.map(part => {
    const isHead = /head|beak|snout|ear|horn|shell|eye/i.test(part.name);
    const s = isHead ? headScale : bodyScale;
    return {
      ...part,
      x: part.x * s,
      y: part.y * s + (isHead ? 3 : 0),
      z: part.z * s,
      w: Math.max(1, Math.round(part.w * s)),
      h: Math.max(1, Math.round(part.h * s)),
      d: Math.max(1, Math.round(part.d * s)),
      inflate: (part.inflate || 0) * s
    };
  });
}

function cowParts() {
  const p = [];
  addBox(p, "body", -9, 10, -4, 18, 12, 10, 18, 4);
  addBox(p, "head", -4, 16, -13, 8, 8, 6, 0, 0);
  addBox(p, "right_horn", -5, 22, -12, 1, 3, 1, 22, 0);
  addBox(p, "left_horn", 4, 22, -12, 1, 3, 1, 22, 0);
  addBox(p, "leg_fl", -7, 0, -5, 4, 10, 4, 0, 16);
  addBox(p, "leg_fr", 3, 0, -5, 4, 10, 4, 0, 16);
  addBox(p, "leg_bl", -7, 0, 3, 4, 10, 4, 0, 16);
  addBox(p, "leg_br", 3, 0, 3, 4, 10, 4, 0, 16);
  return p;
}

function pigParts() {
  const p = [];
  addBox(p, "body", -5, 8, -8, 10, 8, 16, 28, 8);
  addBox(p, "head", -4, 12, -14, 8, 8, 8, 0, 0);
  addBox(p, "snout", -2, 12, -16, 4, 3, 1, 16, 16);
  addBox(p, "leg_fl", -5, 0, -6, 4, 8, 4, 0, 16);
  addBox(p, "leg_fr", 1, 0, -6, 4, 8, 4, 0, 16);
  addBox(p, "leg_bl", -5, 0, 4, 4, 8, 4, 0, 16);
  addBox(p, "leg_br", 1, 0, 4, 4, 8, 4, 0, 16);
  return p;
}

function chickenParts(modelHint = "default") {
  const p = [];
  if (/cold|penguin/i.test(modelHint)) {
    addBox(p, "body", -4, 4, -4, 8, 10, 7, 0, 9);
    addBox(p, "head", -3, 14, -5, 6, 5, 4, 0, 0);
    addBox(p, "beak", -2, 13, -7, 4, 2, 2, 14, 0);
    addBox(p, "wing_l", -6, 6, -3, 2, 7, 5, 24, 13);
    addBox(p, "wing_r", 4, 6, -3, 2, 7, 5, 24, 13);
  } else {
    addBox(p, "body", -3, 5, -3, 6, 8, 6, 0, 9);
    addBox(p, "head", -2, 13, -5, 4, 6, 3, 0, 0);
    addBox(p, "beak", -2, 13, -7, 4, 2, 2, 14, 0);
    addBox(p, "wing_l", -5, 6, -2, 2, 6, 4, 24, 13);
    addBox(p, "wing_r", 3, 6, -2, 2, 6, 4, 24, 13);
  }
  addBox(p, "leg_l", -2, 0, -1, 1, 5, 1, 26, 0);
  addBox(p, "leg_r", 1, 0, -1, 1, 5, 1, 26, 0);
  return p;
}

function wolfParts() {
  const p = [];
  addBox(p, "body", -4, 8, -7, 8, 6, 14, 18, 14);
  addBox(p, "head", -3, 12, -13, 6, 6, 4, 0, 0);
  addBox(p, "snout", -2, 12, -16, 4, 3, 3, 0, 10);
  addBox(p, "ear_l", -3, 18, -11, 2, 2, 1, 16, 14);
  addBox(p, "ear_r", 1, 18, -11, 2, 2, 1, 16, 14);
  addBox(p, "tail", -2, 12, 7, 4, 4, 8, 9, 18);
  addBox(p, "leg_fl", -4, 0, -5, 2, 8, 2, 0, 18);
  addBox(p, "leg_fr", 2, 0, -5, 2, 8, 2, 0, 18);
  addBox(p, "leg_bl", -4, 0, 4, 2, 8, 2, 0, 18);
  addBox(p, "leg_br", 2, 0, 4, 2, 8, 2, 0, 18);
  return p;
}

function catParts() {
  const p = [];
  addBox(p, "body", -3, 7, -6, 6, 6, 12, 20, 0);
  addBox(p, "head", -3, 12, -12, 6, 6, 5, 0, 0);
  addBox(p, "ear_l", -3, 18, -10, 2, 2, 1, 0, 24);
  addBox(p, "ear_r", 1, 18, -10, 2, 2, 1, 0, 24);
  addBox(p, "tail", -1, 12, 6, 2, 2, 10, 0, 15);
  addBox(p, "leg_fl", -3, 0, -4, 2, 7, 2, 8, 13);
  addBox(p, "leg_fr", 1, 0, -4, 2, 7, 2, 8, 13);
  addBox(p, "leg_bl", -3, 0, 3, 2, 7, 2, 8, 13);
  addBox(p, "leg_br", 1, 0, 3, 2, 7, 2, 8, 13);
  return p;
}

function frogParts() {
  const p = [];
  addBox(p, "body", -3.5, 4, -4, 7, 5, 9, 3, 1);
  addBox(p, "head", -3.5, 8, -7, 7, 5, 7, 23, 1);
  addBox(p, "eye_l", -3.5, 12, -5, 2, 2, 2, 0, 13);
  addBox(p, "eye_r", 1.5, 12, -5, 2, 2, 2, 0, 13);
  addBox(p, "leg_fl", -5, 1, -5, 3, 3, 5, 0, 23);
  addBox(p, "leg_fr", 2, 1, -5, 3, 3, 5, 0, 23);
  addBox(p, "leg_bl", -5, 0, 2, 3, 3, 5, 0, 32);
  addBox(p, "leg_br", 2, 0, 2, 3, 3, 5, 0, 32);
  return p;
}

function zombieNautilusParts() {
  const p = [];
  // Approximation of the Drowned/Zombie Nautilus style: humanoid rider/body plus a shell.
  addBox(p, "torso", -4, 9, -2, 8, 12, 4, 16, 16);
  addBox(p, "head", -4, 21, -4, 8, 8, 8, 0, 0);
  addBox(p, "right_arm", -8, 9, -2, 4, 12, 4, 40, 16);
  addBox(p, "left_arm", 4, 9, -2, 4, 12, 4, 40, 16);
  addBox(p, "right_leg", -4, 0, -2, 4, 9, 4, 0, 16);
  addBox(p, "left_leg", 0, 0, -2, 4, 9, 4, 0, 16);
  addBox(p, "shell", -7, 5, 3, 14, 14, 6, 32, 0, { inflate: 0.25 });
  return p;
}

const ENTITY_RENDERERS = {
  cow: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: () => cowParts() },
  pig: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: () => pigParts() },
  chicken: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: hint => chickenParts(hint) },
  wolf: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: () => wolfParts() },
  cat: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: () => catParts() },
  frog: { hasBaby: false, parts: () => frogParts(), scale: 11, center: { x: 256, y: 300 } },
  zombie_nautilus: { hasBaby: false, parts: () => zombieNautilusParts(), scale: 7.2, center: { x: 256, y: 320 } }
};

function outputPath(type, variant, age) {
  return path.join(OUTPUT_ROOT, type, variant, `${age}.png`);
}

async function loadTexture(file, label) {
  if (!file || !fs.existsSync(file)) {
    throw new Error(`Missing texture for ${label}: ${file || "<none>"}`);
  }
  return loadImage(file);
}

async function renderOne({ type, variant, textureFile, modelHint, age, profile }) {
  const texture = await loadTexture(textureFile, `${type}/${variant}/${age}`);
  const parts = profile.parts(modelHint);
  renderParts({ texture, parts, output: outputPath(type, variant, age), age, profile });
}

async function main() {
  const version = readVanillaVersion();
  console.log(`Generating entity renders using renderer profiles for Minecraft ${version}.`);
  console.log("Variant JSONs are the source of truth: data/<namespace>/<type>_variant/*.json.");

  const variants = discoverVariantDefinitions();
  if (variants.length === 0) {
    console.log("No supported entity variant JSON files found.");
    return;
  }

  let generated = 0;
  for (const variant of variants) {
    const profile = ENTITY_RENDERERS[variant.type];
    if (!profile) {
      console.warn(`No renderer profile for entity type "${variant.type}"; skipped ${variant.file}.`);
      continue;
    }

    try {
      await renderOne({
        type: variant.type,
        variant: variant.variant,
        textureFile: variant.adultTexture,
        modelHint: variant.adultModelHint,
        age: "adult",
        profile
      });
      generated++;

      if (variant.babyAssetId || profile.hasBaby) {
        await renderOne({
          type: variant.type,
          variant: variant.variant,
          textureFile: variant.babyTexture || variant.adultTexture,
          modelHint: variant.babyModelHint || variant.adultModelHint,
          age: "baby",
          profile: { ...profile, parts: hint => scalePartsForBaby(profile.parts(hint), profile) }
        });
        generated++;
      }

      console.log(`Rendered ${variant.type}/${variant.variant} (${variant.adultAssetId}${variant.babyAssetId ? `, baby ${variant.babyAssetId}` : ""})`);
    } catch (error) {
      console.warn(`Skipped ${variant.type}/${variant.variant}: ${error.message}`);
    }
  }

  console.log(`Generated ${generated} entity render image(s) in ${OUTPUT_ROOT}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

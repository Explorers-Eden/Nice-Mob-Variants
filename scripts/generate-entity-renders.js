#!/usr/bin/env node
// scripts/generate-entity-renders.js
// Generates wiki/images/entity/<type>/<variant>/adult.png and baby.png where supported.
// This is a version-aware, profile-based Java mob renderer. Minecraft Java does not ship
// most entity models as JSON, so supported entities are implemented as reusable cuboid profiles.

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const OUTPUT_ROOT = path.join("wiki", "images", "entity");
const VANILLA_ASSET_ROOT = path.join(".cache", "vanilla-assets", "assets", "minecraft", "textures", "entity");
const IMAGE_SIZE = 512;
const KNOWN_TYPES = new Set(["cat", "chicken", "cow", "frog", "pig", "wolf"]);

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
    .replace(/\.png$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function getEntitySegments(file) {
  const normalized = file.split(path.sep).join("/");
  const marker = "textures/entity/";
  const index = normalized.indexOf(marker);
  if (index === -1) return [];
  return normalized.slice(index + marker.length).split("/");
}

function discoverVariantTextures() {
  const roots = walkFiles("assets")
    .filter(file => file.endsWith(".png"))
    .filter(file => file.split(path.sep).includes("textures") && file.split(path.sep).includes("entity"))
    .filter(file => !file.split(path.sep).includes("minecraft"));

  const variants = [];

  for (const file of roots) {
    const segments = getEntitySegments(file);
    if (segments.length === 0) continue;

    const basename = path.basename(file, ".png");
    const lowerSegments = segments.map(segment => segment.toLowerCase().replace(/\.png$/i, ""));

    let type = lowerSegments.find(segment => KNOWN_TYPES.has(segment));
    if (!type) {
      const byPrefix = [...KNOWN_TYPES].find(candidate => basename.toLowerCase() === candidate || basename.toLowerCase().startsWith(`${candidate}_`));
      type = byPrefix || lowerSegments[0];
    }

    if (!KNOWN_TYPES.has(type)) continue;

    let variant = basename;
    if (variant.toLowerCase() === type && segments.length >= 2) {
      variant = segments[segments.length - 2];
    } else if (variant.toLowerCase().startsWith(`${type}_`)) {
      variant = variant.slice(type.length + 1);
    }

    variants.push({
      type,
      variant: sanitizeName(variant),
      texture: file
    });
  }

  variants.sort((a, b) => `${a.type}/${a.variant}`.localeCompare(`${b.type}/${b.variant}`));
  return variants;
}

function vec(x, y, z) {
  return { x, y, z };
}

function project(point, scale, center) {
  const angle = Math.PI / 6;
  const sx = (point.x - point.z) * Math.cos(angle) * scale + center.x;
  const sy = (-point.y + (point.x + point.z) * Math.sin(angle)) * scale + center.y;
  return { x: sx, y: sy };
}

function shadeCanvas(source, amount) {
  if (!amount) return source;
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = amount > 0 ? "source-atop" : "multiply";
  ctx.fillStyle = amount > 0 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${Math.abs(amount)})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

function cropFace(texture, uv) {
  const canvas = createCanvas(Math.max(1, uv.w), Math.max(1, uv.h));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(texture, uv.u, uv.v, uv.w, uv.h, 0, 0, uv.w, uv.h);
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
    west:  { u,             v: v + d, w: d, h },
    north: { u: u + d,     v: v + d, w,    h },
    east:  { u: u + d + w, v: v + d, w: d, h },
    south: { u: u + d + w + d, v: v + d, w, h },
    up:    { u: u + d,     v,       w,    h: d },
    down:  { u: u + d + w, v,       w,    h: d }
  };
}

function addBox(parts, name, x, y, z, w, h, d, u, v, opts = {}) {
  parts.push({ name, x, y, z, w, h, d, u, v, inflate: opts.inflate || 0, mirror: !!opts.mirror });
}

function boxCorners(box) {
  const i = box.inflate || 0;
  const x0 = box.x - i;
  const y0 = box.y - i;
  const z0 = box.z - i;
  const x1 = box.x + box.w + i;
  const y1 = box.y + box.h + i;
  const z1 = box.z + box.d + i;
  return { x0, y0, z0, x1, y1, z1 };
}

function drawBox(ctx, texture, box, renderScale, center) {
  const { x0, y0, z0, x1, y1, z1 } = boxCorners(box);
  const p = point => project(point, renderScale, center);
  const uvs = cuboidUvs(box.u, box.v, box.w, box.h, box.d);

  const faces = [
    { key: "north", shade: -0.16, pts: [vec(x0,y0,z0), vec(x1,y0,z0), vec(x1,y1,z0), vec(x0,y1,z0)] },
    { key: "east",  shade: -0.26, pts: [vec(x1,y0,z0), vec(x1,y0,z1), vec(x1,y1,z1), vec(x1,y1,z0)] },
    { key: "up",    shade:  0.08, pts: [vec(x0,y1,z0), vec(x1,y1,z0), vec(x1,y1,z1), vec(x0,y1,z1)] }
  ];

  for (const face of faces) {
    const img = shadeCanvas(cropFace(texture, uvs[face.key]), face.shade);
    const [p0, p1, p2, p3] = face.pts.map(p);
    drawImageToParallelogram(ctx, img, p0, p1, p2, p3);
  }
}

function renderParts({ texture, parts, output, age }) {
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  ctx.imageSmoothingEnabled = false;

  const scale = age === "baby" ? 8.8 : 7.3;
  const center = age === "baby" ? { x: 256, y: 292 } : { x: 256, y: 302 };

  // Painter order: lower/farther parts first, then torso/head.
  const ordered = [...parts].sort((a, b) => (a.z + a.x + a.y * 0.05) - (b.z + b.x + b.y * 0.05));
  for (const box of ordered) drawBox(ctx, texture, box, scale, center);

  fs.writeFileSync(output, canvas.toBuffer("image/png"));
}

function scalePartsForBaby(parts, profile) {
  const baby = [];
  const bodyScale = profile.babyBodyScale || 0.55;
  const headScale = profile.babyHeadScale || 0.82;

  for (const part of parts) {
    const isHead = /head|beak|snout|ear|horn/i.test(part.name);
    const s = isHead ? headScale : bodyScale;
    baby.push({
      ...part,
      x: part.x * s,
      y: part.y * s + (isHead ? 3 : 0),
      z: part.z * s,
      w: Math.max(1, Math.round(part.w * s)),
      h: Math.max(1, Math.round(part.h * s)),
      d: Math.max(1, Math.round(part.d * s)),
      inflate: (part.inflate || 0) * s
    });
  }
  return baby;
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

function chickenParts() {
  const p = [];
  addBox(p, "body", -3, 5, -3, 6, 8, 6, 0, 9);
  addBox(p, "head", -2, 13, -5, 4, 6, 3, 0, 0);
  addBox(p, "beak", -2, 13, -7, 4, 2, 2, 14, 0);
  addBox(p, "wing_l", -5, 6, -2, 2, 6, 4, 24, 13);
  addBox(p, "wing_r", 3, 6, -2, 2, 6, 4, 24, 13);
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

const ENTITY_RENDERERS = {
  cow: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: cowParts },
  pig: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: pigParts },
  chicken: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: chickenParts },
  wolf: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: wolfParts },
  cat: { hasBaby: true, babyBodyScale: 0.55, babyHeadScale: 0.85, parts: catParts },
  frog: { hasBaby: false, parts: frogParts }
};

function outputPath(type, variant, age) {
  return path.join(OUTPUT_ROOT, type, variant, `${age}.png`);
}

async function loadTexture(file) {
  return loadImage(file);
}

async function main() {
  const version = readVanillaVersion();
  console.log(`Generating entity renders using vanilla asset cache for Minecraft ${version}.`);
  if (!fs.existsSync(VANILLA_ASSET_ROOT)) {
    console.warn(`Vanilla entity texture directory not found at ${VANILLA_ASSET_ROOT}. Continuing with mod textures only.`);
  }

  const variants = discoverVariantTextures();
  if (variants.length === 0) {
    console.log("No supported entity variant textures found.");
    return;
  }

  let generated = 0;
  for (const variant of variants) {
    const profile = ENTITY_RENDERERS[variant.type];
    if (!profile) {
      console.warn(`No renderer profile for entity type "${variant.type}"; skipped ${variant.texture}.`);
      continue;
    }

    const texture = await loadTexture(variant.texture);
    const adultParts = profile.parts();
    renderParts({ texture, parts: adultParts, output: outputPath(variant.type, variant.variant, "adult"), age: "adult" });
    generated++;

    if (profile.hasBaby) {
      const babyParts = scalePartsForBaby(adultParts, profile);
      renderParts({ texture, parts: babyParts, output: outputPath(variant.type, variant.variant, "baby"), age: "baby" });
      generated++;
    }

    console.log(`Rendered ${variant.type}/${variant.variant}`);
  }

  console.log(`Generated ${generated} entity render image(s) in ${OUTPUT_ROOT}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

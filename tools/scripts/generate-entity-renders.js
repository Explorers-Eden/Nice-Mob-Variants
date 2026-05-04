import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { OBJLoader } from 'three-stdlib';
import { createCanvas } from 'canvas';
import gl from 'gl';

const SIZE = 256;
const CAMERA_MODE = process.env.CAMERA_MODE || 'wiki';

function createCamera() {
  const s = 18;
  const camera = new THREE.OrthographicCamera(-s, s, s, -s, 0.1, 1000);

  if (CAMERA_MODE === 'showcase') {
    camera.position.set(30, 18, 30);
    camera.lookAt(0, 8, 0);
  } else {
    camera.position.set(25, 25, 25);
    camera.lookAt(0, 10, 0);
  }
  return camera;
}

function loadOBJ(file) {
  const loader = new OBJLoader();
  return loader.parse(fs.readFileSync(file, 'utf8'));
}

function loadTexture(file) {
  const tex = new THREE.TextureLoader().load(file);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  return tex;
}

function render({ objPath, texturePath, output }) {
  const context = gl(SIZE, SIZE, { preserveDrawingBuffer: true });

  const renderer = new THREE.WebGLRenderer({ context, alpha: true, antialias: false });
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = createCamera();

  const obj = loadOBJ(objPath);
  const texture = loadTexture(texturePath);

  obj.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    }
  });

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());

  obj.position.sub(center);
  obj.scale.setScalar(14 / size);

  scene.add(obj);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  context.readPixels(0, 0, SIZE, SIZE, context.RGBA, context.UNSIGNED_BYTE, pixels);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);

  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, canvas.toBuffer('image/png'));

  console.log(`✓ ${output}`);
}

console.log("Renderer ready.");

// The DESIGN.md look in three.js. Every project imports this instead of writing its own,
// so models from the forge, from kits and from official sources end up in one style under one light rig.
//
//   import { applyHouseStyle, applyLighting } from '<tooling>/runtime/house-style.js';
//   const design = await (await fetch('design.json')).json();   // node tools/design-tokens.mjs DESIGN.md design.json
//   applyLighting(scene, renderer, design);
//   applyHouseStyle(gltf.scene, design);
import * as THREE from 'three';

const cache = new WeakMap();

// One shared material per role, so every model reuses the same few materials.
function role(design, name) {
  let byName = cache.get(design);
  if (!byName) cache.set(design, (byName = {}));
  if (!byName[name]) {
    const t = design.materials[name];
    byName[name] = new THREE.MeshStandardMaterial({
      name, color: t.color, roughness: t.roughness ?? 0.6, metalness: t.metalness ?? 0,
      emissive: t.emissive ? t.color : 0x000000, emissiveIntensity: t.emissive || 0,
    });
  }
  return byName[name];
}

function pick(design, m) {
  if (design.materials[m.name]) return role(design, m.name);
  for (const [pattern, name] of Object.entries(design.kit || {})) {
    if (new RegExp(pattern, 'i').test(m.name)) return role(design, name);
  }
  if (m.map) {
    console.warn(`house-style: textured material "${m.name}" kept as is; map it in DESIGN.md kit or retexture it`);
    return m;
  }
  // ponytail: nearest colour in RGB, good enough to flag; the fix is a kit entry, not a better metric
  const c = m.color || new THREE.Color(0x888888);
  let best, dist = Infinity;
  for (const [name, t] of Object.entries(design.materials)) {
    if (t.emissive) continue; // a guessed match must never make a crate glow
    const d = new THREE.Color(t.color).sub(c).toArray().reduce((s, v) => s + v * v, 0);
    if (d < dist) [best, dist] = [name, d];
  }
  console.warn(`house-style: material "${m.name}" is not in DESIGN.md kit; using nearest role "${best}"`);
  return role(design, best);
}

// Materials are shared per role: clone one before changing it on a single object (hover, fade),
// or every model with that role changes too.
export function applyHouseStyle(root, design) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => pick(design, m)) : pick(design, o.material);
    o.castShadow = o.receiveShadow = true;
  });
  return root;
}

// Call once per scene: a second call adds a second rig.
export function applyLighting(scene, renderer, design) {
  const L = design.lighting;
  renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[L.toneMapping] ?? THREE.NoToneMapping;
  renderer.toneMappingExposure = L.exposure ?? 1;
  renderer.shadowMap.enabled = true;
  scene.background = new THREE.Color(L.sky);
  // metals reflect only their environment; without one they render black. A sky-coloured
  // environment matches the forge previews, where Cycles reflects the same sky.
  const env = new THREE.Scene();
  env.background = new THREE.Color(L.sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env).texture;
  pmrem.dispose();
  if (L.fog) scene.fog = new THREE.Fog(L.fog.color, L.fog.near, L.fog.far);
  const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.ambient ?? 1);
  const sun = new THREE.DirectionalLight(L.sunColor ?? 0xffffff, L.sun ?? 2.5);
  // same angles as the forge previews; three.js is Y-up, so azimuth turns around Y
  sun.position.setFromSphericalCoords(50, THREE.MathUtils.degToRad(90 - (L.elevation ?? 40)), THREE.MathUtils.degToRad(L.azimuth ?? 35));
  sun.castShadow = true;
  scene.add(hemi, sun);
  return { hemi, sun };
}

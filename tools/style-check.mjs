// Fails when a design or a model drifts from DESIGN.md.
//
//   node tools/style-check.mjs DESIGN.md [model.glb ...]
//
// 1. Google's DESIGN.md linter, minus the warnings our documented 3D extension causes.
// 2. The 3D keys: core material roles exist, every colour resolves, budgets are set, a role's `detail` and
//    `lit` and `weathering`, the `weathering` coat and the `quality` presets hold only values the house style knows.
// 3. Each GLB: material names are roles, colours and roughness match their token,
//    triangles and height fit the budget of its class (file-name prefix, else "prop"),
//    and, for a model built on roles (a forge recipe's), no faces lie on top of each other (coplanar-check.mjs).
// Exit 1 on any failure.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadDesign } from './design-tokens.mjs';
import { coplanar, describe } from './coplanar-check.mjs';

const CORE = ['body', 'trim', 'accent', 'metal', 'glass', 'rock', 'light'];
const EXT = ['materials', 'geometry', 'lighting', 'kit', 'quality', 'weathering'];
const TOL = 0.02;
const [designFile, ...glbs] = process.argv.slice(2);
if (!designFile) { console.error('usage: style-check.mjs DESIGN.md [model.glb ...]'); process.exit(2); }
const fails = [];

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let lint;
try {
  lint = JSON.parse(execFileSync(path.join(root, 'node_modules/.bin/design.md'), ['lint', designFile], { encoding: 'utf8' }));
} catch (e) { lint = JSON.parse(e.stdout || '{"findings":[{"severity":"error","message":"linter failed to run"}]}'); }
const d = loadDesign(designFile);
// colours the 3D keys reference by name; the linter only counts references from components
const used = new Set([...fs.readFileSync(designFile, 'utf8').matchAll(/\{colors\.([\w-]+)\}/g)].map(m => m[1]));
for (const f of lint.findings) {
  if (f.severity === 'info') continue;
  if (EXT.includes(f.path) && /not a recognized schema key/.test(f.message)) continue;
  const c = f.path?.match(/^colors\.(.+)$/);
  if (c && /never referenced/.test(f.message) && used.has(c[1])) continue;
  fails.push(`lint ${f.severity}: ${f.path ?? ''} ${f.message}`);
}

const mats = d.materials || {};
for (const r of CORE) if (!mats[r]) fails.push(`materials: core role "${r}" is missing`);
for (const [n, m] of Object.entries(mats)) if (!/^#[0-9a-f]{6}$/i.test(m.color)) fails.push(`materials.${n}: color "${m.color}" is not a #rrggbb value`);
// what godot/addons/forge (house_style.gd, surface.gdshader) reads; a typo there would silently show nothing
const PATTERNS = ['grain', 'bricks', 'tiles', 'planks'];
const QUALITY = {
  msaa: v => [0, 2, 4, 8].includes(v), scale: v => v >= 0.25 && v <= 1, shadows: v => [0, 1, 2, 4].includes(v),
  shadowMap: v => [256, 512, 1024, 2048, 4096].includes(v), glow: v => typeof v === 'number' && v >= 0,
  lamps: v => Number.isInteger(v) && v >= 0, detail: v => ['off', 'code', 'texture'].includes(v),
  shadowRange: v => typeof v === 'number' && v > 0, shadowFilter: v => [0, 1, 2, 3, 4, 5].includes(v),
  normalBias: v => typeof v === 'number' && v >= 0, pixels: v => typeof v === 'number' && v >= 0,
  aniso: v => [0, 1, 2, 3, 4].includes(v), fog: v => typeof v === 'boolean', ssao: v => typeof v === 'boolean',
  vsync: v => typeof v === 'boolean', maxFps: v => Number.isInteger(v) && v >= 0,
  // read by the game's own restyle, not by set_quality() (house_style.gd KNOBS marks them `game`)
  trail: v => [256, 512, 1024, 2048, 4096].includes(v), particles: v => typeof v === 'number' && v >= 0 && v <= 1,
  ground: v => ['flat', 'cheap', 'full'].includes(v),
  start: v => ['phone', 'desktop'].includes(v),  // default_quality(): where a game starts before the player chooses
};
const hex = v => /^#[0-9a-f]{6}$/i.test(v), size = v => [v].flat().every(n => typeof n === 'number' && n > 0) && [v].flat().length <= 2;
for (const [n, m] of Object.entries(mats)) {
  const t = m.detail, l = m.lit;
  if (t) {
    if (!PATTERNS.includes(t.pattern)) fails.push(`materials.${n}.detail.pattern "${t.pattern}" is not one of ${PATTERNS.join(', ')}`);
    if (!size(t.size ?? 1) || !size(t.textureSize ?? 1)) fails.push(`materials.${n}.detail: size and textureSize are metres, a number or [w, h]`);
    if (!((t.strength ?? 0.4) >= 0 && (t.strength ?? 0.4) <= 1)) fails.push(`materials.${n}.detail.strength is 0 to 1`);
    if (t.texture && !fs.existsSync(path.join(path.dirname(designFile), t.texture))) fails.push(`materials.${n}.detail.texture: no file ${t.texture} beside ${path.basename(designFile)}`);
  }
  if (l && !(hex(l.color) && (l.share ?? 0.5) >= 0 && (l.share ?? 0.5) <= 1 && (l.period ?? 60) > 0)) fails.push(`materials.${n}.lit needs a #rrggbb color, a share of 0 to 1 and a period in seconds`);
  if (m.weathering !== undefined && !(m.weathering >= 0 && m.weathering <= 1)) fails.push(`materials.${n}.weathering is the role's share of the coat, 0 to 1`);
}
// skills/surface-weathering: the coat house_style.gd lays over every role (surface.gdshader COAT)
const w = d.weathering;
if (w) {
  const unit = v => v === undefined || (typeof v === 'number' && v >= 0 && v <= 1);
  if (!hex(w.color)) fails.push(`weathering.color "${w.color}" is not a #rrggbb value`);
  for (const k of ['amount', 'side', 'crevice']) if (!unit(w[k])) fails.push(`weathering.${k} is 0 to 1`);
  if (!size(w.noise ?? 1) || !size(w.textureSize ?? 1)) fails.push('weathering: noise and textureSize are metres');
  if (w.texture && !fs.existsSync(path.join(path.dirname(designFile), w.texture))) fails.push(`weathering.texture: no file ${w.texture} beside ${path.basename(designFile)}`);
  if (w.clean) try { new RegExp(w.clean); } catch { fails.push(`weathering.clean "${w.clean}" is not a regular expression`); }
  const known = ['color', 'amount', 'side', 'crevice', 'noise', 'texture', 'textureSize', 'clean'];
  for (const k of Object.keys(w)) if (!known.includes(k)) fails.push(`weathering.${k} is not a key house_style.gd reads (${known.join(', ')})`);
}
// a planet's night sky (house_style.gd _celestial(), sky.gdshader): a typo there turned the sky silently empty
const C = d.lighting?.celestial;
if (C) {
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const radec = v => Array.isArray(v) && v.length === 2 && v[0] >= 0 && v[0] < 360 && Math.abs(v[1]) <= 90;
  if (!radec(C.pole) || !radec(C.sun)) fails.push('lighting.celestial: pole and sun are [RA 0..360, Dec -90..90] in degrees');
  if (!(Math.abs(C.latitude) <= 90)) fails.push('lighting.celestial.latitude is degrees, -90 to 90');
  for (const k of ['radius', 'day']) if (!(num(C[k]) && C[k] > 0)) fails.push(`lighting.celestial.${k} is a positive number (km, seconds)`);
  if (!(C.hour >= 0 && C.hour < 24)) fails.push('lighting.celestial.hour is the local solar hour, 0 to 24');
  for (const k of ['timeScale', 'tau']) if (C[k] !== undefined && !(num(C[k]) && C[k] >= 0)) fails.push(`lighting.celestial.${k} is a number of 0 or more`);
  for (const k of ['map', 'list']) if (C.stars?.[k] && !fs.existsSync(path.join(path.dirname(designFile), C.stars[k]))) fails.push(`lighting.celestial.stars.${k}: no file ${C.stars[k]} beside ${path.basename(designFile)} (tools/sky-stars.mjs bakes it)`);
  if (C.stars?.milkyColor && !hex(C.stars.milkyColor)) fails.push('lighting.celestial.stars.milkyColor is a #rrggbb value');
  if ((C.planets ?? []).length > 4 || (C.moons ?? []).length > 2) fails.push('lighting.celestial: the sky draws at most 4 planets and 2 moons');
  for (const p of C.planets ?? []) if (!(radec([p.ra, p.dec]) && num(p.mag) && hex(p.color ?? '#ffffff'))) fails.push(`lighting.celestial.planets ${p.name ?? ''}: ra, dec, mag and a #rrggbb color`);
  for (const m of C.moons ?? []) if (!(['radius', 'orbit', 'period'].every(k => num(m[k]) && m[k] > 0) && num(m.start) && hex(m.color ?? '#808080'))) fails.push(`lighting.celestial.moons ${m.name ?? ''}: radius, orbit (km), period (s) above 0, start (deg) and a #rrggbb color`);
  const known = ['pole', 'latitude', 'radius', 'day', 'sun', 'hour', 'timeScale', 'tau', 'stars', 'planets', 'moons'];
  for (const k of Object.keys(C)) if (!known.includes(k)) fails.push(`lighting.celestial.${k} is not a key house_style.gd reads (${known.join(', ')})`);
}
if (d.quality) {
  // default_quality() answers the presets marked `start: phone` and `start: desktop`, else low or high
  const starts = Object.values(d.quality).map(q => q.start).filter(Boolean);
  if (starts.length) for (const s of ['phone', 'desktop']) { if (starts.filter(x => x === s).length !== 1) fails.push(`quality: exactly one preset needs start: ${s}`); }
  else for (const level of ['low', 'medium', 'high']) if (!d.quality[level]) fails.push(`quality.${level} is missing (or mark presets with start: phone and start: desktop)`);
  for (const [level, q] of Object.entries(d.quality)) for (const [k, v] of Object.entries(q)) {
    if (!QUALITY[k]) fails.push(`quality.${level}.${k} is not a key set_quality() reads (${Object.keys(QUALITY).join(', ')})`);
    else if (!QUALITY[k](v)) fails.push(`quality.${level}.${k}: ${JSON.stringify(v)} is out of range`);
  }
}
const budgets = d.geometry?.budgets || {};
// kit models keep their own material names and take a role by DESIGN.md `kit` at load (house_style.gd _pick,
// first matching pattern, case-insensitive); `#hex` anchors are for kit-roles.mjs, not names
const kitRole = n => Object.entries(d.kit || {}).find(([p]) => !p.startsWith('#') && new RegExp(p, 'i').test(n))?.[1];
if (!budgets.prop) fails.push('geometry.budgets.prop is missing');

// column-major 4x4 helpers, enough to place a mesh's vertices in the scene
const mul = (a, b) => Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].reduce((s, k) => s + a[k * 4 + (i % 4)] * b[(i >> 2) * 4 + k], 0));
const apply = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
// getBounds() places a skinned mesh by its node, which glTF ignores: a skinned mesh sits where its
// joints put it, so at rest it is placed by joint world matrix times inverse bind matrix
// only what the scene renders: nodes outside it (a spare LOD, a helper) never show up in the game
function sceneNodes(doc) {
  const nodes = [];
  (doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])?.traverse(n => nodes.push(n));
  return nodes;
}
function bounds(doc) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const node of sceneNodes(doc)) for (const p of node.getMesh()?.listPrimitives() || []) {
    const skin = node.getSkin(), pos = p.getAttribute('POSITION');
    // no inverse bind matrices means identity (glTF spec); the skinned node's own transform never counts
    const ibm = skin?.getInverseBindMatrices()?.getElement(0, []), joint = skin?.listJoints()[0].getWorldMatrix();
    const m = skin ? (ibm ? mul(joint, ibm) : joint) : node.getWorldMatrix();
    for (let v = 0; v < pos.getCount(); v++) { // getElement undoes meshopt's normalized ints; getMin does not
      const w = apply(m, pos.getElement(v, []));
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
    }
  }
  return { min, max };
}

const lin = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
// projects ship meshopt-compressed GLBs (gltf-transform optimize); without the extensions they fail to load
await MeshoptDecoder.ready;
const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR))
  .registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const file of glbs) {
  const doc = await io.read(file);
  const name = path.basename(file, '.glb');
  const cls = budgets[name.split('_')[0]] ? name.split('_')[0] : 'prop';
  const b = budgets[cls] || {};
  let ours = true;
  for (const m of doc.getRoot().listMaterials()) {
    const t = mats[m.getName()];
    ours &&= !!t;
    if (!t) {
      const role = kitRole(m.getName());
      // mapped by name: the role's own values replace the file's at load, so there is nothing to compare.
      // `keep` keeps an official model's own photo textures (house_style.gd _pick): only a textured material may
      if (role === 'keep' && !m.getBaseColorTexture()) fails.push(`${name}: material "${m.getName()}" is kept but has no texture to keep`);
      else if (role !== 'keep' && (!role || !mats[role])) fails.push(`${name}: material "${m.getName()}" is not a DESIGN.md role or a kit name`);
      continue;
    }
    const off = Math.max(...lin(t.color).map((v, i) => Math.abs(v - m.getBaseColorFactor()[i])));
    if (off > TOL) fails.push(`${name}: "${m.getName()}" colour is off its token by ${off.toFixed(3)}`);
    const rough = t.roughness ?? 0.6; // same default as lib.py and house-style.js
    if (Math.abs(m.getRoughnessFactor() - rough) > TOL) fails.push(`${name}: "${m.getName()}" roughness ${m.getRoughnessFactor()} != ${rough}`);
    if (Math.abs(m.getMetallicFactor() - (t.metalness ?? 0)) > TOL) fails.push(`${name}: "${m.getName()}" metalness ${m.getMetallicFactor()} != ${t.metalness ?? 0}`);
  }
  let tris = 0;
  for (const node of sceneNodes(doc)) for (const p of node.getMesh()?.listPrimitives() || []) {
    tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  }
  // a kit or official model's overlaps are not ours to fix: coplanar-check.mjs reports them on request
  if (ours) for (const h of coplanar(doc)) fails.push(`${name}: ${describe(h)}`);
  const { min, max } = bounds(doc);
  const h = max[1] - min[1];
  if (b.tris && tris > b.tris) fails.push(`${name}: ${tris} triangles, ${cls} budget is ${b.tris}`);
  if (b.height && (h < b.height[0] || h > b.height[1])) fails.push(`${name}: ${h.toFixed(2)} m tall, ${cls} range is ${b.height.join('-')} m`);
  console.log(`${name}: ${cls}, ${tris} tris, ${h.toFixed(2)} m`);
}

if (fails.length) { console.error(fails.map(f => `FAIL ${f}`).join('\n')); process.exit(1); }
console.log(`OK ${designFile}${glbs.length ? ` + ${glbs.length} model(s)` : ''}`);

// Fails when a design or a model drifts from DESIGN.md.
//
//   node tools/style-check.mjs DESIGN.md [model.glb ...]
//
// 1. Google's DESIGN.md linter, minus the warnings our documented 3D extension causes.
// 2. The 3D keys: core material roles exist, every colour resolves, budgets are set, a role's `detail` and
//    `lit` and the `quality` presets hold only values the house style knows.
// 3. Each GLB: material names are roles, colours and roughness match their token,
//    triangles and height fit the budget of its class (file-name prefix, else "prop").
// Exit 1 on any failure.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadDesign } from './design-tokens.mjs';

const CORE = ['body', 'trim', 'accent', 'metal', 'glass', 'rock', 'light'];
const EXT = ['materials', 'geometry', 'lighting', 'kit', 'quality'];
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
  normalBias: v => typeof v === 'number' && v >= 0,
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
}
if (d.quality) {
  // default_quality() answers low or high, and a settings screen offers all three
  for (const level of ['low', 'medium', 'high']) if (!d.quality[level]) fails.push(`quality.${level} is missing`);
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
  for (const m of doc.getRoot().listMaterials()) {
    const t = mats[m.getName()];
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
  const { min, max } = bounds(doc);
  const h = max[1] - min[1];
  if (b.tris && tris > b.tris) fails.push(`${name}: ${tris} triangles, ${cls} budget is ${b.tris}`);
  if (b.height && (h < b.height[0] || h > b.height[1])) fails.push(`${name}: ${h.toFixed(2)} m tall, ${cls} range is ${b.height.join('-')} m`);
  console.log(`${name}: ${cls}, ${tris} tris, ${h.toFixed(2)} m`);
}

if (fails.length) { console.error(fails.map(f => `FAIL ${f}`).join('\n')); process.exit(1); }
console.log(`OK ${designFile}${glbs.length ? ` + ${glbs.length} model(s)` : ''}`);

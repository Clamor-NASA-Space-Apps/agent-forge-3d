// Fails when a design or a model drifts from DESIGN.md.
//
//   node tools/style-check.mjs DESIGN.md [model.glb ...]
//
// 1. Google's DESIGN.md linter, minus the warnings our documented 3D extension causes.
// 2. The 3D keys: core material roles exist, every colour resolves, budgets are set.
// 3. Each GLB: material names are roles, colours and roughness match their token,
//    triangles and height fit the budget of its class (file-name prefix, else "prop").
// Exit 1 on any failure.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadDesign } from './design-tokens.mjs';

const CORE = ['body', 'trim', 'accent', 'metal', 'glass', 'rock', 'light'];
const EXT = ['materials', 'geometry', 'lighting', 'kit'];
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
const budgets = d.geometry?.budgets || {};
if (!budgets.prop) fails.push('geometry.budgets.prop is missing');

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
    if (!t) { fails.push(`${name}: material "${m.getName()}" is not a DESIGN.md role`); continue; }
    const off = Math.max(...lin(t.color).map((v, i) => Math.abs(v - m.getBaseColorFactor()[i])));
    if (off > TOL) fails.push(`${name}: "${m.getName()}" colour is off its token by ${off.toFixed(3)}`);
    const rough = t.roughness ?? 0.6; // same default as lib.py and house-style.js
    if (Math.abs(m.getRoughnessFactor() - rough) > TOL) fails.push(`${name}: "${m.getName()}" roughness ${m.getRoughnessFactor()} != ${rough}`);
    if (Math.abs(m.getMetallicFactor() - (t.metalness ?? 0)) > TOL) fails.push(`${name}: "${m.getName()}" metalness ${m.getMetallicFactor()} != ${t.metalness ?? 0}`);
  }
  let tris = 0;
  for (const node of doc.getRoot().listNodes()) for (const p of node.getMesh()?.listPrimitives() || []) {
    tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  }
  const { min, max } = getBounds(doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]);
  const h = max[1] - min[1];
  if (b.tris && tris > b.tris) fails.push(`${name}: ${tris} triangles, ${cls} budget is ${b.tris}`);
  if (b.height && (h < b.height[0] || h > b.height[1])) fails.push(`${name}: ${h.toFixed(2)} m tall, ${cls} range is ${b.height.join('-')} m`);
  console.log(`${name}: ${cls}, ${tris} tris, ${h.toFixed(2)} m`);
}

if (fails.length) { console.error(fails.map(f => `FAIL ${f}`).join('\n')); process.exit(1); }
console.log(`OK ${designFile}${glbs.length ? ` + ${glbs.length} model(s)` : ''}`);

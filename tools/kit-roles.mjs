#!/usr/bin/env node
// Usage: node tools/kit-roles.mjs DESIGN.md <outDir> <in.glb ...> [--palette] [--prefix building_] [--tol 60] [--scale 8]
// Kenney 2.x kits colour every model from one atlas texture ("colormap"), so one material covers
// walls, roofs and windows and applyHouseStyle() can only paint the whole model one role.
// This reads the atlas colour under each triangle, maps it to a role through the `#rrggbb: role`
// entries of DESIGN.md `kit`, and writes one primitive per role with DESIGN.md's material values.
//   --palette   print every atlas colour the inputs use (triangle count, current role) and exit
//   --prefix    prepend a class to output names (building_, prop_ ...) so style-check budgets apply
// Exit 1 if a colour has no `kit` entry. Needs ffmpeg (PNG decode). Run gltf-transform optimize after.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { loadDesign } from './design-tokens.mjs';

const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const palette = args.includes('--palette') && args.splice(args.indexOf('--palette'), 1);
const prefix = flag('--prefix') ?? '';
const tol = Number(flag('--tol') ?? 60);
const scale = Number(flag('--scale') ?? 1);
// --palette writes nothing, so it takes no outDir
const [designFile, ...rest] = args;
const outDir = palette ? null : rest.shift(), inputs = rest;
if (!inputs.length) { console.error('usage: kit-roles.mjs DESIGN.md <outDir> <in.glb ...> [--prefix building_] [--tol 60] [--scale 8] | kit-roles.mjs DESIGN.md --palette <in.glb ...>'); process.exit(2); }

const design = loadDesign(designFile);
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const kitHex = Object.entries(design.kit || {}).filter(([k]) => /^#[0-9a-f]{6}$/i.test(k)).map(([k, role]) => [rgb(k), role]);
// Kenney atlas swatches are small gradients, so `#hex` entries are anchors: each colour takes the
// nearest anchor's role (RGB distance), unless every anchor is further than --tol (default 60).
const roleOf = c => {
  let best = null, dist = tol;
  for (const [k, role] of kitHex) { const d = Math.hypot(...k.map((v, i) => v - c[i])); if (d <= dist) [best, dist] = [role, d]; }
  return best;
};
const wrap = (a, mode) => {
  if (mode === 33071) return Math.min(Math.max(a, 0), 1 - 1e-6); // CLAMP_TO_EDGE
  if (mode === 33648) { const f = a - 2 * Math.floor(a / 2); return f > 1 ? 2 - f : f; } // MIRRORED_REPEAT
  return a - Math.floor(a); // REPEAT
};
const hexOf = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR)).registerExtensions(ALL_EXTENSIONS);
const pixels = new Map();
function decode(tex) {
  if (!pixels.has(tex)) {
    const [w, h] = tex.getSize();
    const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: tex.getImage(), maxBuffer: w * h * 3 + 1024 });
    pixels.set(tex, { w, h, raw });
  }
  return pixels.get(tex);
}

const seen = new Map(); // hex -> triangles, for --palette and the unmapped report
let unmapped = 0;
if (!palette) mkdirSync(outDir, { recursive: true });
for (const file of inputs) {
  const doc = await io.read(file);
  const roleMats = {}, atlasMats = new Set();
  let holes = 0;
  const roleMat = role => roleMats[role] ||= (() => {
    const t = design.materials[role];
    if (!t) throw new Error(`kit maps to "${role}", which is not a DESIGN.md material role`);
    const m = doc.createMaterial(role).setBaseColorFactor([...rgb(t.color).map(lin), 1])
      .setRoughnessFactor(t.roughness ?? 0.6).setMetallicFactor(t.metalness ?? 0);
    if (t.emissive) m.setEmissiveFactor(rgb(t.color).map(lin));
    return m;
  })();
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const info = prim.getMaterial()?.getBaseColorTextureInfo(), tex = prim.getMaterial()?.getBaseColorTexture();
    if (!tex) continue; // already plain colours: applyHouseStyle maps it by name
    if (prim.getMode() !== 4) throw new Error(`${file}: primitive mode ${prim.getMode()}, only TRIANGLES (4) is supported`);
    atlasMats.add(prim.getMaterial());
    const { w, h, raw } = decode(tex);
    const tt = info.getExtension('KHR_texture_transform');
    const [ox, oy] = tt?.getOffset() ?? [0, 0], [sx, sy] = tt?.getScale() ?? [1, 1];
    const uv = prim.getAttribute(`TEXCOORD_${info.getTexCoord()}`), idx = prim.getIndices();
    const n = idx ? idx.getCount() : prim.getAttribute('POSITION').getCount();
    const at = i => (idx ? idx.getScalar(i) : i);
    const groups = {};
    for (let t = 0; t < n; t += 3) {
      let u = 0, v = 0;
      for (let k = 0; k < 3; k++) { const p = uv.getElement(at(t + k), []); u += p[0] / 3; v += p[1] / 3; }
      u = u * sx + ox; v = v * sy + oy;
      // sample the way the GPU does: REPEAT (the glTF default) wraps 1.0 to 0, CLAMP holds the edge
      const x = Math.min(w - 1, Math.floor(wrap(u, info.getWrapS()) * w)), y = Math.min(h - 1, Math.floor(wrap(v, info.getWrapT()) * h));
      const c = [...raw.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];
      const hex = hexOf(c);
      seen.set(hex, (seen.get(hex) || 0) + 1);
      const role = roleOf(c);
      if (!role) { unmapped++; holes++; continue; }
      (groups[role] ||= []).push(at(t), at(t + 1), at(t + 2));
    }
    if (palette) continue;
    for (const [role, list] of Object.entries(groups)) {
      const p = doc.createPrimitive().setMaterial(roleMat(role)).setMode(prim.getMode())
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(doc.getRoot().listBuffers()[0]));
      for (const s of prim.listSemantics()) if (!s.startsWith('TEXCOORD')) p.setAttribute(s, prim.getAttribute(s));
      mesh.addPrimitive(p);
    }
    mesh.removePrimitive(prim);
    prim.dispose();
  }
  if (palette) continue;
  // a model with unmapped triangles would ship with holes: never write it
  if (holes) { console.error(`SKIP ${file}: ${holes} triangles have no kit role`); continue; }
  // kits come in their own units (Kenney city: 1 = one road tile); bake metres in so budgets and the lineup hold
  for (const n of doc.getRoot().listScenes()[0].listChildren()) {
    n.setScale(n.getScale().map(v => v * scale)).setTranslation(n.getTranslation().map(v => v * scale));
  }
  // only the atlas materials this run replaced; plain materials stay for applyHouseStyle's kit names
  for (const m of atlasMats) m.dispose();
  for (const t of doc.getRoot().listTextures()) if (!t.listParents().some(p => p.propertyType === 'Material')) t.dispose();
  const out = path.join(outDir, prefix + path.basename(file));
  await io.write(out, doc);
  console.log(`${out}: ${Object.keys(roleMats).join(', ')}`);
}

const rows = [...seen].sort((a, b) => b[1] - a[1]);
if (palette) {
  for (const [hex, tris] of rows) console.log(`"${hex}": ${roleOf(rgb(hex)) ?? 'UNMAPPED'}   # ${tris} tris`);
  process.exit(0);
}
if (unmapped) {
  console.error(`FAIL ${unmapped} triangles have no kit role; those models were not written. Add these to DESIGN.md kit:`);
  for (const [hex] of rows) if (!roleOf(rgb(hex))) console.error(`  "${hex}": <role>`);
  process.exit(1);
}

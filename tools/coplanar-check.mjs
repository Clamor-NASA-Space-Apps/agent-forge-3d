// Finds faces that lie on top of each other: two triangles facing the same way, in the same plane (within
// `tol`), overlapping by more than `minArea`. The depth buffer cannot order them, so they flicker in stripes
// (z-fighting): a doorway cut the same size through a wall and its frame, a floor laid on another floor, a strip
// flush with the face it sits on. Fix it in the recipe: cut the hidden part a little bigger, so its faces end
// inside a solid, or move one face at least 5 mm off the other.
//
//   node tools/coplanar-check.mjs model.glb [...]   (exit 1 on any overlap; style-check runs it on every model)
//
// Skinned meshes are skipped (they move), and so are undersides on the ground, overlaps buried inside another
// part (a ray out of them meets a face from behind), overlaps of one material with itself (same shading, no
// flicker) and overlaps under 10 cm2. Back-to-back faces (opposite normals) are not counted: one of the
// two is always culled.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const apply = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

// Sutherland-Hodgman: polygon `p` clipped by the convex counter-clockwise polygon `c`, all 2D
function clip(p, c) {
  for (let i = 0; i < c.length && p.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const side = q => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    const out = [];
    for (let j = 0; j < p.length; j++) {
      const s = p[j], e = p[(j + 1) % p.length], ss = side(s), se = side(e);
      if (ss >= 0) out.push(s);
      if ((ss >= 0) !== (se >= 0)) { const t = ss / (ss - se); out.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]); }
    }
    p = out;
  }
  return p;
}
const area2 = p => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;

/** [{a, b, area, at}] for one gltf-transform Document: `a` and `b` are "node/material", `at` a point in the overlap. */
export function coplanar(doc, { tol = 0.001, minArea = 1e-3 } = {}) {
  const tris = [];
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  scene?.traverse(node => {
    if (!node.getMesh() || node.getSkin()) return;
    const m = node.getWorldMatrix();
    for (const prim of node.getMesh().listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const mat = prim.getMaterial()?.getName() ?? '-', who = `${node.getName()}/${mat}`;
      for (let i = 0; i < n; i += 3) {
        const v = [0, 1, 2].map(k => apply(m, pos.getElement(idx ? idx.getScalar(i + k) : i + k, [])));
        const c = cross(sub(v[1], v[0]), sub(v[2], v[0])), len = Math.hypot(...c);
        if (len < 2e-6) continue;
        const nrm = c.map(x => x / len);
        tris.push({ v, n: nrm, d: dot(nrm, v[0]), who, mat, i: tris.length });
      }
    }
  });
  // faces in the ground under the model, and undersides of feet and skids near it, are never seen
  const low = Math.min(...tris.flatMap(t => t.v.map(p => p[1])));
  const under = (t, h) => t.v.every(p => p[1] < low + h);
  const seen = tris.filter(t => !(under(t, 0.01) || (t.n[1] < -0.99 && under(t, 0.05))));
  // ponytail: buckets by rounded normal and plane offset; a pair straddling a rounding edge is missed, which
  // only happens for faces that are off true by about a degree, rare in recipe geometry
  const key = (t, dd) => `${t.n.map(x => Math.round(x * 100)).join(',')}|${Math.round(t.d / tol) + dd}`;
  const buckets = new Map();
  for (const t of seen) { const k = key(t, 0); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(t); }
  const hits = new Map();
  for (const t of seen) {
    // 2D axes in t's plane
    const u = Math.abs(t.n[0]) < 0.9 ? cross(t.n, [1, 0, 0]) : cross(t.n, [0, 1, 0]);
    const ul = Math.hypot(...u), uu = u.map(x => x / ul), vv = cross(t.n, uu);
    const flat = p => [dot(p, uu), dot(p, vv)];
    const a = t.v.map(flat);
    for (const dd of [-1, 0, 1]) for (const o of buckets.get(key(t, dd)) || []) {
      // the same material on both shades the same, so its overlap cannot flicker
      if (o.i <= t.i || o.mat === t.mat || dot(o.n, t.n) < 0.9998 || Math.abs(o.d - t.d) > tol) continue;
      const poly = clip(o.v.map(flat), a);
      if (poly.length < 3) continue;
      const area = area2(poly);
      if (area < 1e-7) continue;
      const c2 = poly.reduce((s, q) => [s[0] + q[0] / poly.length, s[1] + q[1] / poly.length], [0, 0]);
      const at = [0, 1, 2].map(i => uu[i] * c2[0] + vv[i] * c2[1] + t.n[i] * (t.d + tol + 0.001));
      if (covered(tris, at, t.n)) continue;
      const k = [t.who, o.who].sort().join(' x ');
      const h = hits.get(k) ?? { a: t.who, b: o.who, area: 0, at, n: t.n };
      h.area += area;
      hits.set(k, h);
    }
  }
  return [...hits.values()].filter(h => h.area >= minArea).sort((x, y) => y.area - x.area);
}

// True when the point a few mm in front of an overlap is inside a solid, so the overlap never shows: along a ray
// out of it, faces seen from behind (leaving a solid) outnumber faces seen from the front (entering one).
function covered(tris, p, dir) {
  let depth = 0;
  for (const t of tris) {
    const e1 = sub(t.v[1], t.v[0]), e2 = sub(t.v[2], t.v[0]), h = cross(dir, e2), a = dot(e1, h);
    if (Math.abs(a) < 1e-12) continue;
    const s = sub(p, t.v[0]), u = dot(s, h) / a;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(dir, q) / a;
    if (v < 0 || u + v > 1 || dot(e2, q) / a < 1e-5) continue;
    depth += dot(t.n, dir) > 0 ? 1 : -1;
  }
  return depth > 0;
}

export async function reader() {
  await MeshoptDecoder.ready;
  return new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR))
    .registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

export const describe = h => `${h.a} x ${h.b}: ${(h.area * 1e4).toFixed(0)} cm2 coplanar near (${h.at.map(x => x.toFixed(2)).join(', ')}), facing (${h.n.map(x => x.toFixed(2)).join(', ')}) (glTF axes: Blender's y is -z)`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: coplanar-check.mjs model.glb [...]'); process.exit(2); }
  const io = await reader();
  let bad = 0;
  for (const f of files) {
    const hits = coplanar(await io.read(f));
    bad += hits.length;
    for (const h of hits) console.log(`FAIL ${path.basename(f)}: ${describe(h)}`);
    if (!hits.length) console.log(`ok ${path.basename(f)}`);
  }
  process.exit(bad ? 1 : 0);
}

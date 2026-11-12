#!/usr/bin/env node
// Usage: node tools/sky-stars.mjs <bsc5 catalog(.gz)> <milky-way map> <out dir> [--size 2048] [--cells 128x64]
//          [--bright 5.0] [--date 2026-11-14 --from Mars]
// Bakes the night sky that godot/addons/forge/sky.gdshader turns over a planet (DESIGN.md lighting.celestial):
//   <out>/stars.png      equirectangular in RA and Dec (RA 0 in the middle, growing to the right, north up): RGB the
//                        Milky Way map, A the stars fainter than --bright (sqrt of their light, so faint ones keep bits)
//   <out>/star_list.png  every star down to --bright, for the shader to draw sharp: per cell of --cells (the same RA and
//                        Dec layout), 6 slots of two texels (LIST_K in sky.gdshader): (RA 16 bit, Dec 16 bit), (r, g, b from B-V, magnitude
//                        (m + 2) x 28). A star goes into every cell its glow reaches; a full cell sends the faintest to
//                        the map.
// Catalogue: the Yale Bright Star Catalog, 5th ed. (CDS V/50 `catalog`, byte layout in its ReadMe). The map: any
// equirectangular celestial image with RA 0 in the middle growing to the LEFT, as NASA SVS star maps are (flipped
// here); ffmpeg reads it. --date prints the sun's and the planets' RA and Dec seen from --from (JPL "Approximate
// Positions of the Planets", Table 1, 1800 to 2050), for the DESIGN.md tokens.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const W = +opt('--size', 2048), H = W / 2;
const [CX, CY] = opt('--cells', '128x64').split('x').map(Number);
const BRIGHT = +opt('--bright', 5.0);
const DATE = opt('--date', ''), FROM = opt('--from', 'Mars');
const [catFile, mapFile, outDir] = args;
if (!outDir) { console.error('usage: sky-stars.mjs <catalog(.gz)> <milky-way map> <out dir> [--size 2048] [--cells 128x64] [--bright 5.0] [--date YYYY-MM-DD --from Mars]'); process.exit(2); }
const K = 6, RAD = Math.PI / 180;

// --- the catalogue: J2000 RA (bytes 76-83), Dec (84-90), V (103-107), B-V (110-114), 1-based columns
let text = fs.readFileSync(catFile);
if (catFile.endsWith('.gz')) text = zlib.gunzipSync(text);
const stars = [];
for (const l of text.toString('latin1').split('\n')) {
  const f = (a, b) => l.slice(a - 1, b).trim();
  if (!f(76, 77) || !f(103, 107)) continue;  // a few entries (novae, galaxies) have no J2000 place or V
  const ra = (+f(76, 77) + +f(78, 79) / 60 + +f(80, 83) / 3600) * 15;
  const de = (f(84, 84) === '-' ? -1 : 1) * (+f(85, 86) + +f(87, 88) / 60 + +f(89, 90) / 3600);
  stars.push({ ra, de, v: +f(103, 107), bv: f(110, 114) === '' ? 0.6 : +f(110, 114) });
}
stars.sort((a, b) => a.v - b.v);

// B-V to a colour: Ballesteros (2012) for the temperature, then a black body's colour by Tanner Helland's fit of
// Mitchell Charity's table, softened toward white (the eye sees little colour in faint points)
function colour(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100;
  const c = v => Math.max(0, Math.min(255, v));
  const r = t <= 66 ? 255 : c(329.698727446 * (t - 60) ** -0.1332047592);
  const g = t <= 66 ? c(99.4708025861 * Math.log(t) - 161.1195681661) : c(288.1221695283 * (t - 60) ** -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : c(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return [r, g, b].map(x => Math.round(255 - (255 - x) * 0.6));
}

// u: RA in (-180, 180] over 0..1 with RA 0 in the middle, as the shader's atan(); v: Dec -90..90 over 0..1
const uOf = ra => ((ra > 180 ? ra - 360 : ra) / 360 + 0.5) % 1;
const vOf = de => (de + 90) / 180;

// --- the list: cells a star's glow reaches (a ring of points 0.8 degrees out, and its centre)
const slots = Array.from({ length: CX * CY }, () => []);
const faint = [];
const unit = (ra, de) => [Math.cos(de * RAD) * Math.cos(ra * RAD), Math.cos(de * RAD) * Math.sin(ra * RAD), Math.sin(de * RAD)];
for (const s of stars) {
  if (s.v > BRIGHT) { faint.push(s); continue; }
  const cells = new Set();
  const c = unit(s.ra, s.de), e = [-Math.sin(s.ra * RAD), Math.cos(s.ra * RAD), 0];
  const n = [c[1] * e[2] - c[2] * e[1], c[2] * e[0] - c[0] * e[2], c[0] * e[1] - c[1] * e[0]];
  for (let i = 0; i <= 16; i++) {
    const a = i * Math.PI / 8, r = i === 16 ? 0 : 0.8 * RAD;
    const p = c.map((x, j) => x * Math.cos(r) + (e[j] * Math.cos(a) + n[j] * Math.sin(a)) * Math.sin(r));
    const ra = Math.atan2(p[1], p[0]) / RAD, de = Math.asin(Math.max(-1, Math.min(1, p[2]))) / RAD;
    cells.add(Math.min(CY - 1, Math.floor(vOf(de) * CY)) * CX + Math.min(CX - 1, Math.floor(uOf((ra + 360) % 360) * CX)));
  }
  // brightest first (sorted), so a full cell drops the faintest; it still shows, from the map
  if ([...cells].some(i => slots[i].length >= K)) faint.push(s);
  else for (const i of cells) slots[i].push(s);
}
const list = Buffer.alloc(CX * K * 2 * CY * 4);
let listed = 0;
for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) {
  slots[cy * CX + cx].forEach((s, k) => {
    const o = (((CY - 1 - cy) * CX * K * 2) + cx * K * 2 + k * 2) * 4;  // north at the top row
    const ra = Math.round(s.ra / 360 * 65535) % 65536, de = Math.round((s.de + 90) / 180 * 65535);
    list.set([ra >> 8, ra & 255, de >> 8, de & 255], o);
    list.set([...colour(s.bv), Math.max(1, Math.min(255, Math.round((s.v + 2) * 28)))], o + 4);
  });
}
for (const l of slots) listed += l.length;

// --- the map: the Milky Way flipped to RA growing right, faint stars as soft points in alpha
const mw = execFileSync('ffmpeg', ['-v', 'error', '-i', mapFile, '-vf', `hflip,scale=${W}:${H}:flags=bicubic`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 4 });
const map = Buffer.alloc(W * H * 4);
const glow = new Float32Array(W * H);
const ref = 10 ** (-0.4 * BRIGHT);  // a star at --bright fills alpha
for (const s of faint) {
  const x = uOf(s.ra) * W, y = (1 - vOf(s.de)) * H, f = 10 ** (-0.4 * s.v) / ref;
  const sx = 0.6 / Math.max(Math.cos(s.de * RAD), 0.05);  // texels widen toward the poles
  for (let j = Math.floor(y) - 2; j <= Math.floor(y) + 2; j++) for (let i = Math.floor(x - 2 * sx); i <= Math.ceil(x + 2 * sx); i++) {
    if (j < 0 || j >= H) continue;
    const ii = ((i % W) + W) % W, dx = (i + 0.5 - x) / sx, dy = (j + 0.5 - y) / 0.6;
    glow[j * W + ii] += f * Math.exp(-(dx * dx + dy * dy) / 2);
  }
}
for (let p = 0; p < W * H; p++) {
  map.set([mw[p * 3], mw[p * 3 + 1], mw[p * 3 + 2], Math.round(255 * Math.sqrt(Math.min(glow[p], 1)))], p * 4);
}

function png(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'latin1');
    data.copy(b, 8);
    b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head.set([8, 6, 0, 0, 0], 8);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
fs.mkdirSync(outDir, { recursive: true });
png(path.join(outDir, 'stars.png'), W, H, map);
png(path.join(outDir, 'star_list.png'), CX * K * 2, CY, list);
console.log(`${stars.length} stars: ${listed} slots for the sharp ones (V <= ${BRIGHT}), ${faint.length} in the map`);

// --- where the sun and the planets are, seen from one planet on a date (JPL Table 1 elements, J2000 ecliptic)
if (DATE) {
  const EL = {  // a, e, I, L, long. peri., long. node; then their rates per century
    Mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    Venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    Mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    Jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  };
  const T = (Date.parse(DATE + 'T00:00:00Z') / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const helio = name => {
    const e0 = EL[name], [a, e, I, L, wb, O] = e0.slice(0, 6).map((x, i) => x + e0[i + 6] * T);
    const w = wb - O;
    let M = ((L - wb) % 360 + 540) % 360 - 180, E = M + e / RAD * Math.sin(M * RAD);
    for (let i = 0; i < 8; i++) E -= (E - e / RAD * Math.sin(E * RAD) - M) / (1 - e * Math.cos(E * RAD));
    const x = a * (Math.cos(E * RAD) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
    const [cw, sw, cO, sO, cI, sI] = [w, w, O, O, I, I].map((v, i) => (i % 2 ? Math.sin : Math.cos)(v * RAD));
    const ecl = [(cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * y, (cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * y, sw * sI * x + cw * sI * y];
    const eps = 23.43928 * RAD;  // to the J2000 equator
    return [ecl[0], Math.cos(eps) * ecl[1] - Math.sin(eps) * ecl[2], Math.sin(eps) * ecl[1] + Math.cos(eps) * ecl[2]];
  };
  const me = helio(FROM);
  const radec = v => { const r = Math.hypot(...v); return [((Math.atan2(v[1], v[0]) / RAD) + 360) % 360, Math.asin(v[2] / r) / RAD, r]; };
  const sun = radec(me.map(x => -x));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  console.log(`${DATE} from ${FROM}: sun RA ${sun[0].toFixed(2)} Dec ${sun[1].toFixed(2)} (${sun[2].toFixed(3)} au)`);
  for (const name of Object.keys(EL).filter(n => n !== FROM)) {
    const p = helio(name), to = p.map((x, i) => x - me[i]), [ra, de, dist] = radec(to);
    const elong = Math.acos(dot(to, me.map(x => -x)) / (dist * sun[2])) / RAD;
    // east of the sun (an evening star) when the planet's ecliptic longitude leads the sun's
    const lon = v => Math.atan2(Math.cos(23.43928 * RAD) * v[1] + Math.sin(23.43928 * RAD) * v[2], v[0]);
    const east = Math.sin(lon(to) - lon(me.map(x => -x))) > 0;
    const phase = Math.acos(dot(p.map(x => -x), to.map(x => -x)) / (Math.hypot(...p) * dist)) / RAD;
    console.log(`  ${name}: RA ${ra.toFixed(2)} Dec ${de.toFixed(2)}, ${dist.toFixed(3)} au, ${elong.toFixed(1)} deg ${east ? 'east (evening)' : 'west (morning)'} of the sun, phase angle ${phase.toFixed(1)}, sun-distance ${Math.hypot(...p).toFixed(3)} au`);
  }
}

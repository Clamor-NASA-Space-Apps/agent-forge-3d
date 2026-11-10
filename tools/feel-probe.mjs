// Checks a game's sheet of anchored numbers, then measures the running game against it.
//
//   node tools/feel-probe.mjs <reality.json> [baseUrl] [--film id,id] [--only id,id] [--out captures]
// No URL (plan time, no browser): every row has a source, sits in its real range or says why, a walk stays
// under the walk-to-run speed for its leg length, and every pair that meets has an escape.
// With a URL: plays each row that has a `measure` with real key presses, steps time with advanceTime, and
// compares what the hero did with `value`. --film tiles 8 frames of a row's run into <out>/<id>.png.
// Exit 0 all pass, 1 a row failed, 2 a row could not be measured.
//
// Sheet: { gravity?, probe?: { pos: 'player.pos', page?, tol? }, rows: [...], pairs: [...] }
// row:   { id, real: [lo, hi], value, unit, source, why?, limit?: 'max' | 'min', tol?,
//          measure?, at?: [x, y, z], yaw?, hold?: [codes], tap?: [codes], then?: [codes], ms?, above?, path?, of?, view?, page?, filmMs? }
// pair:  { id, chaser, prey, escape: 'outrun' | 'refuge', refuge?, lead?, burst? }  (row ids; refuge and lead in metres)
// measure: speed (steady m/s), ramp (s to 90% of steady), stop (m after release), turn (m carried along the old
//          heading after switching to `then`), jump (apex m, or of: 'length'), burst (s at or above `above`),
//          state (largest value of `path` in render_game_to_text() over the run).
// Page hooks: advanceTime(ms), render_game_to_text(), capture.place(pos, yawDeg) for rows with `at`.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BROWSER = process.env.BROWSER_PATH || '/usr/bin/brave-browser';
const STEP = 1000 / 60;
const num = v => typeof v === 'number' && Number.isFinite(v);

// The plan-time half. Returns [{ id, ok, note }].
export function checkSheet(sheet) {
  const g = sheet.gravity ?? 9.8, rows = new Map((sheet.rows ?? []).map(r => [r.id, r])), out = [];
  for (const r of sheet.rows ?? []) {
    const bad = m => out.push({ id: r.id ?? '(no id)', ok: false, note: m });
    if (!r.id || !num(r.value) || !r.unit || !Array.isArray(r.real) || !num(r.real[0]) || !num(r.real[1]) || r.real[0] > r.real[1]) { bad('needs id, value, unit and real: [lo, hi]'); continue; }
    if (!r.source) { bad('no source'); continue; }
    if ((r.value < r.real[0] || r.value > r.real[1]) && !r.why) { bad(`${r.value} is outside the real ${r.real[0]} to ${r.real[1]} ${r.unit}, and there is no why`); continue; }
    // Alexander and Jayes 1983: legged animals leave the walk near Froude number v^2 / (g * leg) = 0.5
    const leg = /\.speed\.walk$/.test(r.id) && rows.get(r.id.replace(/\.speed\.walk$/, '.leg'));
    const top = leg && Math.sqrt(0.5 * g * leg.value) * 1.25;
    if (top && r.value > top && !r.why) { bad(`a ${leg.value} m leg stops walking near ${(top / 1.25).toFixed(2)} m/s; ${r.value} is a run`); continue; }
    out.push({ id: r.id, ok: true, note: `${r.value} ${r.unit}, real ${r.real[0]} to ${r.real[1]}${r.why ? `, why: ${r.why}` : ''}${/^estimate:/.test(r.source) ? ' (estimate)' : ''}` });
  }
  for (const p of sheet.pairs ?? []) {
    const c = rows.get(p.chaser), q = rows.get(p.prey), burst = p.burst && rows.get(p.burst);
    const say = (ok, note) => out.push({ id: p.id, ok, note });
    if (!c || !q) say(false, 'chaser and prey must name rows');
    else if (p.escape === 'outrun') say(q.value > c.value, `prey ${q.value} against chaser ${c.value} ${c.unit}`);
    else if (p.escape === 'refuge' && num(p.refuge)) {
      // the prey reaches safety before the chaser covers the same ground plus the head start, inside its burst
      const t = p.refuge / q.value, tc = (p.refuge + (p.lead ?? 0)) / c.value;
      say(t < tc && (!burst || t <= burst.value), `prey needs ${t.toFixed(1)} s to cover ${p.refuge} m, the chaser arrives at ${tc.toFixed(1)} s${burst ? `, burst ${burst.value} s` : ''}`);
    } else say(false, 'escape must be outrun, or refuge with a distance in metres');
  }
  return out;
}

// A page with the hooks ready and real time stopped. Game checks share this instead of their own launch code.
export async function open(url, { width = 480, height = 270, sockets = false } = {}) {
  const { chromium } = await import('playwright-core');
  // software WebGL, so it runs headless with no GPU
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage(); // a context, so tile() can open a second page
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // A dev server's hot reload restarts the page mid-run when another lane saves a file ("Execution context
  // was destroyed"). Holding every websocket silent keeps the page as loaded. A game that needs one passes sockets: true.
  if (!sockets) await page.routeWebSocket(/.*/, () => {});
  await page.goto(url);
  await page.waitForFunction(() => window.render_game_to_text && window.advanceTime, null, { timeout: 30000 });
  await page.evaluate(() => window.advanceTime(0)); // the first call stops real time
  return { browser, page, errors };
}

// Plays one run and returns a sample per 1/60 s step: { t, seg, pos, v } (v is the value at `watch`).
// segs: [{ hold: [codes], tap: [codes], ms }]. shots: { n, ms, view } takes n screenshots over the last ms of the first segment.
export async function run(page, { at, yaw = 0, segs, pos = 'player.pos', watch, shots }) {
  const samples = [], frames = [], held = new Set();
  if (at) await page.evaluate(([p, y]) => window.capture.place(p, y), [at, yaw]);
  if (shots?.view) await page.evaluate(v => window.capture.setView(v), shots.view);
  const play = async steps => {
    const got = await page.evaluate(({ steps, STEP, pos, watch }) => {
      const get = (o, p) => p.split('.').reduce((v, k) => v?.[k], o), out = [];
      for (let i = 0; i < steps; i++) { window.advanceTime(STEP); const s = window.render_game_to_text(); out.push([get(s, pos), watch ? get(s, watch) : null]); }
      return out;
    }, { steps, STEP, pos, watch });
    for (const [p, v] of got) samples.push({ t: (samples.length + 1) * STEP / 1000, seg: segs.indexOf(seg), pos: p, v });
  };
  let seg;
  for (seg of segs) {
    for (const k of held) if (!seg.hold?.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of seg.hold ?? []) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    for (const k of seg.tap ?? []) if (!held.has(k)) { await page.keyboard.down(k); await page.keyboard.up(k); }
    let steps = Math.round(seg.ms / STEP);
    if (shots && seg === segs[0]) {
      const each = Math.max(1, Math.round(Math.min(shots.ms, seg.ms) / STEP / shots.n));
      await play(Math.max(0, steps - each * shots.n));
      for (let i = 0; i < shots.n; i++) { await play(each); frames.push(await page.screenshot()); }
      steps = 0;
    }
    if (steps) await play(steps);
  }
  for (const k of held) await page.keyboard.up(k);
  if (samples.some(s => !Array.isArray(s.pos))) throw new Error(`render_game_to_text() has no position at "${pos}"`);
  return { samples, frames };
}

// Horizontal speed between neighbouring samples, from positions only: a reported speed can lie.
const speeds = s => s.map((a, i) => (i ? Math.hypot(a.pos[0] - s[i - 1].pos[0], a.pos[2] - s[i - 1].pos[2]) / (STEP / 1000) : 0));
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

const MEASURE = {
  speed: ({ first }) => mean(speeds(first).slice(-30)),
  ramp: ({ first }) => { const v = speeds(first), top = mean(v.slice(-30)); return first[v.findIndex(x => x >= 0.9 * top)]?.t ?? Infinity; },
  stop: ({ first, rest }) => { const a = first.at(-1).pos, b = rest.at(-1).pos; return Math.hypot(b[0] - a[0], b[2] - a[2]); },
  turn: ({ first, rest }) => {
    const a = first.at(-6).pos, b = first.at(-1).pos, l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, ux = (b[0] - a[0]) / l, uz = (b[2] - a[2]) / l;
    return Math.max(0, ...rest.map(s => (s.pos[0] - b[0]) * ux + (s.pos[2] - b[2]) * uz));
  },
  jump: ({ all, row, start }) => (row.of === 'length' ? Math.hypot(all.at(-1).pos[0] - start[0], all.at(-1).pos[2] - start[2]) : Math.max(...all.map(s => s.pos[1])) - start[1]),
  burst: ({ first, row }) => speeds(first).filter(v => v >= row.above).length * STEP / 1000,
  state: ({ all }) => Math.max(...all.map(s => Number(s.v))),
};
const DEFAULT_MS = { jump: 1500, burst: 20000 };

async function measure(page, row, probe, film) {
  const m = MEASURE[row.measure];
  if (!m) throw new Error(`unknown measure "${row.measure}"`);
  const segs = [{ hold: row.hold ?? [], tap: row.tap ?? [], ms: row.ms ?? DEFAULT_MS[row.measure] ?? 3000 }];
  if (row.measure === 'stop') segs.push({ hold: [], ms: 3000 });
  if (row.measure === 'turn') segs.push({ hold: row.then ?? [], ms: 1500 });
  const { samples, frames } = await run(page, { at: row.at, yaw: row.yaw, segs, pos: probe.pos ?? 'player.pos', watch: row.path,
    shots: film && { n: 8, ms: row.filmMs ?? 400, view: row.view } });
  const first = samples.filter(s => s.seg === 0), rest = samples.filter(s => s.seg > 0);
  const got = m({ all: samples, first, rest, row, start: row.at ?? samples[0].pos });
  if (!num(got)) throw new Error(`measured ${got}`);
  return { got, frames, curve: ['speed', 'ramp', 'burst'].includes(row.measure) ? speeds(first).filter((_, i) => i % 6 === 5).map(v => +v.toFixed(2)) : undefined };
}

// Eight frames side by side in one image: the only way to see that a run is a faster trot.
async function tile(page, frames, file) {
  const sheet = await page.context().newPage(), { width, height } = page.viewportSize();
  await sheet.setViewportSize({ width: width * 4, height: height * Math.ceil(frames.length / 4) });
  await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(4,max-content);background:#000">${
    frames.map(f => `<img src="data:image/png;base64,${f.toString('base64')}">`).join('')}`);
  await sheet.screenshot({ path: file });
  await sheet.close();
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const film = flag('--film', '').split(',').filter(Boolean), only = flag('--only', '').split(',').filter(Boolean), outDir = flag('--out', 'captures');
  const [file, base] = args;
  if (!file) { console.error('usage: feel-probe.mjs <reality.json> [baseUrl] [--film id,id] [--only id,id] [--out captures]'); process.exit(2); }
  const sheet = JSON.parse(fs.readFileSync(file, 'utf8')), probe = sheet.probe ?? {};
  const line = (tag, id, note) => console.log(`${tag.padEnd(5)} ${id.padEnd(28)} ${note}`);

  const plan = checkSheet(sheet);
  for (const r of plan) line(r.ok ? 'PASS' : 'FAIL', r.id, r.note);
  let failed = plan.filter(r => !r.ok).length, errored = 0;
  const todo = (sheet.rows ?? []).filter(r => r.measure && (!only.length || only.includes(r.id)));
  if (base && todo.length) {
    const pages = new Map(), results = [];
    fs.mkdirSync(outDir, { recursive: true });
    for (const row of todo) {
      const url = new URL(row.page ?? probe.page ?? '', base).href;
      try {
        if (!pages.has(url)) pages.set(url, await open(url));
        const { page, errors } = pages.get(url);
        const { got, frames, curve } = await measure(page, row, probe, film.includes(row.id));
        const tol = row.tol ?? probe.tol ?? 0.1;
        const ok = row.limit === 'max' ? got <= row.value : row.limit === 'min' ? got >= row.value : Math.abs(got - row.value) <= tol * Math.abs(row.value);
        if (errors.length) throw new Error(errors.splice(0).join('; '));
        if (frames.length) await tile(page, frames, path.join(outDir, `${row.id}.png`));
        if (!ok) failed++;
        line(ok ? 'PASS' : 'FAIL', row.id, `${row.measure} measured ${+got.toFixed(3)} ${row.unit}, wants ${row.limit === 'max' ? 'at most ' : row.limit === 'min' ? 'at least ' : ''}${row.value}`);
        results.push({ id: row.id, measure: row.measure, measured: +got.toFixed(4), value: row.value, ok, curve });
      } catch (e) {
        errored++;
        line('ERROR', row.id, e.message.split('\n')[0]);
      }
    }
    fs.writeFileSync(path.join(outDir, 'feel.json'), JSON.stringify(results, null, 1));
    for (const { browser } of pages.values()) await browser.close();
  }
  console.log(`${failed} failed, ${errored} could not be measured${base ? '' : ' (sheet only: pass a URL to measure the game)'}`);
  process.exit(errored ? 2 : failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

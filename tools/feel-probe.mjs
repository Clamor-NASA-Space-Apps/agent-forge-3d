// Checks a game's sheet of anchored numbers, then measures the running game against it.
//
//   node tools/feel-probe.mjs <reality.json> [project dir] [--film id,id] [--only id,id] [--out captures]
// No project (plan time, no engine): every row has a source, sits in its real range or says why, a walk stays
// under the walk-to-run speed for its leg length, and every pair that meets has an escape.
// With a Godot project: plays each row that has a `measure` with real input events, one engine step per
// sample, and compares what the hero did with `value`. --film tiles 8 frames of a row's run into <out>/<id>.png.
// Exit 0 all pass, 1 a row failed, 2 a row could not be measured.
//
// Sheet: { gravity?, probe?: { pos: 'player.pos', scene?, tol? }, rows: [...], pairs: [...] }
// row:   { id, real: [lo, hi], value, unit, source, why?, limit?: 'max' | 'min', tol?,
//          measure?, at?: [x, y, z], yaw?, hold?: [inputs], tap?: [inputs], then?: [inputs], ms?, above?, path?, of?, view?, scene?, filmMs? }
// pair:  { id, chaser, prey, escape: 'outrun' | 'refuge', refuge?, lead?, burst? }  (row ids; refuge and lead in metres)
// measure: speed (steady m/s), ramp (s to 90% of steady), stop (m after release), turn (m carried along the old
//          heading after switching to `then`), jump (apex m, or of: 'length'), burst (s at or above `above`),
//          state (largest value of `path` in render_game_to_text() over the run).
// inputs: an input action name ("move_forward"), else a Godot key name ("W", "Shift", "Space").
// Game hooks (godot/addons/forge/forge.gd): render_game_to_text(), place(pos, yaw_deg) for rows with `at`,
// set_view(name) for films. `scene` runs a fixture scene (res://...) in place of the main one.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runJob } from './godot.mjs';

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

// Plays runs in one engine start and returns { [id]: { samples: [{ t, seg, pos, v }], frames: [png paths] } }.
// Game checks share this instead of their own launch code.
// run: { id, at?, yaw?, segs: [{ hold: [inputs], tap: [inputs], ms }], pos?: 'player.pos', watch?: path,
//        shots?: { n, ms, view } }  (shots takes n pictures over the last ms of the first segment)
export function play(project, runs, { out = 'captures', scene, width = 480, height = 270 } = {}) {
  const { result, errors } = runJob(project, { out, runs }, { scene, width, height });
  if (errors.length) throw new Error(errors.join('; '));
  const step = result.step_ms / 1000, got = {};
  for (const r of runs) {
    const { samples, frames } = result.runs[r.id];
    if (samples.some(s => !Array.isArray(s[1]))) throw new Error(`render_game_to_text() has no position at "${r.pos ?? 'player.pos'}"`);
    got[r.id] = { step, frames, samples: samples.map(([seg, pos, v], i) => ({ t: (i + 1) * step, seg, pos, v })) };
  }
  return got;
}

// Horizontal speed between neighbouring samples, from positions only: a reported speed can lie.
const speeds = s => s.map((a, i) => (i ? Math.hypot(a.pos[0] - s[i - 1].pos[0], a.pos[2] - s[i - 1].pos[2]) / (a.t - s[i - 1].t) : 0));
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
  burst: ({ first, row, step }) => speeds(first).filter(v => v >= row.above).length * step,
  state: ({ all }) => Math.max(...all.map(s => Number(s.v))),
};
const DEFAULT_MS = { jump: 1500, burst: 20000 };

// The run a row asks for, and what its samples measure.
function runOf(row, probe, film) {
  if (!MEASURE[row.measure]) throw new Error(`unknown measure "${row.measure}"`);
  const segs = [{ hold: row.hold ?? [], tap: row.tap ?? [], ms: row.ms ?? DEFAULT_MS[row.measure] ?? 3000 }];
  if (row.measure === 'stop') segs.push({ hold: [], ms: 3000 });
  if (row.measure === 'turn') segs.push({ hold: row.then ?? [], ms: 1500 });
  return { id: row.id, at: row.at, yaw: row.yaw, segs, pos: probe.pos ?? 'player.pos', watch: row.path,
    shots: film ? { n: 8, ms: row.filmMs ?? 400, view: row.view } : undefined };
}

function measure(row, { samples, step }) {
  const first = samples.filter(s => s.seg === 0), rest = samples.filter(s => s.seg > 0);
  const got = MEASURE[row.measure]({ all: samples, first, rest, row, step, start: row.at ?? samples[0].pos });
  if (!num(got)) throw new Error(`measured ${got}`);
  return { got, curve: ['speed', 'ramp', 'burst'].includes(row.measure) ? speeds(first).filter((_, i) => i % 6 === 5).map(v => +v.toFixed(2)) : undefined };
}

// Eight frames side by side in one image: the only way to see that a run is a faster trot.
function tile(frames, file) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', frames[0].replace(/_0\.png$/, '_%d.png'), '-vf', 'tile=4x2', '-frames:v', '1', file]);
  for (const f of frames) fs.rmSync(f);
}

function main() {
  const args = process.argv.slice(2);
  const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
  const film = flag('--film', '').split(',').filter(Boolean), only = flag('--only', '').split(',').filter(Boolean), outDir = flag('--out', 'captures');
  const [file, project] = args;
  if (!file) { console.error('usage: feel-probe.mjs <reality.json> [project dir] [--film id,id] [--only id,id] [--out captures]'); process.exit(2); }
  const sheet = JSON.parse(fs.readFileSync(file, 'utf8')), probe = sheet.probe ?? {};
  const line = (tag, id, note) => console.log(`${tag.padEnd(5)} ${id.padEnd(28)} ${note}`);

  const plan = checkSheet(sheet);
  for (const r of plan) line(r.ok ? 'PASS' : 'FAIL', r.id, r.note);
  let failed = plan.filter(r => !r.ok).length, errored = 0;
  const todo = (sheet.rows ?? []).filter(r => r.measure && (!only.length || only.includes(r.id)));
  if (project && todo.length) {
    const results = [], scenes = new Map();
    for (const row of todo) { const k = row.scene ?? probe.scene ?? ''; scenes.set(k, [...(scenes.get(k) ?? []), row]); }
    // one engine start per scene: a row that cannot be asked for, or a script error, fails its whole scene
    for (const [scene, rows] of scenes) {
      let played;
      try { played = play(project, rows.map(r => runOf(r, probe, film.includes(r.id))), { out: outDir, scene }); }
      catch (e) { for (const row of rows) { errored++; line('ERROR', row.id, e.message.split('\n')[0]); } continue; }
      for (const row of rows) {
        try {
          const { got, curve } = measure(row, played[row.id]);
          const tol = row.tol ?? probe.tol ?? 0.1;
          // a jump that never left the ground is under every ceiling: without this a hero that cannot jump passes its `max` rows
          const flat = row.measure === 'jump' && got < 0.01;
          const ok = !flat && (row.limit === 'max' ? got <= row.value : row.limit === 'min' ? got >= row.value : Math.abs(got - row.value) <= tol * Math.abs(row.value));
          if (played[row.id].frames.length) tile(played[row.id].frames, path.join(outDir, `${row.id}.png`));
          if (!ok) failed++;
          line(ok ? 'PASS' : 'FAIL', row.id, `${row.measure} measured ${+got.toFixed(3)} ${row.unit}, wants ${row.limit === 'max' ? 'at most ' : row.limit === 'min' ? 'at least ' : ''}${row.value}${flat ? ' (nothing left the ground)' : ''}`);
          results.push({ id: row.id, measure: row.measure, measured: +got.toFixed(4), value: row.value, ok, curve });
        } catch (e) {
          errored++;
          line('ERROR', row.id, e.message.split('\n')[0]);
        }
      }
    }
    fs.writeFileSync(path.join(outDir, 'feel.json'), JSON.stringify(results, null, 1));
  }
  console.log(`${failed} failed, ${errored} could not be measured${project ? '' : ' (sheet only: pass a Godot project to measure the game)'}`);
  process.exit(errored ? 2 : failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

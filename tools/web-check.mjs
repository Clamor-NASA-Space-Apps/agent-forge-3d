// Exports a Godot project for the web, weighs the build, and proves it starts in a real browser.
//
//   node tools/web-check.mjs <project dir> [outDir] [--preset Web] [--budget-mb 15] [--wait 3000] [--ready-s 600] [--no-export]
//
// The native checks (capture-view, feel-probe) are fast, but the thing that ships is the web build: a
// different CPU (WebAssembly), a browser's rules, and a download. Run this at every section gate.
// Prints the size of the game data (.pck) against the budget, the size of the whole download as a host
// would send it (gzip), the time from navigation to the engine's first line, to the end of the first frame
// the game draws (often its loading cover) and to "Forge: ready" (the game itself on screen; forge.gd prints it
// on the web once a registered game is no longer busy()), and every console error. Engine warnings reach
// console.error on the web too; they are not errors.
// Writes <outDir>/web.png and web.json. Exit 1 on an export error, a browser error, or data over budget.
// --no-export checks the build already in <project>/build/web.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';
import { ensureImported, godot, staticHandler } from './godot.mjs';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const preset = flag('--preset', 'Web'), budget = Number(flag('--budget-mb', 15)), wait = Number(flag('--wait', 3000)), readyS = Number(flag('--ready-s', 600));
const keep = args.includes('--no-export');
const [project, outDir = 'captures'] = args.filter(a => a !== '--no-export');
if (!project) { console.error('usage: web-check.mjs <project dir> [outDir] [--preset Web] [--budget-mb 15] [--wait 3000] [--ready-s 600] [--no-export]'); process.exit(2); }

const errors = [], web = path.resolve(project, 'build/web'), MB = n => +(n / 1048576).toFixed(2);
fs.mkdirSync(outDir, { recursive: true });
// the editor or an --import run would import the exported icons as project textures
fs.mkdirSync(path.dirname(web), { recursive: true });
fs.writeFileSync(path.join(path.dirname(web), '.gdignore'), '');
if (!keep) {
  ensureImported(project);
  fs.rmSync(web, { recursive: true, force: true });
  fs.mkdirSync(web, { recursive: true });
  const r = godot(['--headless', '--path', project, '--export-release', preset, path.join(web, 'index.html')]);
  const log = `${r.stdout}${r.stderr}`;
  errors.push(...new Set(log.split('\n').map(l => l.trim()).filter(l => /^(USER )?(SCRIPT )?ERROR:/.test(l))));
  if (!fs.existsSync(path.join(web, 'index.html'))) { console.log(JSON.stringify({ errors: [...errors, 'the export wrote no index.html'] }, null, 1)); process.exit(1); }
}

const files = fs.readdirSync(web).map(f => { const b = fs.readFileSync(path.join(web, f)); return { f, raw: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length }; });
const sum = (k, test = () => true) => files.filter(x => test(x.f)).reduce((t, x) => t + x[k], 0);
const size = { data_mb: MB(sum('raw', f => f.endsWith('.pck'))), budget_mb: budget, engine_mb: MB(sum('raw', f => /\.(wasm|js)$/.test(f))),
  download_mb: MB(sum('raw')), download_gzip_mb: MB(sum('gzip')) };
if (size.data_mb > budget) errors.push(`game data is ${size.data_mb} MB, over the ${budget} MB budget`);

const server = http.createServer(staticHandler(web)).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));

// software WebGL, so it runs with no GPU: the frame rate here means nothing, test that on a real phone
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/brave-browser',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
// The engine prints its first line, loads the main scene and draws the first frame in one blocking call
// (godot_web_main in platform/web/web_main.cpp runs main_loop_callback() once itself), so the first
// animation-frame callback to run after that line marks the end of the first frame.
await page.addInitScript(() => {
  const log = console.log, raf = requestAnimationFrame;
  console.log = (...a) => {
    const s = String(a[0]);
    if (window.__start === undefined && /^Godot Engine v/.test(s)) window.__start = performance.now();
    if (window.__ready === undefined && /^Forge: ready/.test(s)) window.__ready = performance.now();
    log(...a);
  };
  window.requestAnimationFrame = cb => raf(t => { if (window.__start !== undefined) window.__frame ??= performance.now(); cb(t); });
});
const logs = [];
const browserErrors = [];
page.on('console', m => {
  logs.push(`[${m.type()}] ${m.text()}`);
  // stderr reaches console.error: a WARNING and the "at:" line under any message are not errors themselves
  if (m.type() === 'error' && !/Failed to load resource|^\s*(WARNING:|at: )/.test(m.text())) browserErrors.push(m.text());
});
page.on('pageerror', e => browserErrors.push(String(e)));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) browserErrors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
// evaluate waits while the wasm holds the page, so time is read in the page, never between polls
const times = () => page.evaluate(() => ({ start: window.__start ?? null, frame: window.__frame ?? null, ready: window.__ready ?? null }));
let t = { start: null, frame: null, ready: null };
// software WebGL compiles every shader variant on the CPU: a warm-up that takes seconds on a phone took 4 to 6
// minutes here on a laptop busy with other builds
for (const t0 = Date.now(); (t.ready === null || t.frame === null) && !browserErrors.length && Date.now() - t0 < (t.start === null ? 60000 : readyS * 1000);) {
  await page.waitForTimeout(250);
  t = await times();
}
if (!browserErrors.length) {
  if (t.start === null) errors.push('the engine never started (no "Godot Engine v..." line in 60 s)');
  else if (t.frame === null) errors.push(`the engine started but drew no frame in ${readyS} s`);
  else if (t.ready === null) errors.push(`no "Forge: ready" in ${readyS} s (--ready-s): the game never called Forge.register(), or busy() stayed true`);
}
if (t.ready !== null) await page.waitForTimeout(wait);
// a screenshot waits for a frame, and a game still compiling shaders under software WebGL holds one for seconds
await page.screenshot({ path: path.join(outDir, 'web.png'), timeout: 120000 }).catch(e => errors.push(`no screenshot: ${e.message.split('\n')[0]}`));
await browser.close();
server.close();

const round = v => v === null ? null : Math.round(v);
const out = { size, started_ms: round(t.start), first_frame_ms: round(t.frame), ready_ms: round(t.ready), shot: path.join(outDir, 'web.png'), errors: [...new Set([...errors, ...browserErrors])] };
fs.writeFileSync(path.join(outDir, 'web.json'), JSON.stringify({ ...out, files, logs }, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(out.errors.length ? 1 : 0);

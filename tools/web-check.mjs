// Exports a Godot project for the web, weighs the build, and proves it starts in a real browser.
//
//   node tools/web-check.mjs <project dir> [outDir] [--preset Web] [--budget-mb 15] [--wait 3000] [--no-export]
//
// The native checks (capture-view, feel-probe) are fast, but the thing that ships is the web build: a
// different CPU (WebAssembly), a browser's rules, and a download. Run this at every section gate.
// Prints the size of the game data (.pck) against the budget, the size of the whole download as a host
// would send it (gzip), the time from navigation to the engine's first line, and every console error.
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
const preset = flag('--preset', 'Web'), budget = Number(flag('--budget-mb', 15)), wait = Number(flag('--wait', 3000));
const keep = args.includes('--no-export');
const [project, outDir = 'captures'] = args.filter(a => a !== '--no-export');
if (!project) { console.error('usage: web-check.mjs <project dir> [outDir] [--preset Web] [--budget-mb 15] [--wait 3000] [--no-export]'); process.exit(2); }

const errors = [], web = path.resolve(project, 'build/web'), MB = n => +(n / 1048576).toFixed(2);
fs.mkdirSync(outDir, { recursive: true });
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
const logs = [];
let started = null;
const t0 = Date.now();
page.on('console', m => {
  logs.push(`[${m.type()}] ${m.text()}`);
  if (started === null && /^Godot Engine v/.test(m.text())) started = Date.now() - t0;
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', e => errors.push(String(e)));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
for (let i = 0; i < 600 && started === null && !errors.length; i++) await page.waitForTimeout(100);
if (started === null) errors.push('the engine never started (no "Godot Engine v..." line in 60 s)');
await page.waitForTimeout(wait);
await page.screenshot({ path: path.join(outDir, 'web.png') });
await browser.close();
server.close();

const out = { size, started_ms: started, shot: path.join(outDir, 'web.png'), errors: [...new Set(errors)] };
fs.writeFileSync(path.join(outDir, 'web.json'), JSON.stringify({ ...out, files, logs }, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(out.errors.length ? 1 : 0);

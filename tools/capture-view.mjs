// Preset-camera screenshots + state dump for agent self-checks.
//
//   node tools/capture-view.mjs <url> [outDir] [--views a,b,c] [--advance ms] [--scale 0.5]
//
// The page under test may expose (develop-web-game pattern):
//   window.capture.setView(name)   -> moves the camera to a named preset (await-able)
//   window.advanceTime(ms)         -> steps the game deterministically
//   window.render_game_to_text()   -> JSON-able snapshot of game state
// Writes <outDir>/<view>.png, state.json, console.log. Exit 1 on page errors or console errors.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const views = flag('--views', 'default').split(',');
const advance = Number(flag('--advance', 0));
const scale = Number(flag('--scale', 0.5));
const [url, outDir = 'captures'] = args;
if (!url) { console.error('usage: capture-view.mjs <url> [outDir] [--views a,b] [--advance ms] [--scale 0.5]'); process.exit(2); }

const BROWSER = process.env.BROWSER_PATH || '/usr/bin/brave-browser';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: BROWSER,
  // ponytail: software WebGL so it runs headless with no GPU; slower, fine for a few frames
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Math.round(1280 * scale), height: Math.round(720 * scale) }, deviceScaleFactor: 1 });
const logs = [], errors = [];
page.on('console', m => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(url, { waitUntil: 'networkidle' });
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
await frames();
if (advance) await page.evaluate(ms => window.advanceTime?.(ms), advance);

for (const v of views) {
  await page.evaluate(name => window.capture?.setView?.(name), v);
  await frames();
  await page.screenshot({ path: path.join(outDir, `${v}.png`) });
}
const state = await page.evaluate(() => (window.render_game_to_text ? window.render_game_to_text() : null));
fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2));
fs.writeFileSync(path.join(outDir, 'console.log'), logs.join('\n'));
await browser.close();

console.log(JSON.stringify({ views: views.map(v => path.join(outDir, `${v}.png`)), state, errors }, null, 1));
process.exit(errors.length ? 1 : 0);

// Preset-camera screenshots + state dump for agent self-checks.
//
//   node tools/capture-view.mjs <url> [outDir] [--views a,b,c] [--advance ms] [--scale 0.5] [--eval js]
// --eval runs a script in the page before --advance (play a scripted round, click through a menu).
//
// The page under test may expose (develop-web-game pattern):
//   window.capture.setView(name)   -> moves the camera to a named preset (await-able)
//   window.advanceTime(ms)         -> steps the game deterministically
//   window.render_game_to_text()   -> JSON-able snapshot of game state
// Writes <outDir>/<view>.png, state.json, console.log. Exit 1 on page errors, console errors or HTTP >= 400.
// Real time drives play, but the first advanceTime call should restart from the seed and stop real-time
// stepping, or load time leaks into state.json. Define the hooks last: this waits for them, and a shot
// taken while a module still parses models comes out black.
// It calls setView itself, which hides a game that never sets its own start camera: check one shot with
// --eval "window.capture = undefined".
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const views = flag('--views', 'default').split(',');
const advance = Number(flag('--advance', 0));
const scale = Number(flag('--scale', 0.5));
const script = flag('--eval', '');
const [url, outDir = 'captures'] = args;
if (!url) { console.error('usage: capture-view.mjs <url> [outDir] [--views a,b] [--advance ms] [--scale 0.5] [--eval js]'); process.exit(2); }

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
// networkidle can fire while the page's module is still parsing models, before the hooks exist;
// a screenshot then catches an empty black canvas (about 1 in 5 runs under SwiftShader).
await page.waitForFunction(() => window.capture || window.render_game_to_text, null, { timeout: 20000 })
  .catch(() => errors.push('page never defined window.capture or window.render_game_to_text'));
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
await frames();
if (script) await page.evaluate(script).catch(e => errors.push(`--eval failed: ${e.message.split('\n')[0]}`));
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

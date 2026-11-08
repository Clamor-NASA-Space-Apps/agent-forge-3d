// Render a local HTML file (a chart, a diagram, a slide) to a sharp PNG with headless Brave.
// Usage: node tools/html-to-png.mjs in.html out.png [--selector "#card"] [--scale 2]
// The PNG is cropped to the selector's box, so the page can be any size.
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const selector = flag('--selector', 'body > *');
const scale = Number(flag('--scale', 2));
const [input, output] = args;
if (!input || !output) { console.error('usage: html-to-png.mjs in.html out.png [--selector css] [--scale n]'); process.exit(2); }

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/brave-browser' });
const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 1400, height: 900 } });
await page.goto(pathToFileURL(resolve(input)).href);
await page.evaluate(() => document.fonts.ready);
await page.locator(selector).first().screenshot({ path: output, omitBackground: true });
await browser.close();
console.log(output);

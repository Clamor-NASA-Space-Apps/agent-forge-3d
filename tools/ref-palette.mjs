#!/usr/bin/env node
// Usage: node tools/ref-palette.mjs <refsDir> [--thumbs outDir] [--colors 8]
// Prints an N-colour palette (dark to light) per image, as a markdown table row start,
// and optionally writes <=1000 px JPEG copies so an agent can open big refs cheaply.
// Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, parse } from 'node:path';

const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/ref-palette.mjs <refsDir> [--thumbs outDir] [--colors 8]'); process.exit(2); }
const opt = (k, d) => { const i = rest.indexOf(k); return i < 0 ? d : rest[i + 1]; };
const thumbs = opt('--thumbs'), n = Number(opt('--colors', 8));
if (thumbs) mkdirSync(thumbs, { recursive: true });

const ff = (args, opts) => execFileSync('ffmpeg', ['-loglevel', 'error', ...args], opts);
const files = readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

for (const f of files) {
  const src = join(dir, f);
  if (thumbs) ff(['-y', '-i', src, '-vf', "scale='min(1000,iw)':'min(1000,ih)':force_original_aspect_ratio=decrease", '-q:v', '3', join(thumbs, parse(f).name + '.jpg')]);
  // palettegen writes a 16x16 palette image; its first n pixels are the colours, already sorted dark to light.
  const raw = ff(['-i', src, '-vf', `scale=200:-1,palettegen=max_colors=${n}:reserve_transparent=0:stats_mode=full`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  const hex = [];
  for (let i = 0; i < n * 3; i += 3) hex.push('#' + raw.subarray(i, i + 3).toString('hex'));
  console.log(`| ${f} | ${hex.join(' ')} |`);
}

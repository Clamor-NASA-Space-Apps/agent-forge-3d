// Preset-camera screenshots + state dump for agent self-checks.
//
//   node tools/capture-view.mjs <project dir> [outDir] [--views a,b,c] [--advance ms] [--scale 0.5] [--scene res://x.tscn] [-- game args]
// --views none skips the pictures and runs headless: the cheap way to ask "is power 40%?".
//
// The game registers its hooks with the Forge autoload (godot/addons/forge/forge.gd):
//   Forge.register(self)
//   render_game_to_text() -> Dictionary    a JSON-able snapshot of game state
//   set_view(name)                         moves the camera to a named preset
// Time is stepped by the engine: the game runs with --fixed-fps 60, so --advance 2000 is exactly 120 frames
// from the first one, the same on every machine. A game that keeps its own clock must drive it from delta.
// Writes <outDir>/<view>.png, state.json, console.log. Exit 1 on a script or engine error.
// It calls set_view itself, which hides a game that never sets its own start camera: check one shot with
// a view name the game does not know.
import fs from 'node:fs';
import path from 'node:path';
import { runJob } from './godot.mjs';

const all = process.argv.slice(2), cut = all.indexOf('--');
const args = cut < 0 ? all : all.slice(0, cut), gameArgs = cut < 0 ? [] : all.slice(cut + 1);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const views = flag('--views', 'default').split(',').filter(v => v && v !== 'none');
const advance = Number(flag('--advance', 0));
const scale = Number(flag('--scale', 0.5));
const scene = flag('--scene', '');
const [project, outDir = 'captures'] = args;
if (!project) { console.error('usage: capture-view.mjs <project dir> [outDir] [--views a,b|none] [--advance ms] [--scale 0.5] [--scene res://x.tscn]'); process.exit(2); }

const { result, errors } = runJob(project, { out: outDir, views, advance }, { scene, gameArgs, width: Math.round(1280 * scale), height: Math.round(720 * scale) });
const state = result?.state ?? null;
fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2));

console.log(JSON.stringify({ views: (result?.views ?? []).map(v => path.join(outDir, `${v}.png`)), state, render: result?.render, errors }, null, 1));
process.exit(errors.length ? 1 : 0);

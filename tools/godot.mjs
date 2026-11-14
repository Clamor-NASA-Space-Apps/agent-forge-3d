// Starts a Godot project with a job for its Forge autoload (godot/addons/forge/forge.gd) and reads the result.
// capture-view.mjs and feel-probe.mjs share it, so there is one way to launch the game under test.
//
//   GODOT          the engine binary (default `godot`)
//   FORGE_TIMEOUT_S  seconds before a run is killed (default 300); a loaded machine needed 1,500 for a capture
//   FORGE_DISPLAY  `window` draws on the real screen and GPU; the default is a hidden X server (xvfb-run)
//                  with software OpenGL, so a check never puts a window in front of the user
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

export const GODOT = process.env.GODOT || 'godot';
// what Godot prints for a script or engine error; a warning is not one
const LIMIT = 1000 * Number(process.env.FORGE_TIMEOUT_S || 300);
const ERROR = /^(USER )?(SCRIPT )?ERROR:|Parse Error:|Failed to load script/;

// xvfb-run stops its X server only when its command ends: killed (a timeout), it left the server and the game
// running, and a night of captures leaked 45 servers and a game at 85% CPU (13 Nov). In its own session, a TERM
// takes the whole group down: xvfb-run, its server and the game.
const HIDDEN = 'trap "trap - TERM; kill -- -$$" TERM INT; xvfb-run "$@" & wait $!';

export function godot(args, opts = {}) {
  const r = spawnSync(GODOT, args, { encoding: 'utf8', timeout: LIMIT, maxBuffer: 64 << 20, ...opts });
  if (r.error?.code === 'ENOENT') throw new Error(`no Godot at "${GODOT}": put godot on PATH or set GODOT`);
  return r;
}

// Is there a model, picture or sound the engine has not imported yet (no `.import` beside it)?
function unimported(dir) {
  const names = fs.readdirSync(dir);
  if (names.includes('.gdignore')) return false;
  return names.some(n => {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) return !n.startsWith('.') && n !== 'build' && unimported(f);
    return /\.(glb|gltf|png|jpg|webp|svg|ogg|wav)$/.test(n) && !names.includes(n + '.import');
  });
}

// A project that was never opened has no import cache, and a file added with the editor closed is not in it:
// both fail to load. (A new `class_name` is still unknown until the next import; preload scripts by path.)
export function ensureImported(project) {
  if (!fs.existsSync(path.join(project, 'project.godot'))) throw new Error(`${project} has no project.godot`);
  if (!fs.existsSync(path.join(project, '.godot')) || unimported(project)) godot(['--headless', '--path', project, '--import']);
}

// job: { out, advance?: ms, views?: [names], runs?: [...] }  (see forge.gd for a run)
// Returns { result, errors, log }. Pictures need a renderer, so a job with views or films gets a display;
// anything else runs --headless, which is several times faster.
export function runJob(project, job, { scene, gameArgs = [], width = 640, height = 360 } = {}) {
  ensureImported(project);
  const out = path.resolve(job.out ?? 'captures');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, '.gdignore'), '');  // or the engine imports every screenshot as a texture
  const jobFile = path.join(out, 'job.json'), resultFile = path.join(out, 'result.json');
  fs.writeFileSync(jobFile, JSON.stringify({ ...job, out }));
  fs.rmSync(resultFile, { force: true });
  const draws = job.views?.length || job.runs?.some(r => r.shots);
  // a frame cap well past the job's own length, so a game whose harness failed to load cannot spin forever
  const ms = (job.advance ?? 0) + (job.runs ?? []).reduce((t, r) => t + r.segs.reduce((a, s) => a + s.ms, 0), 0);
  const args = ['--path', project, '--fixed-fps', '60', '--disable-vsync', '--audio-driver', 'Dummy', '--quit-after', String(Math.round(ms / 1000 * 60 * 2) + 3000)];
  if (!draws) args.push('--headless');
  else args.push('--rendering-driver', 'opengl3', '--resolution', `${width}x${height}`);
  if (scene) args.push(scene);
  args.push('--', `--forge-job=${jobFile}`, ...gameArgs);
  const hidden = draws && process.env.FORGE_DISPLAY !== 'window';
  const r = hidden
    ? spawnSync('setsid', ['sh', '-c', HIDDEN, 'sh', '-a', '-s', '-screen 0 1280x720x24', GODOT, '--display-driver', 'x11', ...args], { encoding: 'utf8', timeout: LIMIT, maxBuffer: 64 << 20 })
    : godot(args);
  if (r.error?.code === 'ENOENT') throw new Error(hidden ? 'pictures need xvfb-run (or FORGE_DISPLAY=window to use the real screen)' : `no Godot at "${GODOT}"`);
  const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // one line per distinct error: a broken _process repeats its error every frame
  const errors = [...new Set(log.split('\n').map(l => l.trim()).filter(l => ERROR.test(l)))].slice(0, 20);
  let result = null;
  if (fs.existsSync(resultFile)) result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  else errors.push(`Godot stopped without a result${r.error ? ` (${r.error.code})` : ''}: ${log.trim().split('\n').slice(-3).join(' | ')}`);
  errors.push(...(result?.errors ?? []));
  fs.writeFileSync(path.join(out, 'console.log'), log.slice(0, 1 << 20));
  return { result, errors, log };
}

// Serves a web build's folder. web-check and serve-web share it.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.pck': 'application/octet-stream' };
export const staticHandler = dir => (q, s) => {
  const file = path.join(dir, path.normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^[/\\]+/, '') || 'index.html');
  if (!file.startsWith(dir) || !fs.existsSync(file)) { s.writeHead(404).end(); return; }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  // a gzipped copy beside the file (gzipWeb()) goes to a browser that takes it: the build is about half the bytes
  if (/\bgzip\b/.test(q.headers['accept-encoding'] ?? '') && fs.existsSync(file + '.gz')) {
    s.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' });
    fs.createReadStream(file + '.gz').pipe(s);
    return;
  }
  s.writeHead(200, { 'content-type': type });
  fs.createReadStream(file).pipe(s);
};

// Writes a .gz beside each large file of a web build (once; again when the file is newer), for staticHandler.
export const gzipWeb = dir => {
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    if (f.endsWith('.gz') || fs.statSync(file).size < 100_000) continue;
    const gz = file + '.gz';
    if (fs.existsSync(gz) && fs.statSync(gz).mtimeMs >= fs.statSync(file).mtimeMs) continue;
    fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(file), { level: 6 }));
  }
};

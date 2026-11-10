// Starts a Godot project with a job for its Forge autoload (godot/addons/forge/forge.gd) and reads the result.
// capture-view.mjs and feel-probe.mjs share it, so there is one way to launch the game under test.
//
//   GODOT          the engine binary (default `godot`)
//   FORGE_DISPLAY  `window` draws on the real screen and GPU; the default is a hidden X server (xvfb-run)
//                  with software OpenGL, so a check never puts a window in front of the user
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const GODOT = process.env.GODOT || 'godot';
// what Godot prints for a script or engine error; a warning is not one
const ERROR = /^(USER )?(SCRIPT )?ERROR:|Parse Error:|Failed to load script/;

export function godot(args, opts = {}) {
  const r = spawnSync(GODOT, args, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20, ...opts });
  if (r.error?.code === 'ENOENT') throw new Error(`no Godot at "${GODOT}": put godot on PATH or set GODOT`);
  return r;
}

// A project that was never opened has no import cache, and its models and textures fail to load.
export function ensureImported(project) {
  if (!fs.existsSync(path.join(project, 'project.godot'))) throw new Error(`${project} has no project.godot`);
  if (!fs.existsSync(path.join(project, '.godot'))) godot(['--headless', '--path', project, '--import']);
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
    ? spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1280x720x24', GODOT, '--display-driver', 'x11', ...args], { encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 })
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
  s.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(s);
};

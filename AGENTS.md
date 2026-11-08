# AGENTS.md: agent-forge-3d

`CLAUDE.md` is a symlink to this file. This repo will be **public**, so keep it generic: no game-, event- or team-specific content, data or assets.

## What it is
Two tools that let an AI agent build and check 3D game content without "seeing" 3D:
1. **Asset forge** (`forge/`): headless Blender recipes → `out/<name>.glb` + `previews/<name>_{front,side,top}.png`.
2. **capture-view** (`tools/capture-view.mjs`): opens a page in a headless Chromium-family browser, steps time, screenshots preset cameras, dumps state, and fails on errors.

## Forge rules
- **Recipes:** one per asset, `forge/<name>.py`, 40–80 lines.
  - Import from `lib.py` (`reset, mat, box, cyl, sphere, bevel, array, mirror, cut, smooth, finish`).
  - Never re-implement a helper inside a recipe. Missing helper → add it to `lib.py` once.
- **Run:** `blender -b -P forge/<name>.py`. It prints `FORGE_DONE <glb> <pngs>`.
- **Before calling a model done:** open all 3 PNGs and compare them with the reference images you were given.
- **Look:**
  - Bevel every hard-surface part. It's the cheapest "looks produced" win.
  - `smooth()` round parts.
  - Reuse materials by name (fewer draw calls).
- `finish()` puts the origin on the ground, centred, so models drop straight onto build pads.
- **Previews render with Cycles CPU, 24 samples** (works with no GPU or display). Don't switch to EEVEE.
- **Env vars:** `FORGE_OUT`, `FORGE_PREVIEWS`, `FORGE_NO_RENDER=1` (export only).
- **Blender 5.2 API notes:**
  - `shade_smooth_by_angle` + the `WEIGHTED_NORMAL` modifier replace the old auto-smooth.
  - Principled BSDF emission inputs are `Emission Color` / `Emission Strength`.
- **Known issue:** some distro Blender builds log an OpenColorIO version error. Renders still work, with raw colour. Judge shape in previews and final colour in three.js.

## capture-view contract
```
node tools/capture-view.mjs <url> [outDir] [--views a,b] [--advance ms] [--scale 0.5]
```
- **Optional page hooks:**
  - `window.capture.setView(name)`
  - `window.advanceTime(ms)` (deterministic stepping)
  - `window.render_game_to_text()` (JSON state; prefer it over screenshots for numeric checks, it's cheaper)
- **Exit code 1** on page errors, console errors, or HTTP ≥ 400 (favicon is ignored).
- **Browser:** `BROWSER_PATH` env, default `/usr/bin/brave-browser`. Software WebGL flags are on, so it works headless.
- **Smoke test:** serve the repo root (`python3 -m http.server 5179`), then capture `http://127.0.0.1:5179/tools/smoke/`.

## html-to-png
`node tools/html-to-png.mjs in.html out.png [--selector "#card"] [--scale 2]` renders a local HTML/SVG chart, diagram or slide to a PNG cropped to the selector (transparent outside it). Same `BROWSER_PATH` default.

## Checks before committing
1. `blender -b -P forge/smoke_crate.py` prints `FORGE_DONE`, and the previews look right.
2. capture-view smoke test exits 0.
3. No generated files committed (`out/`, `previews/`, `captures/`, `__pycache__/` are ignored).

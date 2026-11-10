# AGENTS.md: agent-forge-3d

`CLAUDE.md` is a symlink to this file. This repo will be **public**, so keep it generic: no game-, event- or team-specific content, data or assets.

## What it is
A factory where an AI agent builds 3D browser games without "seeing" 3D. Open `claude` in this folder and say what to build.
1. **Asset forge** (`forge/`): headless Blender recipes → `out/<name>.glb` + `previews/<name>_{front,side,top}.png`.
2. **capture-view** (`tools/capture-view.mjs`): opens a page in a headless Chromium-family browser, steps time, screenshots preset cameras, dumps state, and fails on errors.
3. **Design language** (`examples/DESIGN.md`, `runtime/house-style.js`, `tools/style-check.mjs`, `forge/lineup.py`): one DESIGN.md per project holds every colour, material, bevel, scale and light value. The forge and the browser read it; the checker fails anything that drifts.
4. **This file:** the workflow and rules every build follows.

**Projects live in `projects/<name>/`** (gitignored). Each one is its own git repo with its own remote and its own `AGENTS.md` for game-specific rules. Claude Code loads every `CLAUDE.md` from the working folder up, so a session in a project reads that project's file, this one, and any workspace file above it.

## Workflow (when asked to build something)
1. **Interview.** Create or open `projects/<name>/`. Ask with `AskUserQuestion` in as many rounds as it takes; there is no question cap. Two parts:
   - **The build:** the spec, the design pack and research paths to read, the deadline, what "done" looks like. Read only the files named.
   - **The look:** reference images (games, 3D objects, renders) saved to `design/refs/`, and for each one what we take from it and what we avoid. Mood words, audience, the weakest device it must run on. Open every image. **Never pick the look alone:** no references means ask again, not invent.
2. **Design.** Write 3 candidate styles as `design/variants/{a,b,c}.md` (copy `examples/DESIGN.md`, change only tokens and prose). For each: `node ../../tools/style-check.mjs design/variants/a.md` must pass, then render the probe lineup (`FORGE_PROBES=1 FORGE_DESIGN=design/variants/a.md FORGE_OUT=design/variants/a/out FORGE_PREVIEWS=design/variants/a blender -b -P ../../forge/lineup.py`). Show all three side by side on one page (lineup, swatches, materials, light, one HUD card) as a private Artifact. The user picks or mixes; write `DESIGN.md`, check it, commit it. No lane starts before this.
3. **Plan.** Enter plan mode. Propose the modules (see Modular architecture), the lanes with the folders they own, and each lane's check.
4. **Roadmap.** After approval, write `projects/<name>/roadmap.md`:
   - Sections of 2–4 hours of work, every item a `[ ]` box.
   - Every section ends with the same three boxes: `checks pass`, `/code-review medium`, `lessons`.
   - Write `CONTRACTS.md` first: state shape, event schema, prefab registry, test hooks. Lanes read only `CONTRACTS.md`, `DESIGN.md` and their own folder.
5. **Build a section in bulk.** Parallel agents in git worktrees for independent lanes. You merge.
6. **Gate the section.**
   - Re-run every agent's check yourself (`node --test`, capture-view). An agent's report is a lead, not proof. Read its diff before merging.
   - `node ../../tools/style-check.mjs DESIGN.md public/models/*.glb` passes (from the project folder), and one fresh lineup render is compared with the approved variant.
   - Run the `code-review` skill at `medium`. Fix only real bugs and regressions in normal use, re-review at most once, and send everything else to `findings.md`, one line each.
   - Tick the boxes, commit, push.
7. **Lessons**, then the next section. See Self-improvement.

## Design language
- **`DESIGN.md` is the only file with colour values.** Google Labs' format (`npx design.md lint`) for the HUD half, plus our 3D keys: `materials` (roles), `geometry` (bevel, shading, human and door size, per-class triangle and height budgets), `lighting` (one rig), `kit` (name pattern to role, for kit models). `style-check` runs the linter and ignores only the warnings these 3D keys cause.
- **Recipes ask for roles:** `mat("body")`. A raw colour or an unknown role raises. Seven core roles always exist: `body, trim, accent, metal, glass, rock, light`.
- **Every model in the browser goes through `applyHouseStyle()`, every scene through `applyLighting()`** (`runtime/house-style.js`). An unmapped kit material logs a warning; fix it with a `kit` entry, never in code.
- **Model file names start with their class** (`building_*`, `vehicle_*`, `rock_*`); anything else counts as `prop`. That picks the budget `style-check` applies.
- **Changing the look** is a DESIGN.md edit the user approves, shown with `npx design.md diff old.md new.md`. Never in code, never silently.

## Saving tokens
- State before pictures: `window.render_game_to_text()` answers "is power 40%?" for a fraction of a screenshot. Capture at `--scale 0.5`.
- three.js docs: read `https://threejs.org/docs/llms.txt` (5 KB), never llms-full. Load only the three.js skill the task needs.
- Read file ranges, not whole files. Don't re-read a file you edited a moment ago.
- Read-only sweeps (who calls this, which docs name this path) go to an Explore agent. Mechanical lanes (asset optimise, credits) can run on a smaller model.
- Brief agents like a peer: goal, files, what is ruled out, the check that proves done. A vague brief costs more than it saves.
- One review per section, not per commit.
- **Assemble, don't model:** real data or official models, then a CC0 kit, then three.js built-ins, then code for effects only, then a forge recipe. Stop at the first that works.
- **The scene is data:** agents edit `world.json` (pads, prefabs, cameras), not scene code. One `applyHouseStyle()` for every GLB. One `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` per asset.

## Code rules
**No em dashes.** Use a comma, a full stop, or rewrite the sentence. Applies to code, comments, commits and docs.

**No ASCII banner comments.** No rows of `-----` or `=====`, no boxed section headers.

**Comments sound like a person.** Say why, or what breaks without it. Skip comments that restate the line below.

**Ten lines that work beat a hundred that do the same thing.** Delete before you add.

**Before you write anything,** stop at the first answer that holds:
1. Does it need to exist? A knob nobody asked for, an interface with one implementation: skip it, say so in one line.
2. Does it already exist here? Grep first. See Choke points.
3. Does the platform do it? The browser, the stdlib, three.js addons.
4. Does an installed dependency cover it? Never add one for what a few lines can do.
5. Can it be one line? Then it is one line.
6. Only then, the smallest thing that works.

This shortens the solution, never the reading: trace the flow the change touches first. A bug report names a symptom; grep every caller and fix the shared function once. Never simplify away input validation, error handling that loses state, or anything the user asked for by name.

## Version control
- Commit at the end of every roadmap section (and whenever a lane merges). Sign off: `git commit -s`.
- Prefix by area: `sim:`, `world:`, `ui:`, `cine:`, `audio:`, `forge:`, `tools:`, `docs:`, plus `fix:` / `feat:` / `refactor:`, and `fix(security):` for anything security related.
- Run the formatter before committing, if the project has one.
- Fix forward. Never force-push. Never commit secrets, `.env*`, or generated files.
- If the workspace asks for an AI co-author trailer (some events require AI use to be disclosed), add it. Otherwise follow the project's rule.

## Modular architecture
Build it modular from the first commit so it never needs splitting later.
- **A module is a subsystem you can name in one sentence** ("the rules", "the scene", "the HUD"), not a verb and not a line count. Default game layout: `src/sim` (pure JS rules, no three.js, `node --test`), `src/data` (all numbers), `src/world`, `src/ui`, `src/cine`, `forge/`, `tools/`.
- **Files:** 200–800 lines is comfortable. Under about 100 is a merge candidate. A folder needs about three files or a boundary worth enforcing.
- **Types and constants live with their owner.** Only project-wide ones go in a shared file.
- **The sim is the single source of truth.** Scene and UI read its state and never hold game rules.
- **Choke points:** `DESIGN.md`, `lib.mat()` and `runtime/house-style.js` in every project, plus each project's own list in its `AGENTS.md` (seeded rng, the tuning file, test hooks). Bypassing one is a bug, not a shortcut. Writing new code beside existing code that does the same job is the most expensive mistake there is.

## Self-improvement
The factory gets better every time it hits an obstacle.
- **Tools:** a command sequence you ran twice, or a script of about 100 lines you would run again, becomes `tools/<name>.mjs` (or `forge/` for Blender) with a usage line at the top and a row in the Tools table. Generic → here. Project-only → that project's `tools/`.
- **Gotchas:** anything that took more than two tries becomes one line with its why, in the Gotchas of the right `AGENTS.md`. Generic → here (public: no game content, no secrets). Project-only → the project's file.
- **Keep each `AGENTS.md` under about 150 lines.** Merge duplicates, prune what no longer bites.

## Tools
| Tool | Use |
|---|---|
| `forge/lib.py` | Blender helpers for recipes: `reset, mat, box, cyl, cone, sphere, bevel, array, mirror, cut, smooth, finish`. Reads `FORGE_DESIGN` |
| `forge/lineup.py` | `blender -b -P forge/lineup.py`: every GLB in `out/` beside a 1.8 m person, one `previews/lineup.png`. `FORGE_PROBES=1` builds `forge/probes/` first |
| `tools/style-check.mjs` | `node tools/style-check.mjs DESIGN.md [model.glb ...]`: DESIGN.md lint + 3D keys + per-model roles, colours, triangles, height. Exit 1 on drift |
| `tools/design-tokens.mjs` | `node tools/design-tokens.mjs DESIGN.md out.json`: resolved tokens for the browser |
| `runtime/house-style.js` | `applyHouseStyle(root, design)`, `applyLighting(scene, renderer, design)` |
| `tools/capture-view.mjs` | `node tools/capture-view.mjs <url> [outDir] [--views a,b] [--advance ms] [--scale 0.5] [--eval js]`: screenshots per preset view + `state.json` + `console.log`; exit 1 on errors |
| `tools/html-to-png.mjs` | `node tools/html-to-png.mjs in.html out.png [--selector "#card"] [--scale 2]`: a local HTML/SVG chart, diagram or slide to a cropped PNG |

**Browser:** `BROWSER_PATH` env, default `/usr/bin/brave-browser`. Software WebGL flags are on, so it works headless.

## Forge rules
- **Recipes:** one per asset, `forge/<name>.py`, 40–80 lines. Import from `lib.py`. Materials by role only, bevels at the DESIGN.md default unless a part needs a sharper edge. Never re-implement a helper inside a recipe; a missing helper goes into `lib.py` once.
- **Run:** `blender -b -P forge/<name>.py`. It prints `FORGE_DONE <glb> <pngs>`.
- **Before calling a model done:** open all 3 PNGs and compare them with the reference images (get 1–2 real photos first).
- **Look:** bevel every hard-surface part (the cheapest "looks produced" win), `smooth()` round parts, reuse materials by name (fewer draw calls).
- `finish()` puts the origin on the ground, centred, so models drop straight onto build pads.
- **Previews render with Cycles CPU, 24 samples** (works with no GPU or display). Don't switch to EEVEE.
- **Env vars:** `FORGE_DESIGN` (default `examples/DESIGN.md`), `FORGE_OUT`, `FORGE_PREVIEWS`, `FORGE_NO_RENDER=1` (export only), `FORGE_PROBES=1` (lineup only).

## capture-view page hooks
- `window.capture.setView(name)`, `window.advanceTime(ms)` (deterministic stepping), `window.render_game_to_text()` (JSON state).
- Exit code 1 on page errors, console errors, or HTTP ≥ 400 (favicon ignored).
- **Smoke test:** serve the repo root (`python3 -m http.server 5179`), then capture `http://127.0.0.1:5179/tools/smoke/`.

## Gotchas
- Blender 5.2: `shade_smooth_by_angle` + the `WEIGHTED_NORMAL` modifier replace the old auto-smooth. Principled BSDF emission inputs are `Emission Color` / `Emission Strength`.
- Blender's `matrix_world` is stale after a location change until `view_layer.update()`; `_bounds()` calls it, so framing is right.
- In three.js a metal with no `scene.environment` renders black. `applyLighting()` sets a sky-coloured one.
- capture-view waits for `window.capture` or `window.render_game_to_text`: `networkidle` fires while a module is still parsing models, and the shot came out black about 1 in 5 runs. Define the hooks last.
- Blender `-b -P` exits 0 on a Python error unless you add `--python-exit-code 1`.
- `gltf-transform optimize` defaults merge things the game needs by name: `--join`/`--instance` fold same-material parts into one node (pass `false` for models the game hides part by part), `--palette` merges materials and loses role names (pass `false`). style-check reads meshopt GLBs, so check after optimizing.
- Forge previews only have the DESIGN.md rig. If the look depends on a game light (a fire, a lamp), also render each variant in three.js before the user picks.
- capture-view calls `setView` itself, so it hides a game that never sets its own start camera. Check one shot with `--eval "window.capture = undefined"`.
- Projects reach the tooling through `../../`, so a git worktree breaks them. Lanes with disjoint folders run in the same checkout and don't commit; you commit after reading the diff.
- Some distro Blender builds log an OpenColorIO version error. Renders still work, in raw colour: judge shape in previews, final colour in three.js.

## Checks before committing here
1. `blender -b -P forge/smoke_crate.py` prints `FORGE_DONE`, and the previews look right.
2. `node tools/style-check.mjs examples/DESIGN.md out/smoke_crate.glb` passes.
3. `node tools/design-tokens.mjs examples/DESIGN.md out/design.json`, then the capture-view smoke test exits 0 and `state.json` shows every material on a role.
4. No generated files or projects committed (`out/`, `previews/`, `captures/`, `projects/` are ignored).

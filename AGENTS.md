# AGENTS.md: agent-forge-3d

`CLAUDE.md` is a symlink to this file. This repo will be **public**, so keep it generic: no game-, event- or team-specific content, data or assets.

## What it is
A factory where an AI agent builds 3D games in Godot without "seeing" 3D. Open `claude` in this folder and say what to build.
1. **Asset forge** (`forge/`): headless Blender recipes → `out/<name>.glb` + `previews/<name>_{front,side,top}.png`.
2. **Test hooks** (`godot/addons/forge/forge.gd`, `tools/capture-view.mjs`): start the game with fixed-step time, screenshot preset cameras, dump state, fail on errors.
3. **Design language** (`examples/DESIGN.md`, `godot/addons/forge/house_style.gd`, `tools/style-check.mjs`, `forge/lineup.py`): one DESIGN.md per project holds every colour, material, bevel, scale and light value. The forge and the engine read it; the checker fails anything that drifts.
4. **Reality sheet** (`skills/reality-sheet`, `tools/feel-probe.mjs`): every number a player can feel has a real range and a source before the plan, and the probe measures the running game against it.
5. **Web check** (`tools/web-check.mjs`): exports the web build, weighs it, and proves it starts in a browser. This file holds the workflow and rules every build follows.

**Games are Godot 4.7 projects: GDScript only, the Compatibility renderer, shipped as a single-threaded web export.** A web build has no other renderer and cannot run C# or most native addons, so those three are fixed from the first commit.

**Projects live in `projects/<name>/`** (gitignored), made by `node tools/new-project.mjs <name>`. Each one is its own git repo with its own remote and its own `AGENTS.md` for game-specific rules. Claude Code loads every `CLAUDE.md` from the working folder up, so a session in a project reads that project's file, this one, and any workspace file above it.

## Workflow (when asked to build something)
1. **Interview.** Create or open `projects/<name>/`. Ask with `AskUserQuestion` in as many rounds as it takes; there is no question cap. Three parts:
   - **The build:** the spec, the design pack and research paths to read, the deadline, what "done" looks like. Read only the files named.
   - **The look:** reference images (games, 3D objects, renders) saved to `design/refs/`, and for each one what we take from it and what we avoid. Mood words, audience, the weakest device it must run on. Open every image (`tools/ref-palette.mjs --thumbs` for small copies and real palette hex), and write the notes to `design/refs/README.md`. **Never pick the look alone:** no references means ask again, not invent. Fastest route: give the user Google Images search terms (one line each, saying what it's for) to save into `design/refs/`; an image pasted in chat is not on disk, so ask for the file (store and press CDNs can be blocked on a venue router, and WebFetch drops article images).
   - **The real thing:** what each actor is in the real world (species or model, age, size; the nearest real thing if invented), where it can really go, and whether the user wants a voice (narration is opt-in).
2. **Design.** Write 3 candidate styles as `design/variants/{a,b,c}.md` (copy `examples/DESIGN.md`, change only tokens and prose); at least one carries photo texture sets (a role's `detail` `texture`, `normal`, `roughness`), because a flat palette picked from the preview was rejected in play as "low quality", a full redo (`skills/game-feel-gate` row 15). For each: `node ../../tools/style-check.mjs design/variants/a.md` must pass, then build the probes (`FORGE_PROBES=1 FORGE_DESIGN=design/variants/a.md FORGE_OUT=design/variants/a/out FORGE_PREVIEWS=design/variants/a blender -b -P ../../forge/lineup.py`) and its tokens (`design-tokens.mjs`). Show all three in the engine the game ships with: start `godot/preview` with the three token files (usage in its `main.gd`), and the user orbits and switches variant with keys 1 to 3. Static stills were too small to decide on. The user picks or mixes. A palette approved from a preview read as unfinished in play, so section 1's web build puts the pick on the weakest device (`serve-web`) before any lane builds on it. Write `DESIGN.md`, check it, commit it. No lane starts before this.
3. **Reality.** Write `projects/<name>/data/reality.json` with `skills/reality-sheet`: one row per number a player can feel (speeds, jumps, sizes, reach, endurance), each with its real range, a source and the game's value, plus a pair row for every chaser and hazard that says how the hero escapes. `node ../../tools/feel-probe.mjs data/reality.json` must pass. The user approves it with the plan. No physical number lives anywhere else, and no skill or brief supplies one.
4. **Plan.** Enter plan mode. Propose the modules (see Modular architecture), the lanes with the folders they own, and each lane's check.
5. **Roadmap.** After approval, write `projects/<name>/roadmap.md`:
   - Sections of 2–4 hours of work, every item a `[ ]` box; every section ends with the same three: `checks pass`, `/code-review medium`, `lessons`.
   - Write `CONTRACTS.md` first: state shape, event schema, prefab registry, input actions, collision layers, test hooks. Lanes read only `CONTRACTS.md`, `DESIGN.md` and their own folder.
   - **Checks first:** section 1 wires a fixture scene, the Forge hooks and the probe (`node ../../tools/feel-probe.mjs data/reality.json .`), and turns the `skills/game-feel-gate` rows that apply into tests. It ends with the probe failing on every measured row and erroring on none. A lane is done when its rows pass.
   - Pin what parallel lanes otherwise guess differently: forward axis and yaw convention, one table of collision layers with one owner, input action names, which inits `await`, the keys of `render_game_to_text()`, which groups are floors vs walls.
   - Pin how the parts plug together: the scene each lane delivers, the few methods the composition root calls on it, who owns the camera, how touch reaches it. Section 1 ships a stand-in with those methods, so every check runs before a lane lands and the root never waits for one.
6. **Build a section in bulk.** Parallel agents for independent lanes, in the same checkout with disjoint folders (projects reach the tooling through `../../`, so a git worktree breaks them); lanes don't commit, you commit after reading the diff. A lane's check can crash on another lane's half-written data file: re-run once before calling it a bug. From the second section on, resume each lane agent with SendMessage: it keeps its code in context and the brief halves. Each brief names its sheet rows and its skills (Skills table); the lane reads those skills before writing code.
   Run the bots early, through the hero's ability rows: a hazard that no bot or every bot escapes, or a 100% win rate, is a design bug that no screenshot shows.
7. **Gate the section.**
   - Re-run every agent's check yourself (`godot --headless --path . -s tests/run.gd`, the probe, capture-view), and open one film per gait, jump and pose (`feel-probe --film`). An agent's report is a lead, not proof. Read its diff before merging.
   - `node ../../tools/style-check.mjs DESIGN.md models/*.glb` passes (from the project folder), and one fresh lineup render is compared with the approved variant.
   - `python3 ../../skills/godot-nodes-scenes/scripts/check_godot_project.py .` reports 0 errors: a hand-written `.tscn` breaks quietly (a wrong resource id, a parent path that moved), and this reads every scene without starting the engine.
   - `node ../../tools/web-check.mjs .` passes: the native checks are fast, but the web build is what ships.
   - Run the `code-review` skill at `medium`. Fix only real bugs and regressions in normal use, re-review at most once, and send everything else to `findings.md`, one line each. A finding can be wrong: run the check it names before merging the fix.
   - **The user plays the web build** (five minutes, on the weakest device it must run on; `tools/serve-web.mjs` gives a phone its address) before the boxes are ticked: tests, bots and preset shots all passed a game that felt dead.
   - Tick the boxes, commit, push.
8. **Lessons**, then the next section. See Self-improvement.

## Design language
- **`DESIGN.md` is the only file with colour values.** Google Labs' format (`npx design.md lint`) for the HUD half, plus our 3D keys: `materials` (roles), `geometry` (bevel, shading, human and door size, per-class triangle and height budgets), `lighting` (one rig), `kit` (name pattern to role, for kit models). `style-check` runs the linter and ignores only the warnings these 3D keys cause.
- **Recipes ask for roles:** `mat("body")`. A raw colour or an unknown role raises. Seven core roles always exist: `body, trim, accent, metal, glass, rock, light`.
- **Every model in the game goes through `Forge.HouseStyle.apply()`, every scene through `Forge.HouseStyle.apply_lighting()`.** An unmapped kit material logs a warning; fix it with a `kit` entry, never in code. The HUD takes its colours from the same token file (`design.json`).
- **Model file names start with their class** (`building_*`, `vehicle_*`, `rock_*`); anything else counts as `prop`. That picks the budget `style-check` applies. Flat pieces (road tiles, paths) need a class of their own whose height range starts at 0: `prop` starts at 0.1 m.
- **Surface detail and quality live in DESIGN.md too:** a role may carry `detail` (a pattern drawn by the shader from world position, or a photo `texture` on the richest preset), `lit` (window panes that switch) and `shadow: false`; `quality` holds the presets a settings screen offers (`low`, `medium`, `high`). Detail shades a role's colour, it never replaces it.
- **Optional themes** (a settings switch): `DESIGN.<theme>.md` beside DESIGN.md, the only other files with colour values. Same roles, same `geometry` (models are shared), only colours and light differ; style-check each theme file alone (GLBs carry DESIGN.md colours and are checked against DESIGN.md only). `shading: flat` reaches kit models through `apply()`.
- **Changing the look** is a DESIGN.md edit the user approves, shown with `npx design.md diff old.md new.md` and a plain `diff -u` (the linter's diff skips the 3D keys). Never in code, never silently.

## Saving tokens
- State before pictures: `capture-view --views none` runs headless and answers "is power 40%?" in a third of a second. A picture needs a display and takes about six. Capture at `--scale 0.5`.
- Godot docs: read one class page as text, `https://raw.githubusercontent.com/godotengine/godot-docs/4.7/classes/class_<name>.rst`, or ask the engine (`ClassDB.class_has_method()` in a headless script). Load only the Godot skill the task needs.
- Read file ranges, not whole files. Don't re-read a file you edited a moment ago. One review per section, not per commit.
- Brief agents like a peer: goal, files, what is ruled out, the check that proves done. Read-only sweeps (who calls this) go to an Explore agent; mechanical lanes (asset optimise, credits) can run on a smaller model.
- **Assemble, don't model:** real data or official models, then a CC0 kit, then engine built-ins (nodes, primitive meshes, sky, particles), then code for effects only, then a forge recipe. Stop at the first that works. A creature needs a rigged model with authored clips before anything else is tried.
- **The scene is data:** everything the rules need to know (pads, prefab ids, tags, routes, camera presets) lives in `data/world.json`, and one loader instances prefab scenes from it, so the sim and the bots reason about the world without a scene. Dressing with no rules can be a `.tscn` a person arranges in the editor.

## Code rules
- **No em dashes** (a comma, a full stop, or rewrite) in code, comments, commits and docs. **No ASCII banner comments** (rows of `-----` or `=====`, boxed headers).
- **Comments sound like a person:** say why, or what breaks without it; skip comments that restate the line below. **Ten lines that work beat a hundred that do the same thing.** Delete before you add.
- **GDScript is typed** (`var speed: float`, `-> void`), and an engine warning is something to fix, not noise.

**Before you write anything,** stop at the first answer that holds:
1. Does it need to exist? A knob nobody asked for, an interface with one implementation: skip it, say so in one line.
2. Does it already exist here? Grep first. See Choke points.
3. Does the engine do it? A built-in node, a project setting, an import option.
4. Does an addon already in the project cover it? Never add one for what a few lines can do, and never a native (GDExtension) one: it will not load in the web build.
5. Can it be one line? Then it is one line. Only then, the smallest thing that works.

This shortens the solution, never the reading: trace the flow the change touches first. A bug report names a symptom; grep every caller and fix the shared function once. Never simplify away input validation, error handling that loses state, or anything the user asked for by name.

## Version control
- Commit at the end of every roadmap section (and whenever a lane merges). Sign off: `git commit -s`. Add an AI co-author trailer if the workspace asks for one (some events require AI use to be disclosed).
- Prefix by area: `sim:`, `world:`, `ui:`, `cine:`, `audio:`, `forge:`, `tools:`, `docs:`, plus `fix:` / `feat:` / `refactor:`, and `fix(security):` for anything security related.
- Fix forward. Never force-push. Never commit secrets, `.env*`, or generated files (`.godot/`, `build/`, `captures/`). Godot's `.uid` files are not generated noise: commit them.

## Modular architecture
- **A module is a subsystem you can name in one sentence** ("the rules", "the scene", "the HUD"), not a verb and not a line count. Default game layout: `sim/` (pure GDScript rules: `RefCounted` classes, no nodes, no scene tree, run by `tests/run.gd` headless; the single source of truth, so scene and UI read its state and never hold game rules), `data/` (all numbers), `world/`, `player/`, `ui/`, `cine/`, `models/`, `tests/`, `forge/`, `tools/`.
- **Files:** 200–800 lines is comfortable, under about 100 is a merge candidate, a folder needs about three files or a boundary worth enforcing. Types and constants live with their owner; only project-wide ones go in a shared file.
- **Choke points:** `DESIGN.md`, `lib.mat()` and `addons/forge/` in every project, plus each project's own list in its `AGENTS.md` (seeded rng, the tuning file, input actions). `addons/forge/` is a copy: change it here and run `new-project.mjs <name> --sync`. Bypassing a choke point is a bug, not a shortcut. Writing new code beside existing code that does the same job is the most expensive mistake there is.

## Self-improvement
- **Tools:** a command sequence you ran twice, or a script of about 100 lines you would run again, becomes `tools/<name>.mjs` (or `forge/` for Blender) with a usage line at the top and a row in the Tools table. Generic → here. Project-only → that project's `tools/`.
- **Gotchas:** anything that took more than two tries becomes one line with its why, in the Gotchas of the right `AGENTS.md`. Generic → here (public: no game content, no secrets). Project-only → the project's file.
- **Lessons prevent, they don't patch.** Write each one for any game (the principle, then one example), and put it where the next build meets it before building: a sheet question, a skill rule, a probe measure. A skill never states a number without a source.
- **Keep each `AGENTS.md` under about 150 lines.** Merge duplicates, prune what no longer bites.

## Skills
`skills/<name>/SKILL.md` (linked at `.claude/skills`, so every session here has them). Two kinds live there. **Factory skills** hold what past builds got wrong. **Godot skills** hold engine idiom: they are an unchanged copy of a third-party pack (`skills/THIRD-PARTY.md` names them, their source and licence), never edited here. Pick both at plan time from what the plan has, and name them in the lane briefs. Where they disagree, the factory skill wins.
| The plan has | Factory skill | Godot skill |
|---|---|---|
| any moving actor, a chase, a jump, a physical number | `reality-sheet` | |
| a creature on screen (hero or NPC) | `character-life` | `godot-animation` |
| a suited or armoured actor (space suit, diving suit, armour) | `suited-locomotion` | `godot-animation` |
| a body the player controls | `character-body` | `godot-physics`, `input-systems` |
| solids to touch: props, buildings, curbs | `world-collision` | `godot-physics` |
| a walker or vehicle on loose ground (dust, sand, snow, mud) | `ground-contact-fx` | `godot-shaders` |
| a world the player walks through: sound, ambient motion, a hero that breathes, weight; a playtest that says "static" or "silent" | `living-atmosphere` | `godot-audio`, `godot-animation` |
| a sun with shadows and a followed hero; a hero who must stand on the ground | `shadows-and-grounding` | `godot-3d-essentials` |
| jumping, climbing, getting in or on | `contextual-traversal` | |
| a follow camera | `third-person-camera` | `camera-systems` |
| traffic, crowds, chasers | `living-world` | `game-ai` |
| a gate | `game-feel-gate` | `performance-optimization`, `godot-export` |
| scenes, prefabs, signals, data files | | `godot-nodes-scenes`, `godot-signals-groups`, `godot-resources` |
| sky, light, materials, effects | | `godot-3d-essentials`, `godot-shaders` |
| HUD and menus, sound | | `godot-ui-control`, `godot-audio` |
| rules, tests and bots | | `godot-gdscript`, `godot-gdscript-headless-testing` |
| needs that drain, things to build; a deadline in days | | `survival-crafting`; `game-jam` |

## Tools
| Tool | Use |
|---|---|
| `forge/lib.py` | Blender helpers for recipes: `reset, mat, box, cyl, cone, sphere, prism, bar, label` (raised text, optional font), `tyre, bevel, array, mirror, cut, smooth, join` (parts into one node), `settle` (origin on a hinge or hub), `finish`. Reads `FORGE_DESIGN` |
| `forge/lineup.py` | `blender -b -P forge/lineup.py`: every GLB in `out/` beside a 1.8 m person, one `previews/lineup.png` (and `lineup_2.png`, ... when the row passes 25 m). `FORGE_PROBES=1` builds `forge/probes/` first; `-- name=height` sizes a model first (downloads come in their own units). Skips `terrain_*` and classes taller than 100 m |
| `tools/new-project.mjs` | `node tools/new-project.mjs <name>`: a Godot project in `projects/<name>/` with the Forge addon, the web preset and the fixed settings. `--sync` refreshes the addon in an existing one |
| `godot/addons/forge/` | The `Forge` autoload: `register(self)` for the hooks `render_game_to_text()`, `set_view(name)` (`default` is the game's own play view), `place(pos, yaw_deg)`; `HouseStyle.apply(root, design, still)`, `apply_lighting(parent, design)`, `make_lamp(design)`, `set_quality(root, design, level)` and `default_quality()` (DESIGN.md `quality` presets: anti-aliasing, render size, shadows, glow, lamps lit, surface detail), `merge()` (still meshes into one per material); `load_glb(path)`. `test.gd`: the base a headless test extends (watchdog, window size, `check()`, touches shaped like a browser's) |
| `tools/capture-view.mjs` | `node tools/capture-view.mjs <project> [outDir] [--views a,b\|none] [--advance ms] [--scale 0.5] [--scene res://x.tscn]`: screenshots per preset view + `state.json` + draw calls and triangles per view + `console.log`; exit 1 on errors |
| `tools/feel-probe.mjs` | `node tools/feel-probe.mjs <reality.json> [project] [--film id,id]`: checks the sheet (sources, ranges, escapes), then plays each measured row with real input events and compares; a film is 8 frames of a run in one PNG. Exports `play` for project checks |
| `tools/web-check.mjs` | `node tools/web-check.mjs <project> [outDir] [--budget-mb 15]`: web export, game data against the budget, download size as a host sends it, engine start time and console errors in a browser, `web.png` |
| `tools/serve-web.mjs` | `node tools/serve-web.mjs <project> [--port 5188]`: serves the web build for play: `http://localhost` here, https on the network for phones |
| `godot/preview/` | Style variants in the engine: token files, probe models in a row, a 1.8 m person, one swatch sphere per material role, lamps from `lighting.lamp`. Keys 1 to 9 switch variant; capture with `--views three,low` |
| `tools/style-check.mjs` | `node tools/style-check.mjs DESIGN.md [model.glb ...]`: DESIGN.md lint + 3D keys + per-model roles, colours, triangles, height. Exit 1 on drift |
| `tools/design-tokens.mjs` | `node tools/design-tokens.mjs DESIGN.md design.json`: resolved tokens for the engine |
| `tools/kit-roles.mjs` | `node tools/kit-roles.mjs DESIGN.md models kit/*.glb --scale 8 --prefix building_`: atlas-textured kit models (Kenney 2.x) to one primitive per role, by `#hex: role` anchors in DESIGN.md `kit`. `--palette` lists the atlas colours to map, `--swap a=b` repaints one run; keeps skins and clips |
| `tools/ref-palette.mjs` | `node tools/ref-palette.mjs design/refs [--thumbs dir] [--colors 8]`: an N-colour palette row per reference image, plus ≤1000 px copies to open big refs cheaply. Needs ffmpeg |
| `tools/html-to-png.mjs` | `node tools/html-to-png.mjs in.html out.png [--selector "#card"] [--scale 2]`: a local HTML/SVG chart, diagram or slide to a cropped PNG |

**Engine:** `GODOT` env, default `godot` on PATH: the 4.7 standard build (not .NET) with the Web export templates installed. `--headless` draws nothing: pictures are drawn on a hidden X server (`xvfb-run`) with software OpenGL, where frame rate means nothing (measure it on the real device, in the web build); `FORGE_DISPLAY=window` uses the real screen. **Browser** (web-check, html-to-png): `BROWSER_PATH`, default `/usr/bin/brave-browser`.

## Forge rules
- **Recipes:** one per asset, `forge/<name>.py`, 40–80 lines, run with `blender -b -P forge/<name>.py` (prints `FORGE_DONE <glb> <pngs>`). Import from `lib.py`. Materials by role only, bevels at the DESIGN.md default unless a part needs a sharper edge. Never re-implement a helper inside a recipe; a missing helper goes into `lib.py` once.
- **Look:** bevel every hard-surface part (the cheapest "looks produced" win), `smooth()` round parts, reuse materials by name (fewer draw calls). Before calling a model done, open all 3 PNGs and compare them with 1–2 real photos.
- `finish()` puts the origin on the ground, centred, so models drop straight onto build pads. **Previews render with Cycles CPU, 24 samples** (no GPU or display needed); don't switch to EEVEE.
- **Env vars:** `FORGE_DESIGN` (default `examples/DESIGN.md`), `FORGE_OUT`, `FORGE_PREVIEWS`, `FORGE_NO_RENDER=1` (export only), `FORGE_PROBES=1` (lineup only).

## Gotchas
- Blender `-b -P` exits 0 on a Python error unless you add `--python-exit-code 1`. Distro builds may log an OpenColorIO version error: renders still work in raw colour, so judge shape in previews and colour in the engine.
- Godot 4.7 cannot read a GLB with meshopt, quantized or Draco-compressed meshes ("required extension ... is not supported"), so `--compress false`; WebP textures load. Official and kit models often arrive Draco-compressed: run them through `gltf-transform optimize` first. Its defaults also merge things the game needs by name: `--join`/`--instance` fold same-material parts into one node and drop their names (pass `false` for models the game moves or hides part by part, or whose part names carry collision suffixes), `--palette` merges materials and loses role names (pass `false`).
- The Compatibility renderer adds a light with shadows in sRGB space: one sun plus ambient came out 2.2 times too bright on flat ground. `apply_lighting()` corrects its sun; any other shadowed light needs its energy cut by eye, so keep to one or two. Sky-sourced ambient ignored `ambient_light_energy` there too, so the rig's ambient is a colour.
- A web build runs only on https or localhost, so a phone cannot open it at the laptop's plain address. `node tools/serve-web.mjs <project>` prints an https address for phones on the same Wi-Fi (its certificate is self-made: Advanced, then Proceed) and sets `adb reverse` for one on USB. In a phone browser `OS.has_feature("mobile")` is false; ask for `web_android` or `web_ios`, or for touch `DisplayServer.is_touchscreen_available()`. The engine is a 38 MB download before any game data (about 10 MB when the host compresses it), so host where files are served gzipped. The 15 MB budget is the game's own data (`.pck`).
- A script error repeats every frame and the game keeps running. The tools report each distinct line once and cap the run's frames; read the first error, the rest follow from it. A helper named `_get` or `_set` in a node script overrides the engine's own and fails to parse.
- Godot runs from the project folder, so a relative path passed after `--` points there: pass absolute paths. A project that was never opened has no import cache, and a model added with the editor closed is not in it. The tools import when either is the case; a headless test started by hand does not, so run `godot --headless --path . --import` first. A `class_name` added after the last import is unknown to the tools ("identifier not declared"): preload scripts by path.
- Under ACES a dim light can fall below the tone curve's black point: a night's shadowed moon lit nothing (`#000000` ground) until `apply_lighting()` solved its energy against the real curve, and faces only the ambient reaches go pure black unless `lighting.ambient` clears it. Measure a pixel, do not trust the number. A look that depends on a game light (a fire, a lamp) is near black under its own sky. Give DESIGN.md a `lighting.lamp`: forge previews then render in plain daylight, to judge shape, and the look is judged in `godot/preview`.
- A web export ships only what the engine imports: data files (`*.json`) need the preset's `include_filter` (`new-project.mjs` writes it), and a folder of references or tools inside the project ships too unless it holds a `.gdignore` (`new-project.mjs` writes one into `design/`, `research/`, `forge/` and `tools/`, and the tools into their output folder). A hand-written `project.godot` runs Godot Physics unless it names `physics/3d/physics_engine="Jolt Physics"` (the editor's default); `new-project.mjs` writes that too.
- A texture used only by a `ShaderMaterial` (role `detail` photos, terrain sets) imports with no mipmaps and no compression: it crawls with moire and the shader's photo average (`textureLod` at a high level) reads one pixel. Set `mipmaps/generate=true` and `compress/mode=2` in its `.import`, and `compress/normal_map=2` on normal maps the shader reads as RGB (normal-map compression keeps only RG).
- Depth fog's `fog_density` is the most fog anything gets, and the engine's 0.01 left the far end 1% fogged (measured, 4.7.2): `apply_lighting()` now sets it from `fog.density` (default 1). The same rig's `ProceduralSkyMaterial` drew the sun disc at the light's energy, darker than a bleached horizon, so a design with `sunDisc` gets `sky.gdshader`.

## Checks before committing here
1. `blender -b -P forge/smoke_crate.py` prints `FORGE_DONE`, and the previews look right.
2. `node tools/style-check.mjs examples/DESIGN.md out/smoke_crate.glb` passes.
3. `node tools/design-tokens.mjs examples/DESIGN.md out/design.json`, then `node tools/capture-view.mjs godot/smoke` exits 0 with every material on a role in `state.json`, and `node tools/feel-probe.mjs godot/smoke/reality.json godot/smoke` passes.
4. `node tools/new-project.mjs /tmp/forge-check && node tools/web-check.mjs /tmp/forge-check` exits 0.
5. No generated files or projects committed (`out/`, `previews/`, `captures/`, `projects/`, `.godot/`, `build/` are ignored).

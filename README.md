# game-agent-tooling

Generic helpers for building 3D Godot games with AI coding agents. Not tied to any one game.

Games are Godot 4.7 projects in GDScript, on the Compatibility renderer, shipped as a web export that also runs in a phone browser.

## Use it as a game factory
1. Clone this repo, run `npm install`, and put Godot 4.7 (standard build, with the Web export templates) on your PATH as `godot`.
2. Run `claude` (Claude Code) inside it and say what to build. The agent follows the workflow in `AGENTS.md`: it asks its questions, plans, writes a roadmap, builds in sections, and reviews each one.
3. The project is created in `projects/<name>/` by `node tools/new-project.mjs <name>`. That folder is gitignored, and every project is its own git repo.
4. When the agent hits the same obstacle twice, it adds a tool to `tools/` or a gotcha to `AGENTS.md`, so the next build starts smarter.

## Design language (one look for every agent)
Five agents building five models will invent five styles. Here the look lives in one file, and code enforces it.
- `DESIGN.md` per project: Google Labs' [DESIGN.md](https://github.com/google-labs-code/design.md) format for the HUD, plus 3D keys (`materials`, `geometry`, `lighting`, `kit`). `examples/DESIGN.md` is the template.
- The forge reads it: `mat("body")` takes a role name, never a colour. Bevels, shading and the preview light rig come from the file too.
- The game reads it: `godot/addons/forge/house_style.gd` recolours every model (forge or kit) to the roles and sets one light rig.
- `node tools/style-check.mjs DESIGN.md models/*.glb` fails on lint errors, off-palette materials, and models over their triangle or size budget.
- `FORGE_PROBES=1 FORGE_DESIGN=variant.md blender -b -P forge/lineup.py` builds the same probe models in any style, and `godot/preview` shows the variants side by side in the engine, next to a 1.8 m person.

## Asset forge (headless Blender)
- Write a short recipe in `forge/<asset>.py` that uses `forge/lib.py`.
- `lib.py` gives you shared materials, bevel, array, mirror, boolean cut, smooth shading, origin-to-ground, GLB export, and 3 preview renders.

```
blender -b -P forge/smoke_crate.py      # -> out/smoke_crate.glb, previews/smoke_crate_{front,side,top}.png
```

## Test hooks (the agent's eyes and hands)
The `Forge` autoload (`godot/addons/forge/forge.gd`) ships inside the game and does nothing until a tool starts the game with a job. A game registers one object:

```gdscript
func _ready() -> void:
	Forge.register(self)

func render_game_to_text() -> Dictionary: ...        # a snapshot of game state
func set_view(view: String) -> void: ...             # camera to a named preset
func place(pos: Vector3, yaw_deg: float) -> void: ... # put the hero down for a measurement
```

```
node tools/design-tokens.mjs examples/DESIGN.md out/design.json
node tools/capture-view.mjs godot/smoke captures --views default,top --advance 500   # pictures + state.json
node tools/capture-view.mjs godot/smoke captures --views none                        # state only, headless
node tools/feel-probe.mjs godot/smoke/reality.json godot/smoke                       # measures the game against its number sheet
node tools/web-check.mjs projects/<name>                                             # web export, size, starts in a browser
```

- Time is stepped by the engine (`--fixed-fps`), so a run gives the same numbers on every machine.
- Pictures are drawn on a hidden X server (`xvfb-run`) with software OpenGL, so no GPU is needed and no window appears. State-only runs are headless.
- The exit code is 1 if the game logged a script or engine error.

## Skills
`skills/` holds two kinds, and Claude Code loads them from `.claude/skills` in any session here:
- the factory's own lessons (what past builds got wrong);
- eighteen Godot and game-development skills copied unchanged from [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) (Apache-2.0), listed with their source in `skills/THIRD-PARTY.md`.

The table in `AGENTS.md` says which to load for what.

## Licence
Apache-2.0. The copied skills keep their own Apache-2.0 licence and notice (`skills/third-party/`). The test-hook pattern follows OpenAI's develop-web-game skill (trailofbits/skills-curated mirror).

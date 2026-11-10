# game-agent-tooling

Generic helpers for building three.js browser games with AI coding agents. Not tied to any one game.

## Use it as a game factory
1. Clone this repo and run `claude` (Claude Code) inside it.
2. Say what to build. The agent follows the workflow in `AGENTS.md`: it asks its questions, plans, writes a roadmap, builds in sections, and reviews each one.
3. The project is created in `projects/<name>/`. That folder is gitignored, and every project is its own git repo.
4. When the agent hits the same obstacle twice, it adds a tool to `tools/` or a gotcha to `AGENTS.md`, so the next build starts smarter.

## Design language (one look for every agent)
Five agents building five models will invent five styles. Here the look lives in one file, and code enforces it.
- `DESIGN.md` per project: Google Labs' [DESIGN.md](https://github.com/google-labs-code/design.md) format for the HUD, plus 3D keys (`materials`, `geometry`, `lighting`, `kit`). `examples/DESIGN.md` is the template.
- The forge reads it: `mat("body")` takes a role name, never a colour. Bevels, shading and the preview light rig come from the file too.
- The browser reads it: `runtime/house-style.js` recolours every model (forge or kit) to the roles and sets one light rig.
- `node tools/style-check.mjs DESIGN.md models/*.glb` fails on lint errors, off-palette materials, and models over their triangle or size budget.
- `FORGE_PROBES=1 FORGE_DESIGN=variant.md blender -b -P forge/lineup.py` renders the same probe models in any style, next to a 1.8 m person, so style variants can be compared before anything is built.

## Asset forge (headless Blender)
- Write a short recipe in `forge/<asset>.py` that uses `forge/lib.py`.
- `lib.py` gives you shared materials, bevel, array, mirror, boolean cut, smooth shading, origin-to-ground, GLB export, and 3 preview renders.

```
blender -b -P forge/smoke_crate.py      # -> out/smoke_crate.glb, previews/smoke_crate_{front,side,top}.png
```

## capture-view (preset-camera screenshots)
```
npm install
node tools/capture-view.mjs http://127.0.0.1:5179/tools/smoke/ captures --views default,top --advance 500
```

The page under test can expose any of these:
- `window.capture.setView(name)`
- `window.advanceTime(ms)`
- `window.render_game_to_text()`

Output: one PNG per view, plus `state.json` and `console.log`. The exit code is 1 if the page logged an error or a request returned HTTP ≥ 400.
- Browser: `BROWSER_PATH` (default `/usr/bin/brave-browser`).
- Rendering is software WebGL (SwiftShader), so no GPU is needed.

## Licence
Apache-2.0. The test-hook pattern follows OpenAI's develop-web-game skill (trailofbits/skills-curated mirror).

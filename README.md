# game-agent-tooling

Generic helpers for building three.js browser games with AI coding agents. Not tied to any one game.

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

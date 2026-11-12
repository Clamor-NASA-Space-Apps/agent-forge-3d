---
name: frame-budget
description: "Hold 60 fps on weak hardware (phones, integrated laptop GPUs) in a Godot 4.7 Compatibility game shipped as a single-threaded WebGL 2 export, the way 2007-2011 console games did: the frame rate fixed before the art, light paid for once instead of every frame, fewer pixels than the screen, one live shadowed light, hitches hunted before averages. Covers what costs more than it looks in the GLES3 renderer (a second draw per shadowed light, no shader cache on the web, whole-texture uploads, full-density canvases on phones), the cheap tricks that still work there, quality presets as concrete knobs, and a scripted-route profile with per-frame tags. Use when the plan has a gate, a weakest device, a quality setting, or the user says the game stutters, hitches or runs slow."
---

# Frame budget

The look people remember from 2007-2011 shooters came out of a budget, not out of headroom. Infinity Ward
"committed to keeping at 60 frames per second throughout both single- and multiplayer modes" (GameSpot 2007), and
Treyarch said "The one requirement for a Call of Duty game is that it has to run at 60 frames per second on a
console" (GamesBeat 2012). The budget was "the mere 16.66ms of rendering time available per frame", and the aim a
"perceptual 60FPS" (Digital Foundry 2011): not a perfect count, but no frame the player feels.

Rule: **fix the frame time before the art, hunt hitches before averages, and pay for anything that does not move
once, at load or offline.** Load `performance-optimization` for the profiler method and `godot-export` for the web
build with this skill. Where they disagree, this one wins.

## 1. Hitches first
A steady 50 fps feels better than 60 with a 100 ms freeze every few seconds; players feel the freeze, and an
average hides it. Find and remove these before any frame-rate work:
- **Shader compiles on first sight.** Compatibility has no ubershaders, pipeline cache or shader baker: "To avoid
  shader stutters in Compatibility, you need to use the legacy approach of preloading materials, shaders, and
  particles by displaying them for at least one frame in the view frustum when the level is loading" (Godot docs).
  On the web there is no cache at all: `_load_from_cache` and `_save_to_cache` in `shader_gles3.cpp` return at
  `#ifdef WEB_ENABLED`, so every visit compiles everything again. Shadow splits, PCF level, additive omni or spot,
  and lightmaps are compile-time variants (`LIGHT_USE_PSSM2`, `SHADOW_MODE_PCF_13`, ... in
  `rasterizer_scene_gles3.cpp`), so a quality change compiles new ones too. **Warm up:** behind the loading screen,
  draw one of every material variant, every particle emitter (restarted once) and every swapped-in shader (fades,
  damage tints) in front of the camera for a couple of frames, under the active preset. Repeat after a preset
  change, behind a fade.
- **Whole-texture uploads.** `ImageTexture.update()` sends the whole image (`texture_2d_update` →
  `texture_set_data`); there is no partial upload. A paint map (prints, trails, fog of war) updated from the CPU
  costs its full size every frame it changes. Keep it small, update it at most once a frame, stamp with engine
  calls (`Image.blend_rect`, `blit_rect`) instead of per-pixel GDScript, or split it into a `Texture2DArray`
  whose single layer `RenderingServer.texture_2d_update(tex, image, layer)` replaces. A map that follows the
  camera needs **toroidal (wrap-around) addressing**, never a shift-and-copy: "we use wraparound addressing to
  position the clipmap window within the texture image" (GPU Gems 2, ch. 2). Then only the strip that wraps in is
  cleared.
- **Allocation at runtime.** New images, textures, meshes, nodes or big arrays during play: build them at load and
  reuse them (pools; `performance-optimization`).
- **Physics catch-up.** With the default `max_physics_steps_per_frame` of 8, one slow frame queues several physics
  steps for the next, which makes it slow too; "the game will appear to slow down if the rendering FPS is less than
  1 / max_physics_steps_per_frame of physics_ticks_per_second" (ProjectSettings). Cap it low on weak devices, and
  test the feel.
- **Redraws you did not ask for.** A `ReflectionProbe` with `UPDATE_ONCE` redraws "over the following six frames"
  after any property change (class docs): never set its properties every frame.
- **Spread analysis over frames.** Valve built its exposure histogram one bucket per frame: "Amortize the cost of
  building the histogram over 16 frames" (Vlachos 2008). Do the same for any scan (nearest lamps, AI, audio
  occlusion): a slice per frame, never the whole set in one.

## 2. What costs more than it looks in the GLES3 renderer
- **Every shadowed light draws the object again.** The colour pass loops once per shadowed directional light and
  once per omni or spot light that reaches an object, blending each additively (`uses_additive_lighting`, the
  `pass` loop in `rasterizer_scene_gles3.cpp`, 4.7.2); the docs: "Lights with shadows use a multi-pass approach".
  So a shadowed sun runs every lit object's fragment shader twice, plus the shadow-map draws. Escapes, from the
  same source: `unshaded` materials skip it (`!shader->unshaded`); a lightmapped mesh under a sun baked Static
  skips it. A light cull mask does not: the pass is still drawn with its lighting switched off. Call of Duty 4 had
  the same shape: "You may only have one active primary light on a surface" (CoD4 mod-tool docs, community copy).
- **Phones render at full pixel density.** `display/window/dpi/allow_hidpi` is on for the web by default, so a
  phone canvas has the screen's full device pixels. Shading cost follows pixels.
- **No occlusion culling on the web** ("not supported by default in Web export templates"), and "Large open scenes
  [...] generally benefit more from mesh LOD and visibility ranges" (ProjectSettings).
- **No fades on visibility ranges** in Compatibility: `VISIBILITY_RANGE_FADE_SELF` "acts like
  VISIBILITY_RANGE_FADE_DISABLED but with hysteresis disabled". End ranges where an object is a few pixels or
  under fog, so the pop is unseen.
- **Blended things never batch:** "Alpha-blended or depth pre-pass materials are never instanced this way" (Godot
  docs). Prefer opaque or alpha-scissor.

## 3. The 2010 toolbox, in this renderer
| Then | Now |
|---|---|
| Fewer pixels: consoles ran "1024x600 with 2x multi-sample anti-aliasing" (Digital Foundry 2011) | `Viewport.scaling_3d_scale` (bilinear only in Compatibility). Give each preset a **pixel budget**, not a ratio: `scale = min(1, sqrt(budget / window_pixels))`, so a dense phone and a laptop shade a similar count |
| Detail altered on the fly to hold 60 (id Tech 5, Tom's Hardware 2011) | Step the scale between a floor and the budget with hysteresis; each change likely reallocates buffers (inferred), so step rarely |
| Lightmaps, vertex-baked light, light probes (Lazarov 2013) | Bake into vertex colours or textures (AO, sky occlusion, still shadows). LightmapGI renders in Compatibility but bakes only on a RenderingDevice editor, and once per light set |
| Moving things lit from a coarse baked grid, nearest sample, time-averaged (Valve 2006) | Ambient colour per zone, blended over time; a ReflectionProbe that never updates during play |
| Low-res, few live shadows ("very low res", Digital Foundry 2011) | One shadowed sun, the smallest map and range that hold the hero's shadow; cast shadows only from things whose shadow reads; on the weakest preset, no live shadow and baked or blob shadows ("use a different approach such as blob shadows", Godot lightmap docs) |
| AO in a texture channel (Green 2007) | `AO` in the shader, vertex colour or a packed channel |
| Distant scenery lit cheaply | `render_mode unshaded` with a simple sun term from the light rig's uniforms: one pass, no shadow pass |
| Fewer, bigger batches; texture atlases (Wloka 2003, NVIDIA 2004) | Merge still meshes per material and area, MultiMesh for repeats, atlas or channel-pack textures |
| Low-res particle buffers (Digital Foundry 2011) | No such buffer here: cap particle size, count and alpha; proximity fade only on the top preset |
| Minimal post: "We only use 15% of full-frame shutter" for motion blur (Vlachos 2008) | Tonemap, glow, colour adjustments are cheap; every extra full-screen pass is a screen copy |
| Do work per vertex | "Do as much work as you can in the vertex shader, rather than in the fragment shader" (MDN): slow-varying terms (distance fades, large noise) go in `vertex()` |

Count a shader's texture fetches and noise calls per pixel before adding one: Black Ops II was "heavily pixel shader
bound" and argued over single instructions (Lazarov 2013). A ground or sky shader covers most of the screen, and
with a shadowed sun it runs twice.

## 4. Presets are numbers, not adjectives
Each quality preset in DESIGN.md (`quality`) names concrete knobs, set together by one function: pixel budget, MSAA,
shadow splits, map size, range and filter, which classes cast shadows, anisotropic level, shader variant per heavy
material, particle `amount_ratio`, visibility-range ends, lamps lit, reflection atlas size, physics steps per frame.
The weakest device the user named gets the lowest preset by default. Every value carries its source or "our
choice, profile of <date>".

## Lessons from the first profile (12 Nov 2026, a Compatibility web game)
- **Warm only what is used.** `HouseStyle.warm()` draws each material once per variant its instances use (render
  layers a probe reflects or not, instanced or not, casting or not, in a lamp's reach when the design has lamps).
  Drawing every material four times added 6 s to a web load; drawing only the used variants took 2 s of that back.
- **A paint map on the GPU, the CPU still the truth.** Stamp on an `Image` with wrap-around addressing, then copy only
  the changed 64 px tiles into a `SubViewport` (`UPDATE_ONCE`, `CLEAR_MODE_NEVER`) the shader samples with
  `repeat_enable`. Uploads fell from 4 MB per print to a few kB; read the target back once to prove it equals the image.
- **A particle emitter made at runtime can compile on its first emission** although an identical one made at load was
  drawn: warm it by making and running one after load, behind the cover (measured, cause not found).
- **Native caches hide compiles.** After one run, Godot's and Mesa's shader caches make native profiles look clean:
  profile cold (`MESA_SHADER_CACHE_DISABLE=true`, the app's `user://shader_cache` moved away) or in the web build.
- **With vsync, count drops, not long frames.** A 17.5 to 20 ms frame followed by a 15 ms one is the compositor's
  timing, not a miss; a drop is a frame over 1.5 refreshes, or a pair that sums past two.
- **Weigh a sky or quality switch:** each one recompiles most variants (no sun at night, new shadow splits), 3 to 5 s
  on a laptop's web build. Switch behind a cover, and in a game, at a moment a fade belongs (a new sol).

## Checks
1. **Scripted route profile.** A test drives the same route every run (walk, run, drive, every interaction, every
   sky or weather switch, a quality switch) on a real display, vsync off, and logs one row per frame: frame time,
   process and physics time, draw calls, triangles, and tags for what happened on that frame (first sight of a
   material, an emitter restart, a texture upload, a map shift, a probe redraw, physics steps run).
2. **Spikes have causes.** Every frame over the preset's budget, or more than twice the median, appears in the
   report with its tags. A spike with no tag is a missing tag, not noise. The gate fails on any untagged spike and
   on any tagged one the plan did not accept.
3. **Cold web visit.** In a fresh browser profile (no cache), the web build's first run of the route shows no
   compile spike after the loading screen (`web-check`, the browser's performance trace).
4. **Budgets per preset.** The median and the slowest 1% of frame times stay inside each preset's budget on its
   target device, measured on that device in the web build (`serve-web`), not on the development machine.
5. **Fill test.** Run the route in a small window and a full one: a large jump means pixels are the cost and the
   pixel budget is the knob ("compare the frames per second when running with a large window, to running with a
   very small window", Godot GPU optimisation).
6. **Pass count.** Draw calls with the sun's shadow on and off on the same view; the difference is the cost of the
   second pass, and decides whether the weakest preset keeps live shadows.

## Sources
- GameSpot, CoD4 hands-on, 17 Aug 2007: https://www.gamespot.com/articles/call-of-duty-4-modern-warfare-exclusive-single-player-hands-on/1100-6176892/
- Digital Foundry, Face-Off: Modern Warfare 3, 10 Nov 2011: https://www.eurogamer.net/digitalfoundry-face-off-modern-warfare-3
- GamesBeat, Black Ops II graphics, 2012: https://gamesbeat.com/call-of-duty-black-ops-ii-graphics/
- Lazarov, Getting More Physical in Call of Duty: Black Ops II, SIGGRAPH 2013: https://blog.selfshadow.com/publications/s2013-shading-course/lazarov/s2013_pbs_black_ops_2_notes.pdf
- Mitchell, McTaggart, Green, Shading in Valve's Source Engine, SIGGRAPH 2006: https://advances.realtimerendering.com/s2006/Chapter7-Shading_in_Valve's_Source_Engine.pdf
- Green, Efficient Self-Shadowed Radiosity Normal Mapping, SIGGRAPH 2007: https://cdn.cloudflare.steamstatic.com/apps/valve/2007/SIGGRAPH2007_EfficientSelfShadowedRadiosityNormalMapping.pdf
- Vlachos, Post Processing in The Orange Box, GDC 2008: https://cdn.steamstatic.com/apps/valve/2008/GDC2008_PostProcessingInTheOrangeBox.pdf
- Tom's Hardware, Rage performance analysis, Oct 2011: https://www.tomshardware.com/reviews/rage-pc-performance,3057-2.html
- Wloka, Batch, Batch, Batch, GDC 2003: https://www.nvidia.com/docs/IO/8228/BatchBatchBatch.pdf
- NVIDIA, Improve Batching Using Texture Atlases, 2004: https://download.nvidia.com/developer/NVTextureSuite/Atlas_Tools/Texture_Atlas_Whitepaper.pdf
- Asirvatham and Hoppe, GPU Gems 2 ch. 2, 2005: https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry
- Call of Duty 4: Advanced Lighting (community wiki): https://wiki.zeroy.com/index.php/Call_of_Duty_4:_Advanced_Lighting
- MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- Godot 4.7 docs (raw): `tutorials/performance/pipeline_compilations.rst`, `tutorials/rendering/renderers.rst`, `tutorials/3d/visibility_ranges.rst`, `tutorials/3d/global_illumination/using_lightmap_gi.rst`, `tutorials/performance/optimizing_3d_performance.rst`, `tutorials/performance/gpu_optimization.rst`, `classes/class_projectsettings.rst`, `classes/class_reflectionprobe.rst`, `classes/class_geometryinstance3d.rst` at https://raw.githubusercontent.com/godotengine/godot-docs/4.7/
- Godot 4.7.2 source: `drivers/gles3/shader_gles3.cpp`, `drivers/gles3/rasterizer_scene_gles3.cpp`, `drivers/gles3/storage/texture_storage.cpp`, `scene/resources/image_texture.cpp` at https://github.com/godotengine/godot/tree/4.7.2-stable

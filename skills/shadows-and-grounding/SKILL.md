---
name: shadows-and-grounding
description: "Sun shadows that hold still and a hero who stands on the ground in a Godot 4.7 Compatibility game (WebGL 2, phones included): why directional shadows tear and crawl under a low sun, what the Compatibility renderer really does with splits, filtering, blur, blending and bias (read from the 4.7.2 source), per-preset values, and the contact cues that ground a walker on soft ground (contact darkening, sinking, dust on the boots). Use when the plan has a sun with shadows and a hero the camera follows, before the lighting rig or the quality presets are set, and when a playtest says shadows break, tear or swim, or the hero floats."
---

# Shadows and grounding

The playtest words: shadows "getting broken when I walk, like tearing paper with scissors", and a hero who "doesn't feel like it's on the ground". Both come from the shadow map, not the models. Load `godot-3d-essentials` and `godot-shaders` with this skill; `ground-contact-fx` owns the footprint mark and the dust.

Rule: **the hero's whole shadow lives in the sharpest split, every texel size is computed before it is tuned, and the feet touch the ground even when the shadow falls behind the hero.**

## 1. Why a low sun tears
- **Split seam.** With 2 splits the first one ends at `split_1 × max_distance` (default 0.1 × 60 = 6 m). A follow camera stands about 4 m back, so the hero's shadow (length `height / tan(elevation)`, 8.9 m for 1.89 m at 12 degrees) crosses the seam. The far part is drawn with texels ten times bigger, and the cut looks like scissors (measured).
- **Texel size, not map size, is what you see.** Godot fits each split with a sphere around its frustum slice: `r ≈ sqrt((aspect² + 1)·(far·tan(fov/2))² + ((far − near)/2)²)`, texel `2r / S` (renderer_scene_cull.cpp). With 2 splits each split gets an `S × S/2` strip, so the light's up axis has texels of `4r / S`, and that axis lies along the sun on the ground, stretched again by `1 / sin(elevation)`.
- **Crawl.** Still shadows are stable: every renderer snaps each split to its texel grid (shared cull code: "This trick here is what stabilizes the shadow"). A moving caster cannot be snapped, so its edges re-rasterise every frame; the bigger the texel the bigger the hop. A wider aspect (a phone at 20:9) grows `r` too.
- **Bias.** Too little: acne (ripples on flat tops facing a grazing sun). Too much: the shadow leaves the feet (peter-panning). Normal bias is in texels (`normal_bias × 2r/S`), so the same value lifts four times more on a map with four times bigger texels.

Computed (fov 75, 16:9, sun at 12 degrees; texel along the sun on the ground):
| Setup | split 1 | split 2 |
|---|---|---|
| 4096, 2 splits, split_1 0.1, 60 m | 4.6 cm (0 to 6 m) | 46 cm |
| 4096, 2 splits, 15 m near, 60 m | 11.6 cm (0 to 15 m) | 45 cm |
| 2048, 2 splits, 15 m near, 60 m | 23 cm | 91 cm |
| 1024, 1 split, 60 m | 93 cm | |
| 1024, 1 split, 25 m | 39 cm | |

## 2. What Compatibility does (4.7.2 source)
- **`shadow_blur` does nothing.** The directional filter offset is one atlas texel (`shadow_atlas_pixel_size = 1.0 / directional_shadow_get_size()`), and the blur parameter is never read. Softness comes only from the filter quality.
- **Filter quality** is `rendering/lights_and_shadows/directional_shadow/soft_shadow_filter_quality` (default 2), or `RenderingServer.directional_soft_shadow_filter_set_quality()` at run time: 0 to 1 is one hardware 2×2 compare tap, 2 to 3 is 5 taps, 4 to 5 is 13 taps. The 13-tap filter bails out after 5 taps when they all agree, so only edge pixels pay for 13. A change compiles new shader variants: switch it on the settings screen, not mid-play. The `.mobile` override (0, hard) applies to native mobile exports; a phone browser does not report `mobile` (factory gotcha).
- **Blend splits** blends from the camera to the end of split 1 (`smoothstep(0.0, split.x, depth)`), not over a thin band, so it blurs the whole near split. Keep it off; move the seam instead (measured).
- **No PCSS:** `light_angular_distance` only sizes the sun disc and the specular highlight ("PCSS for directional lights is only supported in the Forward+ rendering method").
- **No pancaking clamp:** the shader declares `pancake_shadows` and never reads it. `pancake_size` is how far sunward of a split's sphere a caster may stand and still cast; past it the caster is clipped (inferred). The depth bias is scaled by `2r + pancake_size`, so a big pancake detaches shadows a little more.
- **Fade:** shadows fade from `fade_start × max_distance` to `max_distance` (default 0.8).

## 3. Values
1. **Near split covers the hero's shadow:** `near_m = camera distance + hero height / tan(elevation) + 1 m`, and `split_1 = clamp(near_m / max_distance, 0.1, 0.6)`. Recompute it for every sky state (a sunset sun is lower) and every preset.
2. **Normal bias goes with the preset:** the smallest value at which a flat roof under the lowest sun shows no ripples. With 2 splits the engine sizes the bias by the short texel (`MAX(w, h)` in `get_directional_light_shadow_size`) while the long one lies along the sun, so 2 splits need more. Measured at 12 degrees: 1 split at 1024 clean at 2 (1 rippled); 2 splits at 4096 clean at 4 (3 rippled); 2 splits at 2048 clean at 6 (5 faint), the feet still touching their shadow. Raising `shadow_bias` (0.1 to 0.2) did not remove the ripples; leave it at 0.1.
3. **Per preset** (a third-person view, sun 12 degrees; measured in a scratch scene, frame cost not measured on a phone):
| Preset | splits | map | max distance | near split | filter | normal bias |
|---|---|---|---|---|---|---|
| low | 1 | 1024 | 25 m | n/a | 2 | 2 |
| medium | 2 | 2048 | 60 m | 15 m | 4 | 6 |
| high | 2 | 4096 | 60 m | 15 m | 4 | 4 |
The low row costs what 1 split at 1024 over 60 m costs, but its texels are 2.4 times smaller and the hero's shadow stays whole; over 60 m it smeared, changed shape every frame and lost the legs.
4. Max distance never passes the fog's far end, and nothing past it gets shadows: a far landmark that needs one gets it baked into its texture.

## 4. Grounding the hero
A shadow grounds a walker only when the sun is in front of the camera. Give the feet cues that work from every side (UE's capsule shadows exist for this: "grounds a character to the scene with soft area shadowing, especially in indirectly lit areas").
- **Contact darkening (cheapest):** the ground shader reads a global shader uniform with each foot's position and darkens a soft disc about a foot long under it. Write it to `AO`: in Compatibility `AO` scales only ambient light (`ambient_light *= ao`; `AO_LIGHT_AFFECT` is computed and never applied), which is what a sky blocked by the boot does. If the ambient share is too small to see, darken `ALBEDO` a little in a tighter disc. Zero draw calls, a few instructions per ground pixel. A blob quad (`BLEND_MODE_MUL`, radial texture, raycast to the ground) is the fallback: one draw call. There is no `Decal` in Compatibility.
- **SSAO** works in Compatibility (S4AO): one full-screen pass after the scene, 2, 4 or 12 depth taps by quality (more at high), multiplying the whole picture, sunlit parts included, and it needs a depth copy. High preset only; never the phone preset.
- **Sink:** on soft ground the drawn model sits lower by the sheet's sink depth (a `reality-sheet` row with a source), while the collision body stays on the surface. Foot planting on slopes is `character-life`.
- **Dust on the boots:** tint the lowest part of the hero (object-space height, so it follows the model) toward the ground's colour, up to the grit's peak height `H` from `ground-contact-fx`. Duplicate the role material first (house style rule).
- **The mark** under each step: `ground-contact-fx`.

## Checks
1. **State:** `render_game_to_text()` reports the sun's elevation, splits, map, max distance and `split_1 × max_distance`; a test asserts the near split is at least `camera distance + height / tan(elevation)` for every sky state.
2. **Still:** `capture-view` at the play view with the sun behind the camera, so the shadow runs away from it: no straight cut across the hero's shadow.
3. **Film:** the hero walks 2 s at low sun (`feel-probe --film`) with the camera following. The camera holds the hero still on screen, so its shadow should too: diff a box around the shadow frame to frame; edges that hop or change shape fail. Run it on every preset.
4. **Flat tops:** a still of a flat roof in sunlight at the lowest sun state: no ripples or checker.
5. **Feet:** a ground-level `set_view()` beside the hero, one with the sun ahead and one behind: the feet sit on a dark contact in both, and no lit gap shows between sole and shadow.
6. On the phone, in the web build, low preset: walk 30 s; frame time with shadows on and off.

## Sources
- Godot 4.7 docs: `classes/class_directionallight3d.rst`, `class_light3d.rst`, `class_projectsettings.rst`, `class_environment.rst`, `tutorials/3d/lights_and_shadows.rst`, `tutorials/rendering/renderers.rst` at https://raw.githubusercontent.com/godotengine/godot-docs/4.7/
- Godot 4.7.2-stable source (https://github.com/godotengine/godot/tree/4.7.2-stable): `servers/rendering/renderer_scene_cull.cpp` (`_light_instance_setup_directional_shadow`: sphere fit, texel snapping, bias scale), `drivers/gles3/rasterizer_scene_gles3.cpp` (directional shadow upload, PCF variant choice, split atlas rects), `drivers/gles3/storage/light_storage.cpp` (`get_directional_light_shadow_size`), `drivers/gles3/shaders/scene.glsl` (`sample_shadow`, PSSM blend, fade, AO), `drivers/gles3/shaders/effects/post.glsl` and `s4ao_inc.glsl` (SSAO)
- Epic Games, Capsule Shadows overview (Unreal Engine docs): https://dev.epicgames.com/documentation/en-us/unreal-engine/capsule-shadows-overview-in-unreal-engine
- Measured: a Compatibility scratch scene (plane, 1.89 m capsule hero, posts and crates, sun at 12 degrees, camera 4.2 m back at fov 75), rendered with Godot 4.7.2 on software OpenGL; texel table from the cull code's formula.

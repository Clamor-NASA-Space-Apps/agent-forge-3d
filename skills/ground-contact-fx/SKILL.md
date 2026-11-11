---
name: ground-contact-fx
description: "Make footstep and wheel effects on loose ground (dust, sand, snow, mud) behave like the real ground under the game's gravity and air: grit that flies in short ballistic arcs and is gone when it lands, a thin low haze only where fine dust and air exist, a mark pressed into the surface, all spawned at the real contact frame from the real contact point, in Godot 4.7 Compatibility (GPUParticles3D, no emit_particle, no trails, no decals). Use when the plan has a walker or a vehicle on loose ground, before the world or player lane writes a puff."
---

# Ground contact effects

The fake look has a name: a few big, soft, round puffs hanging at knee height after each step. Nothing real does that.
- In a vacuum, rover dust "followed ballistic trajectories, or paths taken under the force of gravity alone" (LASP). No cloud, no hang.
- With air, grains bigger than about 70 µm hop and fall back. Only dust finer than about 20 µm stays up (Kok 2012), and a cloud of it hugs the ground, stretches downwind and thins within seconds (Lemmon 2022).
- What the eye keeps is the mark, not the cloud.

Rule: **sort the ground's grains by what the air can hold, then let gravity do the rest.** Load `godot-shaders` for the mark and `godot-3d-essentials` for the materials with this skill. Every physical number in the effect is a row on the reality sheet (`skills/reality-sheet`): g, air or vacuum, grain classes, foot or tread speed, launch angle, haze life, mark contrast.

## 1. What the ground throws (ask for each surface)
| Layer | Real thing | Exists when |
|---|---|---|
| **Grit** | grains above ~70 µm (sand, soil crumbs, snow powder, mud clods): "saltation (~70 – 500 μm)"; bigger ones "settle back to the soil after a short hop" (Kok) | always, on loose ground |
| **Haze** | fine dust below ~20 µm, "long-term suspension" (Kok) | only with an atmosphere **and** fine dust on top (a dusty coat, silt). Never in vacuum, never on wet mud or clean sand |
| **Mark** | the print or track | always on loose ground; it outlives everything else |

Each surface type (physics material or a `world.json` tag) carries a preset with these three layers. The preset's colours are fixed per surface type: "generally games just batch the debris types into surface types" (realtimevfx thread). Reading ground pixels at the foot gave a "heavy drop in FPS" in the same thread.

## 2. When and from where
1. **At the contact frame, from the joint.** The effect starts on the foot's keyframe, for example a Call Method track in the walk clip or a method the sim calls when the foot lands. Uncharted 3: "Animations - Specify keyframe and joint". Never use a timer: it drifts off the feet as soon as the speed changes.
2. **One trigger per foot.** Cast a ray down from the foot joint to find the surface type and the hit point, and spawn at the hit point, not at the hips.
3. **Scale the effect with speed.** A slow step throws little or nothing; a run or a skid throws the most ("If the player is walking slow, maybe no particles", realtimevfx).
4. **Velocity comes from the contact.**
   - A boot throws grit forward and sideways at about the toe's speed as it lands or pushes off. Use the foot's own velocity (from the bone, or `inherit_velocity_ratio` when the emitter moves with the foot).
   - A wheel throws grit backward and up from behind the contact patch, at about the tread speed. That is a rooster tail. A fender stops most of it: on Apollo 17, driving without the fender extension "caused massive 'rooster tails'" (NASM). A vehicle model with fenders throws its grit low.

## 3. Grit: small, many, ballistic
- **Size:** a grain the camera can pick out reads as rubble: "Make the sand grains one pixel bigger, and all of the sudden you are playing in a rubble heap" (Journey, Edwards 2012). Grit is a few pixels on screen at play distance, unless the ground really has clods (mud, snow chunks).
- **Count:** many small quads, not a few large ones. Large blended quads are the expensive shape: "This issue may be present for even small amounts of particles if their on-screen size is large" (PowerVR).
- **Motion:** gravity is the sheet's g, launched at 30 to 60 degrees above the ground. Rebound angles are "~30 – 45º", and splashed grains leave at "~40-60 degrees from horizontal" (Kok). No damping: grains of this size are ballistic in thin air and in vacuum. On Earth, air shortens their hops, but at a footstep's speeds the arc is short anyway (inferred).
- **Life:** each grain dies when it lands. Flight time is `T = 2·v·sinθ / g`, peak height `H = (v·sinθ)² / (2g)`, range `R = v²·sin2θ / g`. Set `lifetime` to T for the fastest grain, with a slight random spread, and fade the alpha only over the last tenth so grains do not pop. Ground collision is unnecessary.
- **Look:** an opaque or alpha-scissor quad in the ground's colour, lit like the ground. With no blending there is no sorting and no blended overdraw (inferred). Uncharted 3 chose "Less particles, but more processing for each one" on a weak GPU budget: give the few grains real gravity and spin rather than adding more of them.

## 4. Haze: thin, low, wide, and short-lived
Use the haze only where section 1 says it exists. In a vacuum, leave it out entirely.
- **Shape:** it starts at the ground and spreads sideways. A cloud lifted from the surface expanded "within the bottom ∼5 cm of the atmosphere", "in all directions regardless of wind direction" (Lemmon). The quads are wider than they are tall, sit at ankle height, and never form a round ball at knee height.
- **Motion:** a short sideways burst that stops quickly (quadratic drag, below), then a drift with the wind. Within 2 to 3 s "the clouds elongated downwind with diffuse boundaries" and they "became diffuse within seconds" (Lemmon).
- **What sets the life:** dilution, not falling. Fine dust settles at millimetres per second (Stokes with slip correction, inferred), so `gravity` is about zero and the alpha does the work. It fades from a low peak to nothing over the haze-life row on the sheet.
- **Look:** a low peak alpha, an irregular soft-edged texture (not a radial dot), and as few quads as reads well. Proximity fade hides the line where a quad cuts the ground: sprites otherwise show "unnaturally sharp edges – where they intersect the rest of the scene" (NVIDIA soft particles). See section 6 for its cost.

## 5. The mark
- **Brightness follows the source, not taste.** On ground with a bright dust coat, a print or track is darker: on the Moon, trampled soil reflects 15 to 30% less than undisturbed ground (Clegg 2014). On Mars, rover tracks "appear darker where the rover's wheels disturbed the top layer of dust" (HiRISE PIA16141), and removing dust left the ground 2 to 4% darker (Lemmon). Look up the contrast for each surface, put it on the sheet, and do not exaggerate it.
- **How in Compatibility:** there are no decals ("Decals are only supported in the Forward+ and Mobile renderers"). Draw the feet or wheels into a small trail texture that follows the camera, and let the ground shader darken or dent where the texture is set. Batman: Arkham Origins drew snow prints with an "ankle-high orthogonal frustum" into a texture of at most 512 px, and noted that it "looks better in lower resolutions".
- **How long it lasts:** a mark refills only where something refills it (wind, snowfall), by subtracting a little from the texture each frame ("subtract a small value to the heightmap to make snow gradually replenish", Batman). On still ground it stays.

## 6. Godot 4.7 Compatibility
- **No per-particle emits.** `emit_particle()` "is only supported on the Forward+ and Mobile rendering methods, not Compatibility". So a contact uses a pooled one-shot `GPUParticles3D` (`one_shot`, `explosiveness = 1`) that is moved to the hit point and `restart()`ed. The oldest emitter in the pool is reused. Use `local_coords = false` so grains stay in the world, and hide spent emitters.
- **No trails, and no SDF collision** (renderer feature table). Grit does not need them, because its lifetime ends at landing. `GPUParticlesCollisionHeightField3D` exists if grains must bounce, but it costs a heightmap render.
- **Damping comes in two kinds. Pick the right one:**
  - The default mode subtracts a constant from the speed (`v -= damping * DELTA`). Once the speed reaches 0 the particle stops dead, and with `gravity = 0` it then **hangs in mid-air**. That is the knee-high puff.
  - `PARTICLE_FLAG_DAMPING_AS_FRICTION` is quadratic drag: `v -= v*v*damping*0.05*DELTA` (engine source). A particle falling under gravity g then settles at the terminal speed `v_t`, where `damping = 20·g / v_t²`. Use this mode for the haze. Grit needs no damping at all.
- **Proximity fade** reads the depth texture. In Compatibility, a frame where any material does this copies the whole depth buffer once (`glBlitFramebuffer` in `rasterizer_scene_gles3.cpp`), and the material becomes alpha-blended. Turn it on for the haze only, and on the highest quality preset only.
- **Fill rate:** "Transparent objects are also particularly bad for fill rate" (Godot GPU optimisation). A haze quad close to the camera covers the screen. Cap its size and peak alpha.
- `CPUParticles3D` has the same parameters but no collision. Use it only when GPU particles misbehave on the target device.

## Example (any world: fill the numbers from your own sheet)
A boot on dry, dusty ground under gravity g, with a foot speed row v and a launch angle θ.
- **Grit:** a pool of one-shot emitters. Each one launches small opaque grains in the boot's direction at v (±30%) and θ = 30 to 60°, with gravity g and no damping, and `lifetime = 2·v·sin60°/g`.
- **Haze** (the world has air and fine dust): a second pool of a few wide, flat quads. They burst sideways, are slowed by friction damping, drift at the wind's speed, and fade out over the sheet's haze life.
- **Mark:** the foot's sole is stamped into the trail texture, darker by the sheet's contrast.

Where g is low (0.38 g, for example), the same kick flies about 2.6 times longer and higher than on Earth, and still lands in well under a second.

## Checks
1. **Film of a footstep:** `feel-probe --film` on a walk row and a run row. Grit rises from the foot on the contact frame, peaks near `H` and is gone by `T`. No frame shows a cloud above the shin.
2. **Ground-level capture:** add a `set_view()` preset at ankle height, a body length to the side of a step, and take a `capture-view` 0.1 s and 1 s after contact. The first shows grit arcs low over the ground. The second shows only a faint low haze (or nothing in vacuum) and the mark.
3. **State:** `render_game_to_text()` reports, for each live emitter, its age and the highest particle height (or the analytic `H`). A test asserts the height is at most `H` and that no emitter outlives `T` (grit) or the haze life.
4. **Speed scales it:** a slow walk throws less than a run, and standing still throws nothing.
5. **Cost:** draw calls with ten steps in flight stay inside the budget. One capture with the camera at the foot shows no blended quad filling the screen.

## Sources
- Kok et al. 2012, *The physics of wind-blown sand and dust* (grain classes, angles, hop heights): https://arxiv.org/pdf/1201.4353
- Lemmon et al. 2022, Ingenuity dust lifting (bottom 5 cm, 2 to 3 s, tracks 2 to 4% darker): https://pmc.ncbi.nlm.nih.gov/articles/PMC10078181/
- LASP 2012, Apollo 16 rover dust is ballistic: https://lasp.colorado.edu/2012/05/07/10143/
- Smithsonian NASM 2015, Apollo 17 fender and rooster tails: https://airandspace.si.edu/stories/editorial/duct-tape-auto-repair-moon
- Clegg et al. 2014, Icarus, Apollo blast zones and trampled soil 15 to 30% darker: https://manuscript.isc.ac/Inventory/10/2380165.htm
- HiRISE PIA16141 (2012), tracks darker where wheels disturbed the dust: https://pds-rings.seti.org/press_releases/pages/PIA16xxx/PIA16141.html
- Marshall Robin, Uncharted 3 effects, GDC 2012: https://www.slideshare.net/slideshow/uncharted3-effect-technique/12977466
- John Edwards, Sand rendering in Journey, SIGGRAPH 2012: https://advances.realtimerendering.com/s2012/thatgamecompany/SandRenderingInJourney_thatgamecompany.pptx
- Colin Barré-Brisebois, Deformable snow in Batman: Arkham Origins, GDC 2014: https://www.slideshare.net/colinbb/gdc2014-deformable-snow-rendering-in-batman-arkham-origins
- Lorach 2007, Soft particles (NVIDIA): https://developer.download.nvidia.com/whitepapers/2007/SDK10/SoftParticles_hi.pdf
- PowerVR, optimal particle rendering: https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/optimal-particle-rendering-on-powervr.html
- realtimevfx threads, surface-type debris and colour sampling, and speed scaling: https://realtimevfx.com/t/looking-for-better-solution-to-collect-texture-pixel-color-at-collision-point/21396 and https://realtimevfx.com/t/ue5-footsteps-effect/31830
- Godot 4.7: `class_gpuparticles3d.rst`, `class_particleprocessmaterial.rst`, `tutorials/rendering/renderers.rst`, `tutorials/performance/gpu_optimization.rst` at https://raw.githubusercontent.com/godotengine/godot-docs/4.7/; damping and proximity-fade code in `scene/resources/particle_process_material.cpp` and `scene/resources/material.cpp`, tag 4.7.2-stable

---
name: living-world
description: "Fill a three.js game world with ambient life (traffic, walkers, hostile and friendly NPCs, changing lights) inside a draw-call budget, with a pure-JS sim owning NPC positions. Use when a scene feels empty or soulless, when adding traffic or crowds, or when NPCs push draw calls over budget."
---

# Living world

A street with props and one bus is a diorama. Life means things that move on their own, react to the player, and differ from each other. Do it cheaply.

## Rules
- **The sim owns every NPC position and decision.** It is pure JS, seeded and testable headless: lanes and loops in world data, gaps between vehicles, kinds and states for walkers. The browser only places models where state says and plays clips. The bots then see the same danger the player does.
- **Variety first, then count.** Five car colours from DESIGN.md `paint_*` roles beat twenty grey cars. Walkers come in kinds with different behaviour: most ignore the player, some are friendly, some are hostile, and some chase for a while. Each kind is one small state machine in the sim.
- **Hostile NPCs need a tell and an escape.** A visible wind-up (a kick clip, a horn), a cooldown, and a way out (climbing, out-running a kid who gives up after a few seconds).
- **Hazards reach the player.** Every chaser has a nav path out of its home area (gates are nav nodes), a leash range and a way home.
- **Cheap ambience:** lit windows that switch on and off over the night (one emissive material toggled per window group), flicker on one lamp, steam, a parked bike. These are static-batch friendly.

## NPC people that read as normal people
- **Real proportions.** A head is about 1/7 to 1/8 of an adult's height; kids about 1/5 to 1/6. Chibi or toy kits scaled up to 1.8 m read as giants with huge heads. Check the lineup beside a 1.8 m reference before importing a kit.
- **Walk speeds:** adults 1.2 to 1.5 m/s with a per-walker variation; the old about 0.9 to 1.1; kids up to 1.6. Only someone with a reason runs (a chasing kid, someone fleeing). A street where everyone runs reads as fake.
- **No foot sliding:** set the clip's playback rate to movement speed divided by the speed the clip was authored for, and switch clips by speed band (idle < 0.2 m/s < walk < about 2.5 m/s < run). A procedural gait whose phase advances with distance walked never slides.
- **Feet on the floor they walk on.** A sim usually gives NPCs y 0. Put each one on the floor under it, using a downward ray, eased over curbs. Otherwise every walker on a raised pavement wades in it.
- **NPCs never pass through the hero or each other.** In the rules, each walker looks a little ahead. If the hero is in the way, a calm walker steps around it and a hostile one shoves it aside. In physics, every walker and animal gets a kinematic capsule, so the hero can't walk through them either. Check both: a walker meeting a hero sitting on its path never comes closer than its radius.
- **Life beyond walking:** stops (about 1 in 4 walkers pause 2 to 6 s at a shop window or a phone), heads that turn toward the hero when it is near, and small variations in tempo and arm swing.

## Draw-call budget (keep < 150 total)
| Cost | Fix |
|---|---|
| Joint-node rigs cost one draw call per part per material, doubled by the shadow pass | Skinned meshes (one mesh per material, bones for parts) for crowds; joint rigs only for the hero and a few animals |
| NPC shadows | `castShadow = false` on every NPC; keep the hero's |
| Same car model many times | Share geometry and materials (clone the scene, not the materials); consider `InstancedMesh` per model and role if counts grow |
| Far NPCs | Hide beyond a distance (frustum culling only drops off-screen ones) |
| Weak PCs | Traffic and walker counts per graphics preset |

Measure `renderer.info.render.calls` with every NPC on screen at High (a road view), not with an empty street.

## Asset path
1. A CC0 kit (vehicles, animated characters) painted through `tools/kit-roles.mjs`, which keeps skins and clips. Rename clips on import to a fixed set (`idle`, `walk`, `run`, plus one action).
2. Clone skinned models with `SkeletonUtils.clone`, one `AnimationMixer` each; pick the clip from state and speed and cross-fade.
3. Forge only what no kit has.

## Checks
- A sim test per NPC kind: it does its thing (a car keeps its gap, a kid chases and gives up, a grumpy walker kicks within range with a cooldown).
- A road capture at High with draw calls in `state.json` < 150.
- More than 3 moving things visible from the default camera on the main street.

## Sources
- Matching playback rate to movement speed (Unreal distance matching): https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/AnimationLocomotionLibraryRuntim-/UAnimDistanceMatchingLibrary/SetPlayrateToMat-?lang=en-US
- Fixing foot sliding: https://bugnet.io/blog/how-to-fix-animation-foot-sliding

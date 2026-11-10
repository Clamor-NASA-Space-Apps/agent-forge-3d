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

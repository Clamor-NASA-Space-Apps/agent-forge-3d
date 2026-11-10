---
name: living-world
description: "Fill a Godot 4.7 game world with ambient life (traffic, walkers, hostile and friendly NPCs, changing lights) inside a draw-call budget on the Compatibility renderer, with a pure GDScript sim owning NPC positions and decisions, chasers that obey the same movement rules as the hero, and bots that prove every chase can be escaped. Use when the plan has traffic, crowds, chasers or any NPC, before the rules and world lanes are briefed."
---

# Living world

A street with props and one bus is a diorama. Life means things that move on their own, react to the player, and differ from each other. Do it cheaply. Load `game-ai` (state machines, steering) and `performance-optimization` with this skill.

## Rules
- **The sim owns every NPC position and decision.** `sim/` is pure GDScript (`RefCounted`, a seeded `RandomNumberGenerator`, no nodes), run headless by `tests/run.gd`: lanes and loops from `data/world.json`, gaps between vehicles, kinds and states for walkers. The scene only places nodes where state says and plays clips. The bots then see the same danger the player does.
- **The engine answers "where can it go", the sim decides the rest.**
  - **Traffic:** each route in `data/world.json` becomes a `Curve3D`. The sim keeps each vehicle's metres along it (`get_baked_length()` and `sample_baked()` need no scene), and the scene sets `PathFollow3D.progress`.
  - **Walkers and chasers:** one navigation mesh baked from what collides (`NavigationMesh.geometry_parsed_geometry_type = PARSED_GEOMETRY_STATIC_COLLIDERS`, `agent_radius` and `agent_height` from the sheet), so nobody draws a walk graph that drifts from the world. The solids are children of the `NavigationRegion3D`; bake with no editor (`bake_navigation_mesh(false)`, then `ResourceSaver.save()`) and commit the file. The sim is handed one function for the way round the solids: `NavigationServer3D.map_get_path()`, on the world's map in the game (`get_world_3d().navigation_map`). It needs no node, so tests load the same mesh into a map of their own (below).
  - **Stepping round each other:** a `NavigationAgent3D` with `avoidance_enabled` on each walker, its `radius` and `max_speed` from the sheet. Give it the velocity the sim wants, and hand `velocity_computed` back as the velocity the sim uses for that step. The hero carries a `NavigationObstacle3D` with its `radius` and `velocity`, so walkers step round it too.
- **Variety first, then count.** Five car colours from DESIGN.md `paint_*` roles beat twenty grey cars. Walkers come in kinds with different behaviour: most ignore the player, some are friendly, some are hostile, and some chase for a while. Each kind is one small state machine in the sim.
- **Hostile NPCs need a tell and an escape, and the escape is a row.** A visible wind-up (a kick clip, a horn), a cooldown, and a pair row on the sheet (`skills/reality-sheet`) that says how the hero gets away: faster over a burst, tighter in a turn, or a refuge the chaser cannot enter. "Climb something" is not an escape until the sheet shows the hero reaches it in time.
- **Chasers move by the same rules as the hero:** a top speed, time to reach it, a turn limit at speed, stamina, and solids they go round. A chaser that turns on the spot at full speed cannot be dodged, and one with no stamina cannot be outlasted. Their numbers are sheet rows too. A catch needs the chaser's body at the hero, along a path it can walk: a bite through a parked car or a fence is a bug.
- **Bots move through the hero's ability rows** (speed, burst, the time each jump takes), in steps small enough to see a catch. A bot that teleports along a path proves nothing about a chase. Report caught and escaped per hazard; 0% or 100% of either is a design bug.
- **Hazards reach the player.** Every chaser has a path out of its home area (a gate is a gap in the navigation mesh, or a `NavigationLink3D` where it must jump or open something), a leash range and a way home. `map_get_path()` stops at the nearest point it can reach, so test that the path ends at the target.
- **Cheap ambience:** lit windows that switch on and off over the night (one emissive material per window group, toggling `emission_enabled`), flicker on one lamp (`light_energy`), steam (one particle node: this renderer has no trails or sub-emitters), a parked bike. Real lights are scarce: a mesh takes at most 8 omni and 8 spot lights here, and a light with shadows is blended brighter, so keep one or two shadowed lights.

```gdscript
## A navigation map from the saved mesh, with no scene and no node: what a test hands the sim.
## A new map answers nothing until it has synced: await NavigationServer3D.map_changed until a known path comes back.
static func nav_map(mesh: NavigationMesh) -> RID:
	var map := NavigationServer3D.map_create()
	NavigationServer3D.map_set_cell_size(map, mesh.cell_size)
	NavigationServer3D.map_set_cell_height(map, mesh.cell_height)
	NavigationServer3D.map_set_active(map, true)
	var region := NavigationServer3D.region_create()
	NavigationServer3D.region_set_map(region, map)
	NavigationServer3D.region_set_navigation_mesh(region, mesh)
	return map
```

## NPC people that read as normal people
- **Real proportions.** How many heads tall a person is differs between an adult and a child: take both from a source into the sheet, one row per kind of person. Chibi or toy kits scaled up to adult height read as giants with huge heads. Check a kit beside the reference person in the lineup (`forge/lineup.py`) before importing it.
- **Walk speeds are sheet rows** per kind of person (adult, old, child), with a per-walker variation inside the row's range. Only someone with a reason runs (a chasing kid, someone fleeing). A street where everyone runs reads as fake.
- **No foot sliding:** set `AnimationPlayer.speed_scale` to movement speed divided by the speed the clip was authored for, and switch clips by the sheet's speed bands. A procedural gait whose phase advances with distance walked never slides.
- **Feet on the floor they walk on.** The sim works on the ground plane, and path points float a little above the floor (the mesh is built from cells). Put each NPC on the floor under it with a downward `intersect_ray()` on the ground layer, eased over curbs. Otherwise every walker on a raised pavement wades in it.
- **NPCs never pass through the hero or each other.** In the rules, avoidance (above) keeps them apart: a calm walker steps round the hero, a hostile one shoves it aside. In physics, every walker, animal and vehicle is an `AnimatableBody3D` with a primitive shape on a layer in the hero's mask, placed in `_physics_process()`. One that rides a moving parent (a car under a `PathFollow3D`) needs `sync_to_physics = false`: with the default its shape stays behind and the car drives through the hero. Check both: a walker meeting a hero sitting on its path never comes closer than its radius.
- **Touching is physical.** When the rules say an NPC touches the hero (pets it, feeds it, grabs it), the NPC first goes to it, faces it and poses to its height: a person kneels or squats to a small animal, a hand lands on its back, the animal leans in. The rules hold both still for the contact; either one leaving ends it. Report `touchGap` (the distance from the hand to the body) in `render_game_to_text()` while it lasts. An arm waved in the air a metre away is not a touch.
- **Life beyond walking:** stops (some walkers pause for a few seconds at a shop window or a phone; how many and how long is tuning in `data/tuning.json`), heads that turn toward the hero when it is near (`LookAtModifier3D`), and small variations in tempo and arm swing.

## Draw-call budget (the project's number, set in the plan for its weakest device)
The Compatibility renderer has no automatic instancing: every copy of a mesh is its own draw call, per surface.
| Cost | Fix |
|---|---|
| Many copies of one still thing (lamps, bins, parked cars, windows) | One `MultiMeshInstance3D` per mesh: one draw call for all copies. `use_colors` and `set_instance_color()` tint each copy (the material needs `vertex_color_use_as_albedo`). It is shown or hidden as a whole, so make one per block |
| Rigs built from separate part meshes cost one draw call per part and material | Skinned meshes (one surface per material, bones for parts) for crowds; part rigs only for the hero and a few animals |
| Shadows: a caster is drawn again for every shadow split it falls in | `cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF` on every NPC; keep the hero's |
| The same moving model many times | `instantiate()` one `PackedScene`: copies share meshes and materials. Never duplicate a material per copy |
| Far NPCs | `visibility_range_end` on their meshes hides them past a distance (frustum culling only drops off-screen ones); a `VisibleOnScreenEnabler3D` whose `enable_node_path` is the walker's `AnimationPlayer` stops its animation off screen. The sim and the body keep moving |
| Weak devices | Traffic and walker counts per graphics preset. A phone browser answers `OS.has_feature("web_android")` or `"web_ios"`, not `"mobile"` |

Measure with `node ../../tools/capture-view.mjs . captures --views road`, which prints `render.draw_calls`, with every NPC on screen at the highest preset, not with an empty street. Its draw calls are real; its frame rate is not (software drawing), so frame rate is measured on the device.

## Asset path
1. A CC0 kit (vehicles, animated characters) painted through `tools/kit-roles.mjs`, which keeps skins and clips. Map the kit's clip names to a fixed set (`idle`, `walk`, `run`, plus one action) in one table, and set `Animation.loop_mode` on the cycles (a clip whose name starts or ends with `loop` imports looping).
2. `instantiate()` the model's scene once per NPC: each copy has its own `Skeleton3D` and `AnimationPlayer`. Pick the clip from state and speed and cross-fade with `play(name, custom_blend)`.
3. Forge only what no kit has.

## Checks
- A sim test per pair row: the hero's escape works through the ability model, and standing still does not.
- A path test per chaser: from its home to where the player walks, the path ends at the target.
- While any touch lasts, `touchGap` is under a few centimetres, and one capture shows it.
- A sim test per NPC kind: it does its thing (a car keeps its gap, a kid chases and gives up, a grumpy walker kicks within range with a cooldown).
- A road capture at the highest preset with `render.draw_calls` under the budget.
- More than 3 moving things visible from the default camera on the main street.

## Sources
- MultiMesh, one draw call for many copies: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/tutorials/performance/using_multimesh.rst
- What the Compatibility renderer lacks, and its light limits: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/tutorials/rendering/renderers.rst
- Navigation agents and avoidance: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/tutorials/navigation/navigation_using_navigationagents.rst
- Matching playback rate to movement speed (Unreal distance matching): https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/AnimationLocomotionLibraryRuntim-/UAnimDistanceMatchingLibrary/SetPlayrateToMat-?lang=en-US
- Fixing foot sliding: https://bugnet.io/blog/how-to-fix-animation-foot-sliding

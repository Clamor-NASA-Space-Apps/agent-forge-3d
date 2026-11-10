---
name: world-collision
description: "Make every visible solid in a Godot 4.7 world collide exactly where it is drawn: collision shapes the engine generates from the render meshes, rule volumes and tags kept apart from solids, hollow models with real thickness, and automated sweeps that use the hero's drawn body (walk into every prop, cross every curb, reach every top). Use when the plan has solids to touch: a world of props, buildings, curbs or containers, before the world lane is briefed."
---

# World collision

Hand-placed collision shapes drift from what the player sees. The playtest shows it at once:
- the hero walks through a prop that has no shape;
- a curb drawn a little higher than its shape blocks a step;
- a hollow bin is see-through from inside.

Rule: **what you see is what you hit.** Load `godot-physics` with this skill for bodies, layers and queries.

## Rules
1. **Collision comes from the render meshes, and the engine builds it.** Never type a box beside a mesh. Each of these adds a `StaticBody3D` shaped by the mesh's own triangles (a `ConcavePolygonShape3D`):
   - **In the model:** a name suffix on the part. `-col` keeps the mesh and adds the body, `-convcol` makes a convex hull in its place, `-colonly` and `-convcolonly` turn a simplified proxy mesh into collision alone. Forge recipes name their parts, so the suffix goes in the recipe. `gltf-transform optimize` merges parts and drops their names: pass `--join false --instance false` for a model that carries suffixes.
   - **In the import:** for a kit model whose names you do not control, the Advanced Import Settings physics options. They are stored in the model's `.import` file (`_subresources` > `nodes` > `"PATH:<node>"`: `generate/physics`, `physics/shape_type`, `physics/layer`), so they can be written with no editor. Then `godot --headless --path . --import`.
   - **At load:** the world loader calls `MeshInstance3D.create_trimesh_collision()` on every static mesh that arrives with no body, so no prop can be forgotten.
   - What must not collide (ground decals, puddles, rain, light cones) is left out by a tag the loader reads, never by accident.
2. **Triangle shapes are for things that never move.** A door, a lid, a car or an NPC gets a primitive (`BoxShape3D`, `CapsuleShape3D`) or a convex hull on an `AnimatableBody3D`, sized from the mesh's `get_aabb()`. A part that opens toggles `CollisionShape3D.disabled`. A convex hull fills a hollow thing, so never put one on something the hero enters.
3. **Rules and solids stay apart.**
   - Rule volumes (road, cover, crawl gap, door) are rows in `data/world.json`, which the sim reads with no scene. When the scene must detect one, build an `Area3D` from the same row. An `Area3D` never blocks, and a solid never carries a rule.
   - Tags on a solid are node groups (`climbable`, `walk_through`) or metadata. A custom property exported from Blender (glTF extras) arrives as `get_meta("extras")`.
   - `collision_layer` says what a body is, `collision_mask` what it looks for. One table of layers with one owner, in `CONTRACTS.md`.
4. **Hollow models need thickness.** An open container, a pipe or a booth must have inner faces (solidify in Blender). A single-sided shell fails twice: its back faces are culled, so it is invisible from inside, and a triangle shape collides only along its face normals, so the hero walks out through it. `cull_mode = BaseMaterial3D.CULL_DISABLED` and `ConcavePolygonShape3D.backface_collision` are fallbacks: the wall still has no thickness to look at.
5. **Steps and curbs:**
   - `CharacterBody3D.move_and_slide()` has no step-up: in a test, a curb half as high as the capsule's radius stopped it dead. So every walkable height change is at most the curb height row on the sheet (the controller steps it, `skills/character-body`), or a ramp, or a clear climb or jump.
   - Never leave a gap of a few centimetres between two walkable surfaces: it reads as a glitch.
   - Ground surfaces meet at the same height or with a real step.
6. **Crawl spaces:** the gap under an obstacle is the real gap between its drawn underside and the floor. A chaser that does not fit can't follow: its navigation mesh is baked with its own `agent_height` and `agent_radius` (sheet rows), which leaves a hole there (`skills/living-world`). The bake rounds `agent_height` up to whole `cell_height` steps, so a coarse cell closes a low gap for everyone. The rules must agree (a hidden-under-cover check).
7. **Every rule built on a solid reads its drawn surface.** Jump targets, landing heights, perches and hiding spots come from a downward `intersect_ray()` (or a `ShapeCast3D` the size of the hero's footprint) over the target's area: the highest hit whose normal is inside the controller's `floor_max_angle`. A height typed in data is only a hint. A fence rail, a car roof and a planter's soil all sit at different heights from their bounding boxes. Re-test every target on the real world, not a fixture.
8. **One debug view:** a fixture scene (`tests/colliders.tscn`) that sets `get_tree().debug_collisions_hint = true` in `_enter_tree()` and then instances the world, because the switch does nothing once the shapes are in the tree. `capture-view --scene res://tests/colliders.tscn` draws every shape as a wireframe over the scene. One look finds a prop with no collision, or a collider with no prop.

## Automated checks (run every gate)
The game reports `player.inside` in `render_game_to_text()`: the solids its drawn body overlaps.
```gdscript
## The solids the hero's drawn body is inside. Empty means what you see is what you hit.
## `lift` is the sheet's curb height: it keeps the floor and any curb the hero steps onto out of the answer.
static func drawn_overlaps(hero: CharacterBody3D, model: Node3D, lift: float, solids: int) -> Array:
	var drawn := AABB()
	var to_hero := hero.global_transform.affine_inverse()
	for m: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		var b := to_hero * m.global_transform * m.get_aabb()
		drawn = b if drawn.size == Vector3.ZERO else drawn.merge(b)
	var box := BoxShape3D.new()
	box.size = drawn.size - Vector3(0, lift, 0)
	var q := PhysicsShapeQueryParameters3D.new()
	q.shape = box
	q.transform = hero.global_transform * Transform3D(Basis(), drawn.get_center() + Vector3(0, lift / 2, 0))
	q.collision_mask = solids
	q.exclude = [hero.get_rid()]
	return hero.get_world_3d().direct_space_state.intersect_shape(q).map(func(h: Dictionary) -> String: return str(h.collider.get_path()))
```
For a skinned mesh `get_aabb()` is in the model file's own units (a person came out tens of metres wide): measure the drawn body from its bones, or from the mesh AABB times the skeleton's scale, and print the box once to check it against the sheet's size.

The sweeps are runs for `play()` from `tools/feel-probe.mjs`, all in one engine start, driving the real controller with real input: `{ id, at, yaw, segs: [{ hold: ["move_forward"], ms }], watch: "player.inside" }`.
- **Static sweep (needs no hero, so a world lane can run it before the body exists; about a second):** for every drawn face of every solid item, cast a hero-sized shape at it from outside on the solid layers and fail, with coordinates, on a face nothing stops at. With Jolt, `cast_motion()` answers `[1, 1]` (never stopped) when the shape starts inside a solid: ask `intersect_shape()` first. Prove the sweep by removing one prop's collision and watching it fail.
- **Walk-into-every-prop sweep:** one run per static prefab in `data/world.json`. Put the hero a few body lengths away, walk straight at the prop's centre, and assert `player.inside` stays empty in every sample: that is the hero's **drawn bounds** (nose to tail), not its capsule. A test box the size of the capsule only checks the collider against itself. Skip props tagged `walk_through`, such as a doormat.
- **Curb sweep:** sample N points along every edge between two walkable surfaces. Walk across each edge both ways without jumping and assert the last position is on the other side. Report the points that fail as coordinates.
- **Never under the floor:** no sweep ends below the floor it started on. A triangle shape is a hollow surface: a body pushed past it (by a moving solid, or placed inside one) falls for ever.
- **Moving solids:** the hero stands in the way of each kind of mover and is pushed or stops it, never driven through. An `AnimatableBody3D` that rides a moving parent needs `sync_to_physics = false`, or its shape stays behind.
- **Crawl-gap check:** the hero passes crouched, is blocked standing, and a larger NPC's path (`NavigationServer3D.map_get_path()`) does not end in the gap.
- **Target sweep:** from each free side of every climbable thing within the hero's tiers, a jump target is offered and one press lands on its drawn top with every foot supported.
- **Reach check:** every standable top is reachable from spawn by moves on the sheet, or listed with a reason (`skills/contextual-traversal`).
- **Inside view:** one capture from inside each hollow model (a `set_view()` preset), with no see-through walls, and a walk outward from inside that ends inside.

## Sources
- Name suffixes that make collision on import: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.rst
- Which shape for what, and why triangle shapes only work in static bodies: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/tutorials/physics/collision_shapes_3d.rst
- Collision meshes and why they are simplified (Unreal docs): https://docs.unrealengine.com/4.26/ProductionPipelines/ScriptingAndAutomation/HowTos/SettingUpCollisionProperties
- Collision validation, including the wireframe overlay and drop tests: https://simready.artlabs.ai/resources/best-practices-for-collision-meshes-in-robotics-sim
- For a small static world, triangle shapes made from the render meshes are cheap enough. Swap in `-colonly` proxies or convex hulls only when physics time (`Performance.TIME_PHYSICS_PROCESS`) shows up in the profile.

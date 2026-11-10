---
name: world-collision
description: "Make every visible solid in a three.js world collide exactly where it is drawn: physics colliders built from the render meshes, logic tags kept separate, hollow models with real thickness, and automated traversal sweeps (walk into every prop, step onto every curb). Use when a hero walks through objects, gets stuck on curbs or pavement edges, when objects look see-through from inside, or when adding physics to a world authored as data."
---

# World collision

Hand-authored boxes drift from what the player sees. The playtest shows it at once:
- the hero walks through a prop that has no box;
- a curb drawn 4 cm higher than its box blocks a step;
- a hollow bin is see-through from inside.

Rule: **what you see is what you hit.**

## Rules
1. **Collision comes from the render meshes.** Build static colliders from the world's merged static geometry (Rapier `ColliderDesc.trimesh(vertices, indices)` in world space), not from a parallel list of boxes.
   - Keep the data boxes for **logic only**: tags like road, cover, bin, crawl gap, door.
   - Leave out what must not collide: ground decals, puddles, rain, light cones, animated parts (lids, doors). Moving parts get their own small colliders that toggle with their state.
2. **The scene module exports what to collide** (for example `world.colliders`: an array of world-space geometries with ids). The physics module never re-derives it, so the two can't drift.
3. **Hollow models need thickness.** An open container, a pipe or a booth must have inner faces (solidify in Blender, about 2 to 4 cm). A single-sided shell, seen from inside, is invisible, because back faces are culled. `side: DoubleSide` is only a fallback: it lights the inside wrongly and doubles fragment cost.
4. **Steps and curbs:**
   - Every walkable height change is either a step at most the controller's autostep height (about 0.15 m for a small hero), or a clear climb or jump.
   - Never leave a gap of a few centimetres between two walkable surfaces: it reads as a glitch.
   - Ground surfaces meet at the same height or with a real step.
5. **Crawl spaces:** the gap under an obstacle is the real gap between its drawn underside and the floor. Small enemies and NPCs that do not fit can't follow the hero in there; the rules must agree (a hidden-under-cover check).
6. **Moving collision to the drawn meshes moves every rule built on the old boxes.** Jump targets, landing heights, perches and hiding spots must read the drawn surface: a downward ray over the target's area, taking the highest standable hit. A box top is only a hint. A fence rail, a car roof and a planter's soil all sit at different heights from their boxes. Re-test every target on the real world, not a fixture.
7. **One debug view:** draw the colliders as a wireframe over the scene (`?colliders=1`). One look finds a prop with no collision, or a collider with no prop.

## Automated checks (run every gate)
- **Walk-into-every-prop sweep:** for each static prefab, put the hero 2 m away, walk straight at its centre for 3 s, and assert it stops outside the prop's drawn bounds. Skip props tagged as walk-through, such as a doormat.
- **Curb sweep:** sample N points along every edge between two walkable surfaces. Walk across each edge both ways without jumping and assert the hero reaches the other side. Report the points that fail as coordinates.
- **Crawl-gap check:** the hero passes crouched, is blocked standing, and a larger NPC cannot path into the gap.
- **Target sweep:** from each free side of every climbable thing, a jump target is offered and one press lands on its drawn top.
- **Inside view:** one capture from inside each hollow model. No see-through walls.

## Sources
- Collision meshes and why they are simplified (Unreal docs): https://docs.unrealengine.com/4.26/ProductionPipelines/ScriptingAndAutomation/HowTos/SettingUpCollisionProperties
- Collision validation, including the wireframe overlay and drop tests: https://simready.artlabs.ai/resources/best-practices-for-collision-meshes-in-robotics-sim
- For a small static world (a city block, a few thousand triangles of props), trimesh colliders from the render meshes are cheap enough. Simplify to convex hulls or boxes only if physics time shows up in the profile.

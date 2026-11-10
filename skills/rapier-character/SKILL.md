---
name: rapier-character
description: "Rapier physics for a three.js game hero beside a pure-JS rules sim: a world built from box data, a KinematicCharacterController capsule with crouch and headroom checks, kinematic vehicles driven by the sim, hollow containers with lids, and offline bundling. Use when a user asks for real physics for a character, when adding Rapier to a Vite three.js game, or when a hero clips through things or floats."
---

# Rapier character beside a pure sim

The rules stay in a pure-JS sim (seeded, `node --test`, bots run headless). Rapier lives in one browser module (`physics.js`) that only keeps the hero out of things and gives it weight. The player reports its position; the sim decides what anything costs.

## Setup
- `npm i @dimforge/rapier3d-compat`. The compat build embeds its WASM in the JS, so a Vite build works offline with no extra asset. `await RAPIER.init()` is async: fold it into the player's `ready` promise.
- Call one `world.step()` right after building the static colliders, so the first frame's rays see the world.
- Step it with the game's dt: `world.timestep = dt; world.step()`.

## World from data
- Every box tagged as floor or wall in world data becomes a static cuboid. Add a ground slab and edge walls.
- **A crawl gap** (a box with `clearance`): only the part above `clearance` is a collider. The gap stays open, so a crouched capsule fits and a standing one is blocked.
- **Hollow containers** (bins): four thin walls up to the rim plus an inner floor. The lid is a collider you `setEnabled(!open)`, never enabled while the hero is inside (it would be shut in).
- **Vehicles the sim drives:** kinematic position-based bodies, `setNextKinematicTranslation`/`Rotation` every frame from state. Give the box an underside gap so a crouched hero fits under a car. Offset by the road surface height read from world data (the sim's y is 0).
- Keep the drawn ground at the same heights as the collision boxes. A drawn curb 6 cm above its box reads as sunk feet, and the bug is in the data, not the rig.

## The hero
- `createCharacterController(0.01)` (skin), `setUp(0,1,0)`, `enableAutostep(0.16, 0.05, false)` for curbs, `enableSnapToGround(0.1)`, `setMaxSlopeClimbAngle(50°)`, `setSlideEnabled(true)`.
- Velocity is yours: acceleration, friction, air control, coyote time and a jump buffer (see `skills/character-life`). Feed the per-frame delta to `computeColliderMovement`, read `computedMovement()` and `computedGrounded()`.
- **Crouch:** swap the collider shape (`setShape`). A crouch height under two radii becomes a ball.
- **Standing up:** `intersectionWithShape` with a standing capsule a hair thinner than the real one. If it hits, stay crouched. The thinner probe lets a crouched hero touching a wall still stand.
- **Knock-backs** (a car, a kick, a bite) come from sim events as an added velocity that decays, plus a small hop. Never teleport.
- **Climbs** stay contextual (a climbable face within reach), as a short arc over the edge, not a physics jump.
- Ray-cast down per paw for foot planting, and ray-cast for the third-person camera pull-in.
- Never use a dynamic rigid body for the hero: it tips, slides and fights the controller.

## Draw calls (the hero and animals)
A joint-node rig costs one draw call per part per material, and again in the shadow pass. A 17-part rig in 5 materials costs about 27 calls, plus 27 more in the shadow pass. Folding the rig into one SkinnedMesh per material, with each part's node as a bone, keeps joints turnable by name and costs 5 plus 5.

## Checks (a dev fixture page with one of each obstacle)
- Speed after 0.05 s is lower than after 0.3 s, and stopping takes more than 0 frames.
- Steps onto a 0.12 m curb.
- A 0.30 m gap blocks standing and passes crouched; standing up under it is refused; a 0.2 m gap blocks both.
- Jumps into an open bin, stands on its inner floor, climbs back out.
- A knock moves the hero.
- `feetBelowFloor` ≤ 0.01 in every pose.
- If a shared Vite dev server reloads mid-check because another lane saved a file, re-run.

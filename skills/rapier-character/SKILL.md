---
name: rapier-character
description: "The controller for a three.js game hero with Rapier beside a pure-JS rules sim: speed as a curve (acceleration, braking, speed-dependent turning, stamina) read from the reality sheet, a collider set that covers the whole drawn body, a KinematicCharacterController with crouch and headroom checks, knock-backs, kinematic vehicles and people driven by the sim, and offline bundling. Use when the plan has a body the player controls, before writing the player lane's brief."
---

# Rapier character beside a pure sim

The rules stay in a pure-JS sim (seeded, `node --test`, bots run headless). Rapier lives in one browser module (`physics.js`) that keeps the hero out of things and gives it weight. The player reports its position; the sim decides what anything costs.

## Setup
- `npm i @dimforge/rapier3d-compat`. The compat build embeds its WASM in the JS, so a Vite build works offline with no extra asset. `await RAPIER.init()` is async: fold it into the player's `ready` promise.
- Static colliders come from the drawn meshes (`skills/world-collision`), never from a second list of boxes.
- Call one `world.step()` right after building them, so the first frame's rays see the world. Step with the game's dt: `world.timestep = dt; world.step()`.

## Speed is a curve, and every number is on the sheet
The controller owns velocity. Nothing below carries a number: speeds, times, take-off speed, grip and stamina are rows in `reality.json` (`skills/reality-sheet`), and `npm run feel` measures each one.
- **One speed, many gaits.** Input asks for a pace (walk, the fast key, crouch); the speed eases toward that pace's top speed, and the gait is whatever band the speed is in. Two fixed speeds with a quick ramp read as a toy.
- **Acceleration and braking per pace.** A sprint takes longer to reach than a walk. Braking from speed takes distance (`v² / (2 × grip × g)`), more on a wet or loose surface.
- **Turning depends on speed.** Turn rate is the smaller of the standing turn rate and `grip × g / v`. A reversal at speed brakes first, then turns: a skid, not a pivot.
- **Stamina.** The fastest gait lasts its burst seconds and then drops to the next band until it recovers. The rules own the stamina value (it is a cost); the controller reads it.
- **Input forgiveness** is not physics, so it stays: coyote time and a jump buffer of about a tenth of a second each, a shorter hop on an early release (GMTK Platformer Toolkit).
- **Leaving the ground:** the hop's take-off speed is the sheet's; nothing rises faster than that row allows (`skills/contextual-traversal`).
- **Knock-backs** (a car, a kick) come from sim events as an added velocity that decays, plus a small hop. Never teleport.
- Never use a dynamic rigid body for the hero: it tips, slides and fights the controller.

## The collider covers the whole drawn body
A capsule sized for the legs lets the head, the rump or the shoulders pass into walls, and lets the hero stand on a ledge its feet do not fit on.
- Measure the drawn bounds at load (length, width, height) and derive the collider set from them. Upright and compact (a person): one capsule. Long (a quadruped, a vehicle): the controller capsule at the centre plus a ball at the head and one at the rump, or one horizontal capsule.
- With probes: after every move and every yaw change, cast each ball from the centre to its place; if it stops short, push the body back by the difference (through the controller, so a wall behind still holds). A turn that would swing the head into a wall pushes the body out or is slowed.
- The camera, the jump targets and the perches use the same set.
- Report `overhang` in the text hook: how far the drawn body reaches past its colliders into a static solid (0 when clear).

## The controller
- `createCharacterController(skin)`, `setUp(0,1,0)`, `enableAutostep` for the world's curb height, `enableSnapToGround`, `setMaxSlopeClimbAngle`, `setSlideEnabled(true)`. Feed the per-frame delta to `computeColliderMovement`, read `computedMovement()` and `computedGrounded()`.
- **Crouch:** swap the collider shape (`setShape`). A crouch height under two radii becomes a ball.
- **Standing up:** `intersectionWithShape` with a standing shape a hair thinner than the real one. If it hits, stay crouched. The thinner probe lets a crouched hero touching a wall still stand.
- **Crawl gaps:** the gap under an obstacle is the real gap under its drawn underside.
- **Hollow containers:** thin walls up to the rim plus an inner floor. The lid is a collider toggled with its state, never enabled while the hero is inside.
- **Things the sim moves** (vehicles, people, animals): kinematic position-based bodies set from state every frame. Give a vehicle its underside gap.
- Ray-cast down per foot for planting, and sphere-cast for the camera (`skills/third-person-camera`).

## Checks
- `npm run feel` passes every `speed`, `ramp`, `stop`, `turn`, `burst` and `jump` row.
- **Body sweep:** walk the hero into a wall at eight headings, and turn on the spot beside it: `overhang` stays 0.
- Steps onto the world's curb. A crawl gap blocks standing and passes crouched; standing up under it is refused.
- A knock moves the hero. `feetBelowFloor` ≤ 0.01 in every pose.
- If a shared Vite dev server reloads mid-check because another lane saved a file, re-run.

## Sources
- GMTK Platformer Toolkit, "Behind the code" (coyote time, jump buffer): https://gmtk.itch.io/platformer-toolkit/devlog/395523/behind-the-code
- Rapier character controller: https://rapier.rs/docs/user_guides/javascript/character_controller
- Rockstar on analysing each gait's linear, angular and lateral speed limits: https://gamedeveloper.com/design/rockstar-s-quest-for-the-ultimate-video-game-horse

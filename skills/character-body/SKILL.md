---
name: character-body
description: "The body a player controls in a Godot 4.7 game, beside a pure GDScript rules sim: a CharacterBody3D under Jolt with speed as a curve (acceleration, braking, speed-dependent turning, stamina) read from the reality sheet, collision shapes that cover the whole drawn body, curb stepping, crouch and headroom checks, knock-backs, vehicles and people moved by the sim, and input actions fed by keys and by touch controls alike. Use when the plan has a body the player controls, before writing the player lane's brief."
---

# Character body beside a pure sim

The rules stay in `sim/` (pure GDScript, `RefCounted`, seeded, run headless by `tests/run.gd`, bots included). The body lives in `player/`: a `CharacterBody3D` that keeps the hero out of things and gives it weight. The body reports its position; the sim decides what anything costs. Load `godot-physics` and `input-systems` with this skill.

## Setup
- `project.godot` names `physics/3d/physics_engine="Jolt Physics"`; a hand-written file runs Godot Physics without it. Everything below was checked under Jolt.
- Static colliders come from the drawn meshes (`skills/world-collision`), never from a second list of boxes. The hero, the statics, thin props and sim-moved bodies each have their layer in the one table in `CONTRACTS.md`.
- All movement runs in `_physics_process(delta)` and never reads a clock. The tools step the game one fixed frame at a time, and a body driven by wall time measures differently on every run.
- `RayCast3D` and `ShapeCast3D` nodes refresh once per physics frame. After moving one, or after `place()` moves the hero, call `force_raycast_update()` or `force_shapecast_update()` before reading it.
- **Controls are input actions** (`InputMap`; the names are pinned in `CONTRACTS.md`), read with `Input.get_vector()` and `Input.is_action_just_pressed()`, never raw keys. Touch feeds the same actions: a `VirtualJoystick` (`action_left`, `action_right`, `action_up`, `action_down`; its deflection arrives as action strength) and buttons. In 4.7 a plain `Button` takes each finger itself (two buttons and the stick held at once, proven in a headless test), so `TouchScreenButton` is not needed: on `button_down` and `button_up` send an `InputEventAction` through `Input.parse_input_event()` (`Input.action_press()` sets the state but skips every `_input` listener). A finger's drags keep going to the control it first landed on, so a look area under the buttons needs no bookkeeping. The first finger also arrives as a made-up mouse click (`device == InputEvent.DEVICE_ID_EMULATION`) before the touch: ignore it where a click captures the mouse. Show the controls when `DisplayServer.is_touchscreen_available()`, and from the first touch event. A phone has no Shift key, so every pace and every move needs a touch control. In a web build never bind a key the browser owns (Ctrl+W closes the tab, F5 reloads, Alt+arrows leave the page). The probe presses the same actions, so a passing row was played through the real input map.

## Speed is a curve, and every number is on the sheet
The body owns `velocity`. Nothing below carries a number: speeds, times, take-off speed, grip, stamina and gravity are rows in `data/reality.json` (`skills/reality-sheet`), read at runtime, and the probe measures each one.
- **One speed, many gaits.** Input asks for a pace (walk, the fast action, crouch, or how far the stick is pushed); the speed eases toward that pace's top speed, and the gait is whatever band the speed is in. Two fixed speeds with a quick ramp read as a toy.
- **Acceleration and braking per pace.** A sprint takes longer to reach than a walk. Braking from speed takes distance (`v² / (2 × grip × g)`), more on a wet or loose surface.
- **Turning depends on speed.** Turn rate is the smaller of the standing turn rate and `grip × g / v`. A reversal at speed brakes first, then turns: a skid, not a pivot.
- **Stamina.** The fastest gait lasts its burst seconds and then drops to the next band until it recovers. The rules own the stamina value (it is a cost); the body reads it.
- **Input forgiveness** is not physics, so it stays: coyote time and a jump buffer (values in `data/tuning.json`), a shorter hop on an early release (GMTK Platformer Toolkit).
- **Leaving the ground:** the hop's take-off speed is the sheet's, and so is gravity: use one value for the hop, the falls and the arcs. Nothing rises faster than that row allows (`skills/contextual-traversal`).
- **Knock-backs** (a car, a kick) come from sim events as an added velocity that decays, plus a small hop. Never teleport.
- Never use a `RigidBody3D` for the hero: it tips, slides and fights the controller.

## The collider covers the whole drawn body
A capsule sized for the legs lets the head, the rump or the shoulders pass into walls, and lets the hero stand on a ledge its feet do not fit on.
- Measure the drawn bounds at load (the merged `get_aabb()` of the model's meshes: length, width, height) and derive the shapes from them. Upright and compact (a person): one `CapsuleShape3D`. Long (a quadruped, a vehicle): a `CharacterBody3D` takes several `CollisionShape3D` children and `move_and_slide()` sweeps them all, so add a `SphereShape3D` at the head and one at the rump, or lay one capsule along the body. The rest-pose box lies three ways for a skinned animal: it includes the tail (0.69 m against 0.53 m nose to rump on one cat), clips push the head forward of rest (4.7 cm in a gallop), and the foremost point is off the centre line. So size the shapes from the skinned vertices per bone, let the head shape follow the drawn foremost point, and check against every gait clip.
- **A turn is not swept.** Rotating the body can swing the head shape into a wall, and nothing pushes it back out. Ask first: `test_move(Transform3D(turned_basis, global_position + lift), Vector3.ZERO)` is true when the turned body would touch something; then slow or refuse the turn. `lift` is a hair above the floor: a probe that rests on the floor always reports a hit. Touching counts as a hit, so refuse a turn only when the turned pose collides and the current one does not.
- The camera, the jump targets and the perches use the same shapes.
- Report two measures in `render_game_to_text()`, both taken from the **posed drawn model** when the hook is read: `overhang` (how far it reaches into a static solid, sampled at the head, the rump, along the top of the back and the top of every leg bone, since folded legs stood 3 cm above the spine in a crouch; 0 when clear) and `groundGap` (the distance between its lowest point and the body's feet height). Read the drawn pose through `BoneAttachment3D` nodes: a bone asked directly answers with the pose before foot planting (`skills/character-life`, section 4).
- **A measure never reuses the query it checks.** Foot planting that asks the wrong floor will report perfect feet from that same floor. Example: a floor ray that started inside a low ceiling returned the ceiling, the body was drawn stuck to it, and every foot measure read 0. Start floor rays inside the body's own height, below whatever is overhead.

## The controller
- `CharacterBody3D`: set `velocity`, call `move_and_slide()`, read `is_on_floor()` and `get_real_velocity()` (what the body did after sliding; the animation reads this one). `floor_max_angle` is the sheet's steepest walkable slope, and `floor_snap_length` keeps the body on the ground going down a slope.
- **Curbs:** `CharacterBody3D` has no step-up. Lift the capsule by the world's curb height (a sheet row) and add a `CollisionShape3D` with a `SeparationRayShape3D` that reaches from the capsule down to the feet (the ray runs along the shape node's +Z, so turn the node a quarter turn about X). The body then walks up anything lower than the lift and is stopped by anything higher.
- **Crouch:** a second `CollisionShape3D`, switched with `disabled`. A `CapsuleShape3D` cannot be shorter than two radii (Godot shrinks the radius instead), so a low crouch is a `SphereShape3D` or a capsule laid down.
- **Standing up:** a `ShapeCast3D` holding the standing shape, a hair thinner and a hair clear of the floor, with `target_position = Vector3.ZERO`. After `force_shapecast_update()`, `is_colliding()` means stay crouched. The thinner probe lets a crouched hero touching a wall still stand. Under Jolt a shape that starts half inside a triangle solid sees only back faces and reports nothing (a cat stood up through a slab): if the standing shape would start inside the ceiling, sweep the crouched shape upward from below it instead, and test under the middle of a slab, not its edge.
- **Crawl gaps:** the gap under an obstacle is the real gap under its drawn underside.
- **Hollow containers:** thin walls up to the rim plus an inner floor. The lid is a `CollisionShape3D` switched with its state, never enabled while the hero is inside.
- **Things the sim moves** (vehicles, people, animals): an `AnimatableBody3D` placed from sim state every physics frame. It carries a hero standing on it and shoves one it drives into, but the knock-back itself is still the sim's event. Give a vehicle its underside gap.
- `place(pos, yaw_deg)` puts the hero down for a probe row: set the transform, zero `velocity`, reset anything that eases (pose, camera).

## Checks
- `node ../../tools/feel-probe.mjs data/reality.json .` passes every `speed`, `ramp`, `stop`, `turn`, `burst` and `jump` row.
- **Body sweep:** walk the hero into a wall at eight headings, and turn on the spot beside it: `overhang` stays 0.
- **Every pose in every kind of space:** `overhang` 0 and `groundGap` near 0 standing, crouched and resting, on open floor, at the edge of and under the lowest crawl gap, on the narrowest perch and in a corner. Sheet rows hold them.
- Steps onto the world's curb and is stopped by the next size up. A crawl gap blocks standing and passes crouched; standing up under it is refused.
- A knock moves the hero. The feet measures stay inside their sheet rows in every pose.
- Every action has a touch control: play the web build on a phone with thumbs only.

## Sources
- GMTK Platformer Toolkit, "Behind the code" (coyote time, jump buffer): https://gmtk.itch.io/platformer-toolkit/devlog/395523/behind-the-code
- Godot class reference, `CharacterBody3D` and `SeparationRayShape3D`: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/classes/class_characterbody3d.rst
- Rockstar on analysing each gait's linear, angular and lateral speed limits: https://gamedeveloper.com/design/rockstar-s-quest-for-the-ultimate-video-game-horse

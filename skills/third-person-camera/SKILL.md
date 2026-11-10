---
name: third-person-camera
description: "A third-person follow camera for a Godot 4.7 game that never ends up inside geometry: a SpringArm3D sphere cast against the same colliders as the hero, thin obstacles ignored, tight-space and enclosed-space framing (under cars, inside containers), lifting over a wall before fading the hero, damping and hysteresis, and look input from mouse, stick and touch. Use when the plan has a follow camera, before the player lane is briefed."
---

# Third-person camera

"Cameras are most noticeable when they fail" (John Nesky, GDC 2014, *50 Camera Mistakes*). The usual failures:
- the lens inside a car body or a wall, where back faces are culled so the object looks transparent;
- the hero's tail filling the screen;
- the camera popping in and out.

Load `camera-systems` with this skill. Every distance and time below is a row in `data/tuning.json`, sized against the hero's sheet rows, never a number in code.

## Rules
1. **Collide against what is drawn.** The camera casts against the same physics colliders as the hero, and those come from the render meshes (see `skills/world-collision`). A camera tested only against logic boxes goes straight through every prop that has no box.
2. **Cast a sphere, not a ray.** A `SpringArm3D` on a pivot at the hero, its `shape` a `SphereShape3D` a bit larger than the near plane's half-diagonal (`near × tan(fov / 2) × sqrt(1 + aspect²)` from the `Camera3D`), with the hero left out by `add_excluded_object(hero.get_rid())`. `get_hit_length()` is then the safe distance, the sphere's centre at the hit. A ray lets the near plane clip into a surface, and you see through it.
3. **Pull in fast, ease out slow.** Cut to the safe distance at once when something blocks, hold the shorter distance a moment so thin blockers don't flicker it, then ease back. The arm alone snaps its children both ways, so the `Camera3D` sits beside the arm, not under it, and below it in the tree so it reads this frame's length:

```gdscript
extends Camera3D
# Pivot (yaw and pitch) > SpringArm3D (a SphereShape3D, no children), then this Camera3D.
@onready var arm: SpringArm3D = $"../SpringArm3D"
var wanted: float     # tuning.json, changed by the pitch
var hold_time: float  # tuning.json
var ease_rate: float  # tuning.json
var dist := 0.0
var hold := 0.0

func _physics_process(delta: float) -> void:
	arm.spring_length = wanted
	var safe := arm.get_hit_length()
	if safe < dist:
		dist = safe  # blocked: cut in at once
		hold = hold_time
	elif hold > 0.0:
		hold -= delta
	else:
		dist = lerpf(dist, safe, 1.0 - exp(-ease_rate * delta))
	position = Vector3(0, 0, dist)  # the arm casts along its +Z, the camera looks back down -Z
```
4. **Thin obstacles never move the camera.** Poles, trunks, signs, posts, anything narrower than the hero's body: give them their own collision layer (decide once from the collider bounds when the world is built) and leave that layer out of the arm's `collision_mask`. They draw in front of the hero, the way every third-person game does. Pulling in for a lamp post shoves the lens into the hero's back. Still push the camera out if it ends up inside one.
5. **Whiskers:** a few short `RayCast3D` nodes fanned left and right of the arm detect a wall before it blocks, so the camera swings away early. Player input wins over avoidance when they disagree.
6. **Tight spaces** (under a car, in a pipe, under a bench): when the space over the hero is low (a short upward `ShapeCast3D`), lower the camera height and pitch, and shorten the distance. That frames the hero from behind under the obstacle, so the camera never sits inside it.
7. **Enclosed spaces** (inside a bin, a box, a booth the hero climbed into): an `Area3D` in the container tells the camera the hero is inside; the arm then ignores that shell (`add_excluded_object(shell.get_rid())`, `remove_excluded_object()` on the way out), and the camera stays outside and above its opening, looking in. A camera dragged inside shows a wall of the hero's back and nothing else.
8. **A wall behind the hero lifts the camera before it squeezes it.** When the safe distance falls toward the fade range, raise the pitch and orbit up over the hero, so the shot becomes a look down instead of a look through its head. Fading is the last resort.
9. **Fade the hero only when the camera is really close.** On the hero's own copies of its materials (`duplicate()`; house-style materials are shared by every model with that role), set `distance_fade_mode = BaseMaterial3D.DISTANCE_FADE_PIXEL_DITHER`, `distance_fade_max_distance` (fully drawn from here out) and `distance_fade_min_distance` (gone from here in). That is a dither with no sorting problems and no code per frame, and beyond the far distance the hero is drawn solid with no grain. Hide the model (`visible = false`) below the near distance: never show the inside of the hero's head. In the Compatibility renderer `GeometryInstance3D.transparency` does nothing and `DISTANCE_FADE_OBJECT_DITHER` did not fade. A `ShaderMaterial` (flat shading in the house style) has no such switch: its shader has to discard by distance itself, or the hero only hides.
10. **Derive distance from pitch:** closer when looking up, a little farther when looking down. Keep the hero's size on screen steady.
11. **Damping:** ease the follow target with `1.0 - exp(-rate * delta)`, never a fixed share per frame, which changes with the frame rate. Smooth vertical movement more than horizontal so jumps don't jolt the view. Move the camera after the hero has moved in the same frame.
12. **Store yaw, pitch and distance,** never a world position, and rebuild the camera from them every frame. Clamp the pitch.
13. **Look input has three sources and one result.** Stick and keys through input actions; the mouse through `InputEventMouseMotion.screen_relative` while captured (a browser only allows `Input.mouse_mode = Input.MOUSE_MODE_CAPTURED` from inside an input event, so capture on a click); a thumb through `InputEventScreenDrag.screen_relative` on the side of the screen without the stick. A phone player often has no thumb free to look, so with no look input the camera eases back behind the hero's heading.

14. **A calm frame, a lively hero.** A hero pinned to one spot on the screen at one speed gives the eye nothing, and a player called it "a drone". The fix is never to rattle the frame: camera bob and shake are simulation-sickness triggers (Nesky). Move the hero inside the frame instead:
    - the player's own look is immediate, no lag on yaw or pitch;
    - the pivot follows the hero through a damper with a limit ("an elastic band ... make sure it has a limit"), so at a start the hero pulls ahead and at a stop the camera arrives late;
    - hops are ignored: the pivot's height follows the floor under the hero, not the hero in the air, and moves after a landing on a higher floor;
    - once the run is steady, aim a little ahead along the velocity; drift the yaw behind the velocity (not the stick) only after the player has left the view alone, which matters most on a phone where the look thumb is busy;
    - field of view fixed, or changed slowly and by little.

## Checks
`render_game_to_text()` reports `camInside` (is the lens inside or behind any static solid) and `heroScreen` (the hero's height as a share of the frame, from `unproject_position()` of its top and its feet). `camInside` must not reuse the arm's own cast: use a ray from the hero's head to the lens plus a sphere overlap at the lens. Put a band for `heroScreen` on the sheet and let the probe hold it (`measure: state`).
- `camInside` is false and `heroScreen` is in its band: in the open, under the lowest crawl gap, inside every kind of container, and pressed into a corner with the camera turned toward the wall.
- A capture with the hero under the lowest crawl gap: the frame shows the obstacle's underside, not see-through geometry.
- The hero pressed against a wall with the camera turned toward it: the camera stays outside, and the hero fades when the camera is close.
- The hero just in front of a lamp post with the camera behind it: the camera distance does not change, and the hero is not dithered.
- Walk past a lamp post: the camera does not pop. Report the distance in state and check there are no jumps longer than one frame in and out.
- On a phone in the web build: a drag turns the view, and the view comes back behind the hero when left alone.

## Sources
- John Nesky, *50 Camera Mistakes*, GDC 2014: https://gdcvault.com/play/1020460/50-Camera. Summary: https://matellion.blogspot.com/2016/08/50-common-game-camera-mistakes-and-how.html
- Eric Undersander, accurate collision zoom (cast the near plane, not a ray): https://gamedeveloper.com/programming/accurate-collision-zoom-for-cameras
- Opsive Object Fader (fade the character by camera distance): https://opsive.com/support/documentation/ultimate-character-controller/camera/object-fader/
- Third person and de-occlusion (sphere cast, ease-out, hysteresis): https://www.strayspark.studio/docs/godot-camera-system/third-person-and-deocclusion
- Little Polygon, third-person camera tech breakdown (damping, framing): https://blog.littlepolygon.com/posts/cameras
- Godot class reference, `SpringArm3D`: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/classes/class_springarm3d.rst

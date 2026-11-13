---
name: third-person-camera
description: "A third-person follow camera for a Godot 4.7 game that never ends up inside geometry: a SpringArm3D sphere cast against the same colliders as the hero, thin obstacles ignored, tight-space and enclosed-space framing (under cars, inside containers), lifting over a wall before fading the hero, damping and hysteresis, look input from mouse, stick and touch, and the switch to first person inside small rooms (doorway hysteresis, an eased blend, the body hidden and revealed only once the lens is clear, no bob). Use when the plan has a follow camera, before the player lane is briefed."
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
8. **A wall behind the hero lifts the camera before it squeezes it.** When the safe distance falls toward the fade range, raise the pitch and orbit up over the hero, so the shot becomes a look down instead of a look through its head. Fading is the last resort. Lift only while the player looks level or down: looking up swings the arm down behind the hero into the ground, which is no wall, and a lift then dragged the view back to eye level every frame (a playtest could not watch the night sky). Looking up, let the arm shorten and the hero fade. Give the pitch room to look up at a sky worth seeing (35 degrees showed little above the horizon; 60 did).
9. **Fade the hero only when the camera is really close, and the whole body as one.** Measure the gap from the lens to the hero's drawn body (its box in the hero's space, `p.distance_to(p.clamp(box.position, box.end))`), not the arm's length and not each pixel's own distance: over a backpack or a helmet the lens is much nearer the suit than the arm says, and a per-pixel fade turns only those parts to grain. Opaque from the far gap out, invisible at the near gap, one opacity in between, the way Opsive's Object Fader does it ("Character alpha follows distance directly, from opaque at Start to invisible at End"; its materials "enter the configured transparent mode when fading begins"). A screen-door dither is a translucency trick that needs temporal anti-aliasing to blend its pattern (Unreal: "when combined with Temporal AA this can be used as a form of limited translucency"); the Compatibility renderer has no TAA, so without it the dither showed as a coarse dot pattern over the pack and helmet in a tight room (one playtest). So: the hero's own copies of its role materials (house-style materials are shared by every model with that role) stay opaque while solid; while fading, swap in a second shader built from the same code with `render_mode depth_prepass_alpha` and `ALPHA = opacity`, which draws only the nearest surface (no inside of the suit). Swapping back keeps the solid hero in the opaque pass, where blended particles and shadows sort as before. Hide the model below the near gap: never show the inside of the hero's head. In the Compatibility renderer `GeometryInstance3D.transparency` does nothing and `DISTANCE_FADE_OBJECT_DITHER` did not fade. A hidden hero reports `heroScreen` 0 and passes any ceiling row: give the framing band a floor too, or check that the hero is visible where the row is measured.
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

    How each part goes wrong (a camera built from the list above still read as "a drone"):
    - **The damper is a critically damped spring, not a first-order ease.** `lerp(pos, want, 1 - exp(-rate * dt))` starts moving on the frame the hero does, and at a fast rate trails a walk by a few centimetres: the hero is pinned. A spring with its own velocity gathers speed, trails a steady pace by `2 v / ω`, and settles without overshoot ("critically-damped springs, to avoid acute speed-hitches", ABZU). Size `ω` so that lag at the walk is a visible fraction of the limit; the limit only bites at a hurry.
    - **Auto-yaw reads the real velocity, never the stick, and turns by distance travelled** (a leash: rate × speed). Pushing into a wall then leaves the view alone (Nesky #23), and standing still never turns it. A reversing vehicle keeps its facing.
    - **The lead turns the lens, it does not move the pivot.** Aim at `pivot + velocity × lead_time`, built and dropped slowly. A lead added to the pivot would carry the camera past the hero at every stop and then pull it back.
    - **Leave the camera alone on jumps** (Nesky #45): the pivot's height follows the floor, eased more slowly than across.

## Into first person indoors
A follow camera in a room a few metres across has nowhere to stand: it hits the ceiling and looks straight down, swings through the walls, flips between inside and out, and the hero fills the screen (one playtest, a 5 m habitat). Rules 6 to 9 fix tight spots, not a whole room. Inside, go first person; outside, keep the follow camera. No shipped game was found doing this switch by default; a Skyrim mod does, and "won't change again until you go through the entrance again".
1. **Rooms are data, not physics guesses.** Each enterable building lists its floor plan in its own space (circles and rectangles, measured from the model's floor and walls). Inside is decided from the body's centre against that plan, never from a ceiling ray: a doorway frame is a ceiling too.
2. **A doorway band as wide as the body.** Go in once the whole body is past the door (the plan shrunk by the body's radius), come out once it is wholly outside (the plan grown by it). Standing in the hatch, rocking on the threshold, then never flips the view. The shrunk plan also keeps a body hugging the outside of a round wall from counting as inside, which a box round a drum would not.
3. **Ease, don't cut, and keep the yaw.** Blend the lens from the follow position to the eye over a few tenths of a second (position lerped, rotation slerped, both through one smoothstep), then back the same way. The follow camera's lens sits on the arm's free line from the pivot, so the straight path from it to the eye stays in the space the arm already cleared, inside the doorway. Yaw and pitch are the same numbers in both views, so the world never turns under the player at the switch; only bring the pitch back into the follow camera's range, eased, on the way out. A teleport into a room snaps, as `snap()` does outside. Camera discontinuities and acceleration are what Meta's comfort guide tells you to keep small (https://developers.meta.com/horizon/design/locomotion-comfort-usability/).
4. **The eye is fixed in the body.** Put it where the model's visor or eyes are in the rest pose, measured once at load, and move it only with the body and the player's look: no head bob, no sway, no roll. Head bob and two movements at once are the classic sickness trigger (Game Accessibility Guidelines; Xbox Accessibility Guideline 117 asks for no camera movement the player did not start). Children get motion sick most: susceptibility is highest between 4 and 13 years of age (Henriques et al., J Neurol 2019). No auto-recentre and no glance indoors: in first person every turn is the player's.
5. **One field of view.** Keep the follow camera's vertical FOV in first person: a change at the switch reads as a zoom. Games usually run 75 to 90 degrees vertical (de Vries et al., VIMS 2007); Minecraft, a kids' game, defaults to 70 vertical. Looking up and down gets its own wider pitch range, so a player can see the floor at their feet and the ceiling.
6. **Hide the body, unless the game has a separate first-person body or viewmodel.** A third-person model seen from its own head shows its shoulders and upper arms as big pale triangles crossing the lens whenever it moves (one playtest, after hiding only the head bone the way VRChat does). Half-Life, Halo and Portal show no body or only a viewmodel built for that camera. The cheapest clean way is the close-lens fade (Rules, rule 9) left running: with the lens in the head, the gap to the drawn box is 0 and the body is hidden. Keep its shadow: a playtest missed the suit's shadow on a sunlit floor. Set the hidden meshes to `SHADOW_CASTING_SETTING_SHADOWS_ONLY` instead of `visible = false`, on the solid shader: a fading copy with `depth_prepass_alpha` drops anything under 0.99 opacity from the shadow pass too, so a body hidden by opacity casts nothing.
7. **Reveal the body only once the lens is clear of it.** On the way out of the head the lens passes through the body: drawn there, it shows cut in half by the near plane, then pops whole. Keep it hidden while the lens is within the near sphere of the drawn box (the arm's sphere radius, Rules, rule 2), and from the frame it is clear fade it in over about 0.2 s through the same fade (opacity capped by a timer that restarts whenever the lens is back inside). Going in, the same test hides it before the near plane reaches it.
8. **Movement and reach follow the view.** The move keys and stick act relative to the view, through the same input actions; mouse, stick and touch look exactly as outside. A test bot steers through the view, as a player does: with no recentring a held forward key keeps whatever heading a door frame knocked it to, and the bot jams in a doorway no player would. What can be used is what is near the view's centre within reach (the smallest angle to the view inside a narrow cone), so a player points at the thing. The cone ahead of the body that works outside picks the wrong thing when the view and the body face different ways.
9. **Report it.** State says which room the body is in and how far into first person the lens is (0 to 1); the framing band (`heroScreen`) is not measured in first person.

Checks: walking in through each door switches within the ease time; a slow walk back and forth across the doorway never flips the view; once in first person the lens is inside the room's plan and in no solid; no hero mesh is drawn in first person, looking level or down; on no frame, going in or out, is the hero drawn with the lens inside its drawn box's near sphere, and its fade never jumps by more than a quarter in a frame; walking out returns the follow camera with the hero solid; a capture inside each room.

## Checks
`render_game_to_text()` reports `camInside` (is the lens inside or behind any static solid) and `heroScreen` (the hero's height as a share of the frame, from `unproject_position()` of its top and its feet). `camInside` must not reuse the arm's own cast: use a ray from the hero's head to the lens plus a sphere overlap at the lens. Put a band for `heroScreen` on the sheet and let the probe hold it (`measure: state`).
- `camInside` is false and `heroScreen` is in its band: in the open, under the lowest crawl gap, inside every kind of container, and pressed into a corner with the camera turned toward the wall.
- A capture with the hero under the lowest crawl gap: the frame shows the obstacle's underside, not see-through geometry.
- The hero pressed against a wall with the camera turned toward it: the camera stays outside, and the hero fades when the camera is close.
- The hero just in front of a lamp post with the camera behind it: the camera distance does not change, and the hero is not faded.
- The lens set at the play distance, at a hand's width from the pack, and at the helmet: solid with the opaque shader, every surface at one opacity, hidden. Captures inside the smallest room at three distances show no grain.
- Walk past a lamp post: the camera does not pop. Report the distance in state and check there are no jumps longer than one frame in and out.
- On a phone in the web build: a drag turns the view, and the view comes back behind the hero when left alone.

## Sources
- John Nesky, *50 Camera Mistakes*, GDC 2014: https://gdcvault.com/play/1020460/50-Camera. Summary: https://matellion.blogspot.com/2016/08/50-common-game-camera-mistakes-and-how.html
- Eric Undersander, accurate collision zoom (cast the near plane, not a ray): https://gamedeveloper.com/programming/accurate-collision-zoom-for-cameras
- Opsive Object Fader (fade the whole character by camera distance, transparent mode only while fading): https://opsive.com/support/documentation/ultimate-character-controller/camera/object-fader/
- Unreal `DitherOpacityMask` (dither as translucency needs Temporal AA): https://docs.unrealengine.com/4.26/en-US/API/Runtime/Engine/Materials/UMaterial/DitherOpacityMask/index.html
- Third person and de-occlusion (sphere cast, ease-out, hysteresis): https://www.strayspark.studio/docs/godot-camera-system/third-person-and-deocclusion
- Little Polygon, third-person camera tech breakdown (damping, framing, the yaw leash): https://blog.littlepolygon.com/posts/cameras
- Max Kaufmann, Camera Control in ABZU (critically damped springs, following "predicatively rather than lagging behind"): https://giantsquidstudios.com/Camera-Control-in-ABZU
- Nesky's talk in full (#23 auto-rotation from the real velocity, #40 smoothing with a limit and a lead, #45 jumps): https://habr.com/en/post/272401 and https://habr.com/en/articles/272825
- First person indoors: Xbox Accessibility Guideline 117 (https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117); Game Accessibility Guidelines, controller vs camera movement (https://gameaccessibilityguidelines.com/avoid-or-provide-option-to-disable-any-difference-between-controller-movement-and-camera-movement/); de Vries et al., *Internal and external field of view: computer games and cybersickness*, VIMS 2007 (https://www.ieda.ust.hk/dfaculty/so/pdf/Pages89-95-VIMS2007.pdf); Minecraft FOV (https://minecraft.wiki/w/Options); Henriques et al., motion sickness in children (https://pubmed.ncbi.nlm.nih.gov/31087161/); VRChat head chop (https://creators.vrchat.com/avatars/avatar-components/vrc-headchop/); Skyrim SE auto camera mod (https://www.nexusmods.com/skyrimspecialedition/mods/69500)
- Godot class reference, `SpringArm3D`: https://raw.githubusercontent.com/godotengine/godot-docs/4.7/classes/class_springarm3d.rst

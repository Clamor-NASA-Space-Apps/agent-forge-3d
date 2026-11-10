---
name: character-life
description: "Make a 3D game character (animal or human) move and rest like the real thing in Godot 4.7: a rigged model with authored clips (idle, walk, run, jump at least) blended by an AnimationTree from measured speed, gait bands with real footfall patterns, stride that grows with speed, and procedural layers on top as SkeletonModifier3D nodes (foot planting, look-at, springs for tail and ears, breathing, blinks), plus rest poses, idle variants, mood poses, a gentle death, and the code fallback for a model that has no clips. Use when the plan has a creature on screen (the hero or an NPC), before choosing its model or writing its animation brief."
---

# Character life

A creature animated only from code on a joint rig looked dead in play: every pose was a guess at motion nobody had watched. So the base is always **authored clips**, and code adds only what a clip cannot know: where the floor is, what to look at, how a tail lags behind a turn. A hero that only walks, runs and jumps still reads as a robot, so the layers matter too. Skip any layer whose bone the model lacks. Load `godot-animation` with this skill.

## 1. The model the asset lane must deliver
- **A skinned model with clips** (a `Skeleton3D` and an `AnimationPlayer` after import): `idle`, one clip per gait the sheet names (`walk`, `run`, or `walk`, `trot`, `gallop`), `jump`, and every rest and mood pose that exists (`sit`, `lie`, `eat`, `die`). Take the first that works: a model that ships with its clips, a CC0 clip library retargeted at import (`BoneMap` on `SkeletonProfileHumanoid`, two-legged rigs only), clips keyed in Blender in the forge. Code animation is the last resort (section 7).
- **Count the clips before accepting a model.** "Rigged" and "animation ready" on a store page mean a skeleton, not motion: open the file and list its animations.
- **Each gait clip** loops cleanly in place (the body moves it, the clip does not travel), has `loop_mode` set to `Animation.LOOP_LINEAR` (set it in code when the import left it off, or the walk plays once and freezes), and has a sheet row for the ground speed it was made for: its stride length times its strides per second, measured from the clip.
- **Bones the layers need:** `spine` (front half bends) and `hips` (rear half bends: a gallop needs both), `neck`, `head`, `ear_l` `ear_r`, eyelids (`lid_l` `lid_r`) or a blink blend shape, and the tail as a chain of at least four bones. Anything long and bendy (a tail, a long neck, a trunk) needs a chain: two stiff links read as a stick. Legs in two segments plus a foot (thigh, shin, foot), or no foot can be planted.
- Proportions for its age come from a source (the young of most species carry a bigger head for their body), checked in the lineup beside the person. Feet exactly on y = 0 at the rest pose. Bake the size into the file: `SpringBoneSimulator3D` misbehaves on a scaled skeleton (class docs).

## 2. Gait follows speed, never the key
The body (see `skills/character-body`) produces a speed; the animation reads it. A run key that swaps a clip while the body still moves at a jog, or a "run" that is the walk clip played faster, is the most common tell of a fake animal.
- **Bands come from the sheet** (`skills/reality-sheet`): walk, trot, gallop (or walk, run for two legs), each with its speed range, with hysteresis so a speed on the edge doesn't flicker. Report `gait` in `render_game_to_text()`.
- **Each band has its own footfall pattern.** This is what each clip must show on film, and what the fallback must generate (phase offset of each foot in the stride, 0 to 1):

  | Gait | Order of the feet (phase offset in the stride) | Feet on the ground | Body |
  |---|---|---|---|
  | Quadruped walk | back left 0, front left 0.25, back right 0.5, front right 0.75 | each foot more than half the stride; two or three down at once | level, head bobs a little |
  | Quadruped trot | diagonal pairs together: 0 and 0.5 | each foot under half the stride | level, a small bounce twice a stride |
  | Quadruped rotary gallop | back pair almost together, then the front pair, the lead foot swapping sides between the pairs | each foot well under half; two moments with no foot down | the spine flexes as the back legs reach under and extends as they push off |
  | Biped walk | 0 and 0.5 | each foot more than half; both down at each step | hips sway, arms against legs |
  | Biped run | 0 and 0.5 | each foot under half; a flight phase | forward lean |

  The order is Hildebrand's (walks keep each foot down over half the stride, runs under half). The exact shares and stride lengths come from the sheet's source or a slowed reference video, never from this table.
- **Stride grows with speed, and a planted foot never slides.** Blend the gait clips by the speed the body really has, each clip placed at the speed it was made for:

```gdscript
# The move state: each gait clip sits at the ground speed it was made for (m/s, sheet rows).
func build_gait(gaits: Dictionary) -> AnimationNodeBlendSpace1D:
	var gait := AnimationNodeBlendSpace1D.new()
	gait.min_space = gaits.values().min()
	gait.max_space = gaits.values().max()
	gait.sync_mode = AnimationNodeBlendSpace1D.SYNC_MODE_CYCLIC_MUTABLE  # feet stay in step through a blend
	for clip: StringName in gaits:
		var a := AnimationNodeAnimation.new()
		a.animation = clip
		gait.add_blend_point(a, gaits[clip], -1, clip)
	return gait

func _physics_process(_delta: float) -> void:
	var speed := (body.get_real_velocity() * Vector3(1, 0, 1)).length()
	tree.set(&"parameters/move/blend_position", speed)
```
  Slower than the slowest clip or faster than the fastest, keep the stride and change the cadence: put the blend space in an `AnimationNodeBlendTree` with an `AnimationNodeTimeScale` after it, and set its `scale` to `speed / clampf(speed, slowest, fastest)`. Parameter paths then gain the node names (`parameters/move/gait/blend_position`, `parameters/move/pace/scale`).
- **The body shows the forces:** bank into a turn and pitch with acceleration and braking, at a fraction of the physical angle (formula in `skills/reality-sheet`), eased, on the model node and pivoted at the feet. Breathing speeds up after effort; a spent hero pants and slows.

## 3. The tree
One `AnimationTree` per creature, its root an `AnimationNodeStateMachine`: `idle`, `move` (above), the jump phases (`skills/contextual-traversal`), each rest pose, `die`. The sim or the body decides the state; code only calls `travel()` on `parameters/playback`.
- Every transition has an `xfade_time`: blend toward a pose, never snap. The first state needs a transition from `Start` with `advance_mode` set to `ADVANCE_MODE_AUTO`, or the tree sits in `Start` and nothing plays.
- **A pose is a clip of bones** (hips down and front legs straight for a sit), never a tilt of the whole model: a tilted model sinks one end into the floor and lifts the other off it. Anticipation and landing live in the jump clips: a small crouch before, a squash at the feet after, both subtle.

## 4. Layers on top (children of the `Skeleton3D`, run after the tree, in child order)
1. **Foot planting:** a `TwoBoneIK3D` per leg (`set_root_bone_name`, `set_middle_bone_name`, `set_end_bone_name`, `set_target_node`, `set_pole_node` for the knee). Each target sits where a `RayCast3D` under that foot meets the floor, and the model lowers by the deepest foot. Turn `influence` down while a foot swings or the hero is in the air. A foot with no floor in reach is pulled in under the body, never left hanging: on a rail or a narrow ledge the hero lines up with it and places its feet in line, and at rest it takes a perch clip (feet tucked under).
2. **Springs:** one `SpringBoneSimulator3D` setting per chain (`set_root_bone_name`, `set_end_bone_name`, `set_stiffness`, `set_drag`): the tail curves in a turn, streams out in a run and settles after a stop; ears the same. Springs overshoot and settle; a lerp looks mechanical. Values live in `data/tuning.json`, tuned on film.
3. **Look-at:** a `LookAtModifier3D` on the head (`bone_name`, `target_node`, `duration` to ease between targets): the nearest thing worth noticing, a threat first, then food or a person. Limit it to the neck's real range with `use_angle_limitation`; `primary_limit_angle` is the whole arc in radians, so half of it each side.
4. **Breathing and blinks:** a small script that extends `SkeletonModifier3D` and overrides `_process_modification_with_delta()` (a chest scale, a lid rotation), or a blend shape. Rates are sheet rows for the species, faster when scared or after running. Blinks are uneven: sometimes a double blink, a slow blink when content.
5. **Idle variants:** after a pause from `tuning.json`, travel to one extra clip (sit, lick a paw, look around, ear twitch), never the same one twice in a row.
6. **Where the drawn pose is:** modifiers change the pose only for the draw. `get_bone_global_pose()` returns the pose before them everywhere except inside the `Skeleton3D.skeleton_updated` signal, so a foot measure read anywhere else never sees the planting. Read drawn positions from `BoneAttachment3D` nodes (feet, head, rump), and report `feetBelowFloor` and `feetAboveFloor` (max over feet) from those.

## 5. Moods (the sim decides the mood; the player only shows it)
Fill this table from a source on the species' body language (the sheet's signal question, `skills/reality-sheet`), and keep each posture for its meaning. A mood is a clip or a pose blended over the base, plus changed rates (breath, blinks, cadence, look target). The neutral row is what the player sees most of the time; a signal shown all the time stops being one. Show moods in the HUD too (an icon plus a word), so colour and pose are never the only signal. The rows below are a cat's, as an example.
| Mood | Body | Ears | Tail | Eyes | Other |
|---|---|---|---|---|---|
| calm (neutral) | level | up, small twitches | level with the back or a little below, a soft curve, the tip trailing each step | normal blinks | breathing at rest |
| greeting (petted, fed by someone) | level, leans in | forward | straight up, tip hooked | slow blinks | purr sound; only while the cause lasts |
| hungry | head low | slightly back | low sway | normal | slower cadence, looks toward food |
| scared | low, crouched | flat back | puffed, low | wide, no blinks | fast breathing, quick turns |
| cold | hunched | back | wrapped low | half closed | shiver |
| hurt | one leg favoured (limp) | back | low | normal | slower |
| dying | see below | | | | input ignored |

## 6. Death (all ages)
Gentle and readable, a few seconds: slow down, lie down on the side, curl up, the eyelids close slowly, the breathing slows and stops. Then the camera rises and fades to the sky, and the end screen comes after it. No blood, no ragdoll flop. The rules keep a `dying` phase for those seconds, so the UI and the camera can time themselves from state.

## 7. When the only model has no clips
The forge can still deliver a joint rig (named bones or joint nodes, no clips). Key the clips in Blender first if that is possible at all. If not, code is the base and these rules apply; say so in the plan, and have the user watch a film of every gait before anything is built on it.
- Phase advances with distance divided by the stride length for the current speed (sheet rows), each foot offset as in the table of section 2. In swing the knee bends and the foot lifts; in stance the foot stays planted. Build every pose from joints, ease between poses with springs, and make the tail a chain where each segment follows the one before it with a little lag.
- On a `Skeleton3D`, write it as a `SkeletonModifier3D` placed first, so the layers of section 4 still stack on top. On plain joint nodes, rotate the joint, never its mesh child, and write the layers by hand.

## 8. Checks
- `gait` in state matches the sheet's band at each speed row.
- One film per gait and per rest pose (`feel-probe --film`), looked at: the gallop is not a fast trot, the sit is not a tilted stand, a planted foot stays put on the ground. One capture per mood, plus a close view of the feet.
- `feetBelowFloor` and `feetAboveFloor` stay inside their sheet rows in every gait and pose, on flat ground and on the narrowest perch in the world.
- The user watches it move. Stiffness only shows in motion, so capture a few frames in a row or have the user play.

## Sources
- David Rosen, "An Indie Approach to Procedural Animation", GDC 2014 (Overgrowth: about 13 keyframes plus procedural layers): https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation
- M. Hildebrand, "Symmetrical gaits of horses", Science 150 (1965) and "The quadrupedal gaits of vertebrates", BioScience 39 (1989): gaits as footfall order and time on the ground.
- The making of Stray (a mostly hand-keyframed cat; the bar for animal feel): https://www.unrealengine.com/developer-interviews/28-people-and-two-cats-inside-the-making-of-stray
- Gaits as footfall patterns, and discrete speeds reading as "too functional" (Rockstar's horse, GDC 2021): https://gamedeveloper.com/design/rockstar-s-quest-for-the-ultimate-video-game-horse
- Procedural layers on creatures: The Flame in the Flood, GDC 2017 (a rigid and a procedural spine), https://gamedeveloper.com/art/video-animating-pups-boars-other-quadrupeds-in-i-the-flame-in-the-flood-i- and Rain World, GDC 2016, https://gamedeveloper.com/art/video-animating-i-rain-world-i-and-its-many-squishy-stretchy-creatures
- Godot, "Design of the Skeleton Modifier 3D" (modifiers run after the animation): https://godotengine.org/article/design-of-the-skeleton-modifier-3d/

---
name: character-life
description: "Make a 3D game character (animal or human) move and rest like the real thing with procedural animation on a joint rig in three.js: gait picked from speed with real footfall patterns (walk, trot, gallop, run), stride that grows with speed, poses built from joints, foot planting and perches, springs for tail/ears/head, blinks, breathing, look-at, idle variants, mood poses and a gentle death. Use when the plan has a creature on screen (the hero or an NPC), before writing its rig list or its animation brief."
---

# Character life

A hero that only walks, runs and jumps reads as a robot. Life comes from layers: a few poses blended by state, then small procedural motions on top. Keep every layer cheap and skip any joint the model lacks, so an older model still works.

## 1. The rig the forge must deliver
Ask the asset lane for these joints up front (empty joint nodes with pivots at the joint; see the meshopt gotcha in AGENTS.md):
- `spine` (front half bends), `hips` (rear half bends: a gallop needs both), `neck`, `head`, `ear_l` `ear_r`, `lid_l` `lid_r` (eyelids, a cap that rotates down to close), and the tail as a chain of at least four segments (`tail`, `tail_2`, `tail_3`, `tail_tip`). Anything long and bendy (a tail, a long neck, a trunk, a rope) needs a chain: two stiff links read as a stick. Its rest pose is the animal's neutral carriage, not its most expressive one.
- Legs in two segments: `leg_xx` at the hip or shoulder, `leg_xx_knee` below it. One stiff segment cannot lift a paw or plant a foot.
- Adult proportions unless the story says young: a head about 1/4 of body length (a kitten is nearer 1/2). Check against a 1.8 m person in the lineup.
- Paws exactly on y = 0 at the rest pose.

## 2. Gait follows speed, never the key
The controller (see `skills/rapier-character`) produces a speed; the animation reads it. A run key that swaps a clip while the body still moves at a jog, or a "run" that is the walk cycle played faster, is the most common tell of a fake animal.
- **Bands come from the sheet** (`skills/reality-sheet`): walk, trot, gallop (or walk, run for two legs), each with its speed range. Blend between neighbours over a small overlap, with hysteresis so a speed on the edge doesn't flicker.
- **Each band has its own footfall pattern** (phase offset of each foot in the stride, 0 to 1):

  | Gait | Order of the feet (phase offset in the stride) | Feet on the ground | Body |
  |---|---|---|---|
  | Quadruped walk | back left 0, front left 0.25, back right 0.5, front right 0.75 | each foot more than half the stride; two or three down at once | level, head bobs a little |
  | Quadruped trot | diagonal pairs together: 0 and 0.5 | each foot under half the stride | level, a small bounce twice a stride |
  | Quadruped rotary gallop | back pair almost together, then the front pair, the lead foot swapping sides between the pairs | each foot well under half; two moments with no foot down | the spine flexes as the back legs reach under and extends as they push off |
  | Biped walk | 0 and 0.5 | each foot more than half; both down at each step | hips sway, arms against legs |
  | Biped run | 0 and 0.5 | each foot under half; a flight phase | forward lean |

  The order is Hildebrand's (walks keep each foot down over half the stride, runs under half). The exact shares, stride lengths and the gap inside each gallop pair come from the sheet's source or a slowed reference video, never from this table.
- **Stride length grows with speed.** Phase advances with distance divided by the stride length for the current speed, so feet never skate and a faster gait takes longer strides, not only quicker ones.
- **The body shows the forces:** bank into a turn and pitch with acceleration and braking, at a fraction of the physical angle (formula in `skills/reality-sheet`), through springs. Breathing speeds up after effort; a spent hero pants and slows.
- Report `gait` in the text hook so a check can compare it with the speed band.

## 3. Animation layers (bottom to top)
1. **Pose by state:** idle, crouch, jump (stretched), fall, land, climb, eat, groom, sit. Blend toward the target pose with a spring, never snap. **Build poses from joints** (hips down and front legs straight for a sit), never by tilting the whole body: a tilted rig sinks one end into the floor and lifts the other off it.
2. **Gait** (section 2). In swing, the knee bends and the paw lifts; in stance, the paw stays planted.
3. **Foot planting:** after posing, ray-cast down under each paw and bend the hip and knee so the paw sits on the floor. The body height follows the average. A paw with no floor in reach is pulled in under the body, never left hanging: on a rail or a narrow ledge the hero lines up with it and places its feet in line, and at rest it takes a perch pose (feet tucked under). Report `feetBelowFloor` and `feetAboveFloor` (max over paws) for the checks.
4. **Springs** (stiffness about 100 to 150, tune by eye): the tail as a chain where each segment follows the one before it with a little lag (so it curves in a turn, streams out in a run and settles after a stop), ears, head look-at. Springs give overshoot and settle; lerps look mechanical.
5. **Look-at:** the head turns toward the nearest thing worth noticing (a threat first, then food or a person), limited to about ±70 degrees, through a spring.
6. **Breathing:** a small chest or body scale at about 0.4 Hz at rest, faster when scared or after running.
7. **Blinks:** uneven, not a fixed random interval: 2 to 6 s apart, sometimes a double blink, a slow blink when content.
8. **Idle variants:** after about 5 s still, pick one: sit, lick a paw, look around, ear twitch. Never the same one twice in a row.
9. **Anticipation and landing:** a small crouch before a jump, a squash on landing pivoted at the feet, subtle (5 to 10%).

## 4. Moods (the sim decides the mood; the player only shows it)
Fill this table from a source on the species' body language (the sheet's signal question, `skills/reality-sheet`), and keep each posture for its meaning. The neutral row is what the player sees most of the time; a signal shown all the time stops being one. The rows below are a cat's, as an example.
| Mood | Body | Ears | Tail | Eyes | Other |
|---|---|---|---|---|---|
| calm (neutral) | level | up, small twitches | level with the back or a little below, a soft curve, the tip trailing each step | normal blinks | breathing at rest |
| greeting (petted, fed by someone) | level, leans in | forward | straight up, tip hooked | slow blinks | purr sound; only while the cause lasts |
| hungry | head low | slightly back | low sway | normal | slower cadence, looks toward food |
| scared | low, crouched | flat back | puffed, low | wide, no blinks | fast breathing, quick turns |
| cold | hunched | back | wrapped low | half closed | shiver |
| hurt | one leg favoured (limp) | back | low | normal | slower |
| dying | see below | | | | input ignored |

Show moods in the HUD too (an icon plus a word), so colour and pose are never the only signal.

## 5. Death (all ages)
Gentle and readable, about 4 s: slow down, lie down on the side, curl up, the eyelids close slowly, the breathing slows and stops. Then the camera rises and fades to the sky, and the end screen comes after it. No blood, no ragdoll flop. The rules keep a `dying` phase for those seconds, so the UI and the camera can time themselves from state.

## 6. Checks
- `gait` in state matches the sheet's band at each speed row.
- One film per gait and per rest pose (`feel-probe --film`), looked at: the gallop is not a fast trot, the sit is not a tilted stand.
- `feetBelowFloor` ≤ 0.01 and `feetAboveFloor` ≤ 0.02 in every gait and pose, on flat ground and on the narrowest perch in the world.
- One capture per mood, plus the `paws` view.
- The user watches it move. Stiffness only shows in motion, so capture a few frames in a row or have the user play.

## Sources
- David Rosen, "An Indie Approach to Procedural Animation", GDC 2014 (Overgrowth: about 13 keyframes plus procedural layers): https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation
- M. Hildebrand, "Symmetrical gaits of horses", Science 150 (1965) and "The quadrupedal gaits of vertebrates", BioScience 39 (1989): gaits as footfall order and time on the ground.
- Rain World's procedural creatures, GDC 2016: https://gamedeveloper.com/art/video-animating-i-rain-world-i-and-its-many-squishy-stretchy-creatures
- Gaits as footfall patterns, and discrete speeds reading as "too functional" (Rockstar's horse, GDC 2021): https://gamedeveloper.com/design/rockstar-s-quest-for-the-ultimate-video-game-horse
- Quadrupeds with a rigid and a procedural spine (The Flame in the Flood, GDC 2017): https://gamedeveloper.com/art/video-animating-pups-boars-other-quadrupeds-in-i-the-flame-in-the-flood-i-
- Springs and IK for procedural animation: https://gamejuice.pages.dev/articles/procedural-animation-springs-ik
- The making of Stray (a mostly hand-keyframed cat; the bar for animal feel): https://www.unrealengine.com/developer-interviews/28-people-and-two-cats-inside-the-making-of-stray

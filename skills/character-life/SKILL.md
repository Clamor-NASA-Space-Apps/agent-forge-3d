---
name: character-life
description: "Make a 3D game hero (animal or human) feel alive with procedural animation on a joint rig in three.js: controller feel numbers, gait with knees and foot planting, springs for tail/ears/head, uneven blinks, breathing, look-at, idle variants, mood poses and a gentle death. Use when building or reviewing a player character, an animal NPC, or when a user says the character feels stiff, basic, robotic or lifeless."
---

# Character life

A hero that only walks, runs and jumps reads as a robot. Life comes from layers: a few poses blended by state, then small procedural motions on top. Keep every layer cheap and skip any joint the model lacks, so an older model still works.

## 1. The rig the forge must deliver
Ask the asset lane for these joints up front (empty joint nodes with pivots at the joint; see the meshopt gotcha in AGENTS.md):
- `spine` (front half bends), `head`, `ear_l` `ear_r`, `lid_l` `lid_r` (eyelids, a cap that rotates down to close), `tail` + `tail_tip`.
- Legs in two segments: `leg_xx` at the hip or shoulder, `leg_xx_knee` below it. One stiff segment cannot lift a paw or plant a foot.
- Adult proportions unless the story says young: a head about 1/4 of body length (a kitten is nearer 1/2). Check against a 1.8 m person in the lineup.
- Paws exactly on y = 0 at the rest pose.

## 2. Controller feel (numbers to start from, then tune)
| Knob | Start | Why |
|---|---|---|
| Acceleration time to full speed | 0.25 s | Instant start reads as weightless |
| Deceleration time | 0.12 s | Stops feel firm but not frozen |
| Air control | 0.5 of ground | Jumps commit you |
| Turn rate | about 10 rad/s, with body bank into the turn | Pivoting on the spot reads as a turret |
| Coyote time | 0.1 to 0.15 s | Jumps off a ledge edge still count |
| Jump buffer | 0.1 to 0.15 s | A press just before landing still jumps |
| Variable jump | release early: vy times 0.5 | Small hops and big leaps from one key |
| Crouch | a short capsule; standing up is refused under low headroom | Low gaps become routes |

Use a physics engine's kinematic character controller (Rapier `KinematicCharacterController`) or your own swept boxes; never a dynamic rigid body for the hero (it tips over and slides). Knock-backs are an added velocity that decays, not a teleport.

## 3. Animation layers (bottom to top)
1. **Pose by state:** idle, walk, run, crouch, jump (stretched), fall, land, climb, eat, groom, sit. Blend toward the target pose with a spring, never snap.
2. **Gait:** phase advances with distance (no foot skate). In swing, the knee bends and the paw lifts; in stance, the paw stays planted. A run adds body pitch (gallop feel).
3. **Foot planting:** after posing, ray-cast down under each paw and bend the hip and knee so the paw sits on the floor. The body height follows the average. Report `feetBelowFloor` (max over paws) for the checks.
4. **Springs** (stiffness about 100 to 150, tune by eye): tail as a two-link chain, ears, head look-at. Springs give overshoot and settle; lerps look mechanical.
5. **Look-at:** the head turns toward the nearest thing worth noticing (a threat first, then food or a person), limited to about ±70 degrees, through a spring.
6. **Breathing:** a small chest or body scale at about 0.4 Hz at rest, faster when scared or after running.
7. **Blinks:** uneven, not a fixed random interval: 2 to 6 s apart, sometimes a double blink, a slow blink when content.
8. **Idle variants:** after about 5 s still, pick one: sit, lick a paw, look around, ear twitch. Never the same one twice in a row.
9. **Anticipation and landing:** a small crouch before a jump, a squash on landing pivoted at the feet, subtle (5 to 10%).

## 4. Moods (the sim decides the mood; the player only shows it)
| Mood | Body | Ears | Tail | Eyes | Other |
|---|---|---|---|---|---|
| calm | level | up, small twitches | slow sway | normal blinks | breathing at rest |
| happy | level, slight bounce | forward | up, tip hooked | slow blinks | purr sound |
| hungry | head low | slightly back | low sway | normal | slower cadence, looks toward food |
| scared | low, crouched | flat back | puffed, low | wide, no blinks | fast breathing, quick turns |
| cold | hunched | back | wrapped low | half closed | shiver |
| hurt | one leg favoured (limp) | back | low | normal | slower |
| dying | see below | | | | input ignored |

Show moods in the HUD too (an icon plus a word), so colour and pose are never the only signal.

## 5. Death (all ages)
Gentle and readable, about 4 s: slow down, lie down on the side, curl up, the eyelids close slowly, the breathing slows and stops. Then the camera rises and fades to the sky, and the end screen comes after it. No blood, no ragdoll flop. The rules keep a `dying` phase for those seconds, so the UI and the camera can time themselves from state.

## 6. Checks
- Speed after 0.05 s is lower than after 0.3 s; stopping takes more than 0 frames.
- `feetBelowFloor` ≤ 0.01 in walk, run, crouch, eat and groom.
- One capture per mood, plus the `paws` view.
- The user watches it move. Stiffness only shows in motion, so capture a few frames in a row or have the user play.

## Sources
- David Rosen, "An Indie Approach to Procedural Animation", GDC 2014 (Overgrowth: about 13 keyframes plus procedural layers): https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation
- Rain World's procedural creatures, GDC 2016: https://gamedeveloper.com/art/video-animating-i-rain-world-i-and-its-many-squishy-stretchy-creatures
- GMTK Platformer Toolkit, "Behind the code" (coyote time, jump buffer, acceleration): https://gmtk.itch.io/platformer-toolkit/devlog/395523/behind-the-code
- Springs and IK for procedural animation: https://gamejuice.pages.dev/articles/procedural-animation-springs-ik
- The making of Stray (a mostly hand-keyframed cat; the bar for animal feel): https://www.unrealengine.com/developer-interviews/28-people-and-two-cats-inside-the-making-of-stray

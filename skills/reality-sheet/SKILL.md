---
name: reality-sheet
description: "Write a game's sheet of anchored numbers (reality.json) before planning: every speed, jump, size, reach and chase a player can feel gets a real-world range, a source and the value the game uses, checked by tools/feel-probe.mjs at plan time and measured against the running game at every gate. Use when the plan has any moving actor, a chase, a jump or a climb, a vehicle, or any number that describes the physical world, and before writing lane briefs or tuning values."
---

# Reality sheet

A number nobody anchored is a guess, and a guess reads as fake in the first minute of play. A hero that jumps three times too high, a chaser nobody can outrun, a walk that is really a jog: none of these fail a test, because the test was written from the same guess. So anchor first, build second.

**Anchored and declared, not "realistic at any cost".** The sheet records what is real and what the game uses. A game may leave the real range on purpose (a small map, a child audience, low gravity), but it says so in `why`, and the user approves it.

## The file: `src/data/reality.json`
```json
{
  "gravity": 9.8,
  "probe": { "pos": "player.pos", "page": "src/player/dev.html", "tol": 0.1 },
  "rows": [
    { "id": "hero.leg", "real": [0.2, 0.3], "value": 0.25, "unit": "m", "source": "<url>" },
    { "id": "hero.speed.walk", "real": [0.4, 1.0], "value": 0.9, "unit": "m/s", "source": "<url>",
      "measure": "speed", "at": [0, 0, 0], "hold": ["KeyW"], "ms": 3000 },
    { "id": "hero.jump.apex", "real": [0.6, 0.9], "value": 0.86, "unit": "m", "source": "<url>",
      "measure": "jump", "limit": "max", "at": [0, 0, 0], "hold": ["Space"] }
  ],
  "pairs": [
    { "id": "guard>hero", "chaser": "guard.speed.run", "prey": "hero.speed.run", "escape": "refuge", "refuge": 8, "lead": 3, "burst": "hero.burst" }
  ]
}
```
- `real` is the real-world range, `value` what the game uses, `source` a URL (or `estimate: <reasoning>`, which the probe flags). A `value` outside `real` needs a `why`.
- Row ids read `<actor>.<thing>.<variant>`. The controller, the rules, the bots and the probe all read this file. **No physical number lives anywhere else,** and no skill or brief may supply one.
- Fields from `measure` on tell the probe how to play the row; see the header of `tools/feel-probe.mjs`.

## Four questions that fill it (ask them for every game)
1. **Every actor** (hero, chasers, vehicles, crowds). What is it in the real world: species or model, age, mass? Then:
   - size: height, length, width, leg length, the smallest gap it fits through;
   - speed for each way it moves (walk, trot, run, sprint; crawl, climb, swim), time to reach it, stopping distance;
   - turning: how tight at each speed;
   - endurance: how long the fastest gait lasts, how long recovery takes;
   - leaving the ground: take-off speed, reach, what it can climb and what it cannot, how it comes down, what a fall costs;
   - senses and reaction time, if the rules use them.
2. **Every pair that meets** (each chaser or hazard against the hero). Who is faster, over what distance? How does the slower one get away: outrun, out-turn, a refuge the other cannot enter (height, a gap, a door)? Write a pair row. A pair with no escape is a design bug, and so is a hazard that can never catch anyone.
   - **When two actors touch** (petting, feeding, handing over, biting, carrying): which part of each body meets, and at what height? A standing adult's hand hangs about 0.75 m up; a small animal's back is far below it. If the heights differ, one of them bends, kneels, jumps or is lifted, and the sheet says which. Add rows for the reach of each, so the rules bring them close enough and the poses can meet.
3. **Every space.** Where can each actor really go: roofs, ledges, under things, inside things? Each kind of place the hero should reach gets a route made of moves on the sheet, and each place a chaser must not reach has a reason it cannot.
4. **Every signal.** How does the player learn of each danger: what shows on screen, what sounds, how many seconds ahead? (Narration is off unless the user asked for a voice.)
   - **Body language is a signal too.** For each creature, find a source on what its postures mean (tail, ears, back, gaze) and list them: the neutral posture, and the few that carry a message. A posture that means something in the real animal is used only when that is true. Example: a cat carries its tail level or low when it walks; straight up is a friendly greeting, so it appears when the cat is petted or fed by someone, not all night.

## Formulas that fit any body
Use them to fill gaps and to sanity-check a source. `g` is gravity, so they carry to the Moon or Mars.
| Question | Formula | Source |
|---|---|---|
| When does a walk become a run or a trot? | Froude number `v² / (g × leg length)` between 0.4 and 0.6 | Hoyt and Taylor 1981; Alexander and Jayes 1983 |
| When does a trot become a gallop? | ⚠️ no primary source saved for the usual "2 to 3": measured speeds give 2.1 to 2.7 for a cat and 1.8 for a mouse. Use the animal's own data when it exists | the project's `research/` |
| How high does a jump rise? | `take-off speed² / 2g`, measured at the body's centre; a ledge it can catch adds its reach | mechanics |
| How long is a jump in the air? | `2 × take-off speed × sin(angle) / g` | mechanics |
| How far to stop? | `v² / (2 × grip × g)`; grip about 0.7 dry, 0.4 wet for feet and tyres | mechanics; ⚠️ grip values |
| How tight a turn? | radius `v² / (grip × g)` | mechanics |
| How far does it lean in a turn? | `atan(v² / (radius × g))`, shown at 0.3 to 0.7 of that | Vulkan tutorial, physics-driven lean |
| How hard is a landing? | impact speed `sqrt(2 × g × drop)` | mechanics |

## Research method
1. Find a primary source (a paper, an agency page, a maker's data sheet) before a popular one. Save it in the project's `research/pages/`.
2. Confirm the quote in the saved file. Use the source's wording.
3. Mark the row's source honestly: a URL when the number was seen there, `estimate:` when it is your arithmetic or a popular figure.
4. When sources disagree, the range in `real` holds both, and `value` picks a side.
5. Expect popular figures to fail the check, and write down what you could not confirm. Example: a cat's "48 km/h" turned out to be one breed's figure flagged unreliable, and a speed range quoted everywhere for a paper was not in the paper. Those rows became `estimate:` with the reason, not a URL.

## The probe
- **Plan time:** `node ../../tools/feel-probe.mjs src/data/reality.json` fails on a row with no source, a value outside `real` with no `why`, a walk that is really a run for its leg length, and a pair with no escape. It must pass before the plan is approved.
- **Build:** the same command with the dev URL (`npm run feel`) plays every row that has a `measure` with real key presses and compares what the hero did. Speed is taken from position, never from a reported speed. `--film <id>` tiles eight frames of a run into one image; look at one for every gait and every jump.
- **Checks first:** wire the fixture page, the hooks (`advanceTime`, `render_game_to_text`, `capture.place`) and `npm run feel` before any lane starts. It should fail on every measured row and error on none. A lane is done when its rows pass.
- **Bots** move through the same rows: a bot that covers ground faster than the hero's speed row, or jumps in less time than the jump takes, proves nothing.

## What the sheet cannot see
Feel that is not a number: whether the gallop looks like a gallop, whether a pose looks natural. That is what the films and the user's five minutes of play are for (`skills/game-feel-gate`).

## Sources
- The Froude number and gait changes: Hoyt and Taylor 1981 and Alexander and Jayes 1983, as summarised in https://europepmc.org/article/PMC/PMC11428545 (the originals are closed).
- Physics-driven lean from acceleration: https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Procedural_Animation_IK/06_physics_driven_lean.html
- Rockstar on discrete speeds and stiff turning reading as "too functional": https://gamedeveloper.com/design/rockstar-s-quest-for-the-ultimate-video-game-horse

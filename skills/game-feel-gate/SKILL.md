---
name: game-feel-gate
description: "Playtest checklist for a 3D browser game section gate: the problems that unit tests, bots and screenshots all passed but a human player saw in one minute. Use at every section gate of a game build, before telling the user a playable build is done, and when writing roadmap checks for meters, hazards, NPCs, interactions or warnings."
---

# Game feel gate

Tests, bots and preset screenshots can all pass while the game feels dead. These are the checks a player runs in the first minute. Each one has a cheap automated form; add it to the section's checks, then still have the user play before the gate is ticked.

## The checklist
| # | Rule | Why it slipped through | Automated form |
|---|---|---|---|
| 1 | **Every meter moves in the first minute of normal play.** Moving costs something (hunger, stamina), and an empty meter hurts another one. | The rules only charged a meter on rare events (rain, bites), so a player saw it stuck at full | A sim test: walk 60 s vs idle 60 s, both meters below their start, walking lower |
| 2 | **A warning never promises what the player cannot see.** A spoken or written "X is coming" means X arrives on screen within a few seconds. Prefer a diegetic cue (the bark, the horn) over narration | The hazard was clamped in its pen, so the line fired and nothing came | A sim test per warning event: within N seconds the hazard is within M metres of the player |
| 3 | **A hazard that cannot reach the player is scenery.** Fences need gates, pens need exits, chasers need a nav path to where the player walks | Bots never walked near the pen, so they never noticed | A sim test: alert the hazard with the player outside its home area, and it gets close |
| 4 | **Interactions are physical and visible.** A lid opens, the food is a model you can see, an empty container is empty. "Press E near a box" is not an interaction | The interact tag on a box was enough for the rules and the bots | state reports each container's open and contents; one capture shows food in an open one |
| 5 | **Not every container gives a reward,** and junk gives less than a real meal | One fixed reward per box made the safest strategy the only strategy | Seeded contents per night; a test that an empty one rejects |
| 6 | **The hero reads at a glance:** adult proportions unless the story says young, big enough on screen at the default camera distance | Kitten proportions (big head, big eyes) read as cute props next to 1.8 m people | A lineup render next to a 1.8 m human; the default third-person shot with the hero filling ~1/6 of the frame height |
| 7 | **Feet stay on the floor** in every pose (walk, run, crouch, eat, groom, idle) | Whole-body tilts for poses and a single-bone leg arc push paws under the floor; screenshots at eye height hide it | The player reports `feetBelowFloor` (max over paws, metres); assert ≤ 0.01 in each pose; a low `paws` capture view |
| 8 | **Movement has mass:** acceleration and deceleration, turn inertia, coyote time, a jump buffer, crouch where the gap is low. Instant start and stop reads as "basic" | The controller only had to pass "can walk, run, jump, climb" checks | Check speed after 0.05 s is lower than after 0.3 s; stopping takes more than 0 frames; a 0.3 m gap blocks standing and passes crouched |
| 9 | **The world has ambient life:** traffic in several colours, walkers of several kinds, some friendly, some hostile; lit windows that change; a street is never just props | Section goals listed only the hazards the story named | Counts of moving NPCs in state; a road capture with more than 3 moving things |
| 10 | **The hero shows emotion** (scared, hungry, cold, hurt, happy) and has a death animation that fits the audience | Nobody listed it because the rules never needed it | The sim reports a `mood`; the dying phase lasts a few seconds before the lose screen |
| 11 | **The user plays the build before the gate is ticked.** Five minutes of play is the cheapest test there is | We gated on checks only | A roadmap box: `user playtest` before `checks pass` |

## How to run it
1. Before the section starts, turn each row that applies into a test or a capture, and put them in the lane briefs. Write a check the lane can fail.
2. At the gate, run them yourself (an agent's report is a lead, not proof).
3. Look at the `paws` and `road` shots, not only the hero shot.
4. Ask the user to play for five minutes. Log what they find in RETRO.md under "what the gate missed", and add a row here if it is new and generic.

See also: `skills/character-life` (rows 6, 7, 8, 10) and `skills/living-world` (row 9).

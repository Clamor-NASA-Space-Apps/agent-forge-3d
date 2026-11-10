---
name: game-feel-gate
description: "The feel checks for a 3D game (Godot 4.7, played in a browser) that a number sheet cannot hold: meters that move, warnings that show on screen and keep their promise, hazards that reach the player, physical interactions, a hero that reads at a glance and shows emotion, ambient life, hollow things solid from inside, and the user's five minutes of play. Use when the plan has a gate: turn the rows into checks before the build starts, and run them at every section gate before telling the user a playable build is done."
---

# Game feel gate

Tests, bots and preset screenshots can all pass while the game feels dead. Two tools stop that before the build starts, and one after:
1. **The sheet** (`skills/reality-sheet`) holds everything that is a number: speeds, jumps, body size, chases, camera bands. It is checked at plan time and measured at every gate.
2. **This list** holds what is not a number. Each row has a cheap automated form: write it as a check in the first roadmap section, before the lanes start.
3. **The user plays** before a gate is ticked. Whatever they find that neither tool held becomes a sheet question or a row here, written for any game.

"State" below is what the game returns from `render_game_to_text()`. A sim test is a case in `tests/run.gd`; a capture is a `set_view()` preset shot by `capture-view`.

## The checklist
| # | Rule | Why it slips through | Automated form |
|---|---|---|---|
| 1 | **Every meter moves in the first minute of normal play.** Moving costs something, and an empty meter hurts another one | The rules only charged a meter on rare events, so a player saw it stuck at full | A sim test: walk 60 s vs idle 60 s, both meters below their start, walking lower |
| 2 | **Every danger shows on screen, and keeps its promise.** A cue is a marker over the hero or the threat, an arrow at the screen edge when the threat is off screen, and a real sound (the bark, the horn). The threat then arrives within a few seconds. A browser plays no sound before the first tap or key press, so the mark must work alone. No narration unless the user asked for a voice: a spoken line repeats, lags, and annoys | The rules fired a spoken line for a hazard that was penned in; nothing showed on screen | State reports the active cues (`hud.cues`); a sim test per warning event: within N seconds the hazard is within M metres of the player; no voice stream is ever played |
| 3 | **A hazard that cannot reach the player is scenery.** Fences need gates, pens need exits, chasers need a path on the navigation mesh to where the player walks | Bots never walked near the pen | A sim test: alert the hazard with the player outside its home area, and it gets close |
| 4 | **Interactions are physical and visible.** A lid opens, the food is a model you can see, an empty container is empty. A character that touches another goes to it, bends to its height, and the hand lands on it | The interact tag on a box, or a distance under a radius, was enough for the rules and the bots | State reports each container's open and contents, and `touchGap` during a touch; one capture of each |
| 5 | **Not every container gives a reward,** and junk gives less than a real meal | One fixed reward per box made the safest strategy the only strategy | Seeded contents per night; a test that an empty one rejects |
| 6 | **The hero reads at a glance:** real proportions for its age, big enough on screen at the default camera distance | Young proportions (big head, big eyes) read as a toy next to people | A lineup render beside the reference person (`forge/lineup.py`); a `heroScreen` band on the sheet |
| 7 | **Feet stay on the floor, and on something,** in every pose and on every perch | Whole-body tilts push paws under the floor; a narrow ledge leaves them in the air; eye-height screenshots hide both | `feetBelowFloor` and `feetAboveFloor` inside their sheet rows, per pose; a low side view |
| 8 | **The world has ambient life:** traffic in several colours, walkers of several kinds, lit windows that change | Section goals listed only the hazards the story named | Counts of moving NPCs in state; a road capture with more than 3 moving things |
| 9 | **The hero shows emotion, in its species' own body language,** and has a death animation that fits the audience. A posture with a meaning (a raised tail, flat ears) shows only when it is true | Nobody listed it because the rules never needed it; one expressive pose was used as the rest pose | The sim reports a `mood`; one film of the neutral posture and one per signal; the dying phase lasts a few seconds before the lose screen |
| 10 | **Hollow things are solid from inside** | Single-sided shells are invisible from inside, and the hero walks out through them | One capture from inside each hollow model, and a walk outward that ends inside |
| 11 | **Hiding works both ways:** small spaces keep bigger chasers out, and the rules agree with the geometry | The rules let a chaser bite where it could never fit | A sim test: the hero in a crawl gap is unreachable for every chaser |
| 12 | **Bots play by the hero's rules.** They move through the sheet's ability rows, in steps small enough to see a catch | Bots teleported along paths, so a chaser faster than the hero went unnoticed | Bot runs report caught and escaped per hazard; a test fails at 0% or 100% |
| 13 | **Motion is looked at, not only measured.** A gait, a jump, a sit can pass every number and still look wrong | Stills at one moment hide motion | One film per gait, jump tier and rest pose (`feel-probe --film`), opened and compared with a reference video |
| 14 | **The user plays the build before the gate is ticked.** Five minutes of play is the cheapest test there is | We gated on checks only | A roadmap box: `user playtest` before `checks pass` |

Rows that used to be here and are now owned elsewhere: movement with mass (`skills/character-body`, sheet rows), what you see is what you hit and the camera (`skills/world-collision`, `skills/third-person-camera`), one press onto the obvious thing (`skills/contextual-traversal`), people that move like people (`skills/living-world`).

## How to run it
1. Before the section starts, turn each row that applies into a test or a capture, and put them in the lane briefs. Write a check the lane can fail.
2. At the gate, run them yourself (an agent's report is a lead, not proof), from the project folder:
   - `godot --headless --path . -s tests/run.gd`: the sim tests and the bots.
   - `node ../../tools/feel-probe.mjs data/reality.json . --film <ids>`: the sheet against the running game, and the films.
   - `node ../../tools/capture-view.mjs . captures --views <names>`: the pictures, state and `render.draw_calls`. `--views none` is the fast way to ask state a question.
   - `node ../../tools/web-check.mjs .`: the web build is what ships, so it must export, fit its budget and start in a browser.
3. Look at the films and the low side view, not only the hero shot.
4. Ask the user to play the web build for five minutes, on the weakest device it must run on. Log what they find in RETRO.md under "what the gate missed". Then ask which of the sheet's four questions (actor, pair, space, signal) should have caught it, and fix the question, a skill rule or a probe measure. A row here is the last choice.

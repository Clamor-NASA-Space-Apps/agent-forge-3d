---
name: contextual-traversal
description: "Jumping, climbing and getting into or onto things for a game hero, inside what the real body can do: ability tiers read from the reality sheet (step, hop, leap, pull-up, scramble, climb), one-press targets that always succeed, ballistic arcs with a capped take-off speed, landings that support every foot, routes to roofs and high places, containers entered by the rim, and jump animation phases. Use when the plan has jumping, climbing, ledges, roofs, or containers the hero gets into, before the world and player lanes are briefed."
---

# Contextual traversal

Two failures, both common. If the player has to wiggle against a bin until they fall in, the game feels broken. If one press floats the hero up a wall three times its real jump, the game feels fake. The answer to the first is Stray's "every jump will be successful": show a target, one press makes it. The answer to the second is that a target is only offered when the real body could make that move.

## Ability tiers (from the sheet, never from this file)
Each tier is a row or two in `reality.json` (`skills/reality-sheet`): a height or length limit and the time the move takes. A game uses the tiers its hero really has.
| Tier | What it is | Limit comes from |
|---|---|---|
| step | walked up, no key | the controller's autostep, sized to the world's curb |
| hop | the free jump | take-off speed |
| leap | a jump onto or across, landing on the feet | take-off speed: rise `v²/2g`, length from the same speed |
| pull-up | catch the lip with the front limbs, kick up | leap rise plus reach |
| scramble | a run-up, feet on the wall, then a pull-up | the source for that body (a cat or a person clears a fence this way) |
| climb | hand over hand, or claws, on a surface that allows it | tagged surfaces only (`rough`, `ladder`, `vine`); a climb speed row |
| drop | coming down: step off, climb down, or fall | fall rows: what height is free, what it costs above that |

A target above every tier is not a target. Higher places are reached by **chaining** moves through lower ones.

## Rules
1. **Targets come from data and from the drawn world.** Anything standable within a tier: tops, container openings, ledges, roofs. Read the landing from the drawn surface (`skills/world-collision`).
2. **Pick one target per frame.** Score by distance and by angle to the hero's heading (a cone of about 45 degrees), prefer the lower tier, add hysteresis so the choice doesn't flicker.
3. **Show it.** A small marker on the landing point plus a prompt with the key. No marker means the key does the free hop.
4. **One press, always succeeds, and obeys gravity.** The arc is ballistic: its duration comes from `g` and the heights, and the take-off speed it implies stays inside the sheet's row. Physics is off during the arc and the hero is placed on its floor at the end. Tiers above a leap are sequences (run-up, plant, pull-up), each with its own time, not one long float.
5. **A landing supports the whole body.** Offer a top only if every foot has floor (`feetAboveFloor` ≤ 0.02), or the hero takes a perch pose lined up with it (`skills/character-life`). A rail narrower than the body is a perch, not a floor.
6. **Containers by the rim.** Up to the rim, a beat of balance, then down inside; out the same way. Never a single arc through the wall's top edge into the middle.
7. **Design where the hero can really go.** For each kind of high or hidden place the game wants reachable (roofs, ledges, lofts), build at least two routes out of tiers: a crate by a wall, a tree by a roof, a pipe, a fence. Mark climbable surfaces in world data. A chaser that cannot make the moves cannot follow, and the rules must agree.
8. **Free hop:** variable height with coyote time and a jump buffer. It must not land the hero inside geometry.
9. **Animation phases** (procedural poses, blended with springs): anticipation (body low, a small lean back), take-off (back legs extend, front reach), air (tucked, tail or arms as a counterweight, head toward the target), reach (front limbs toward the landing), land (a squash at the feet, front legs absorb). A pull-up and a climb have their own poses. Timing follows the arc, not a fixed share.
10. **Camera during an arc:** keep following, damp vertical motion more.

## Checks
- `npm run feel` jump rows: the apex of every offered move is at most its tier's limit, and the time in the air matches gravity.
- **Reach check** (a Node script on world data, project-side): every standable top within the tiers is reachable from spawn by a chain of moves, or is listed with a reason. Each place the design names (each roof) has two routes.
- From in front of an open container, one press ends with the hero on the inner floor. From inside, one press gets it out.
- A marker appears only when a target is valid.
- One film per tier (`feel-probe --film`): the poses differ, and nothing floats.

## Sources
- Stray's jump design (every jump succeeds, prompts mark targets) and its critique (keep a free hop): https://pcgamer.com/stray-review and https://questforux.beehiiv.com/p/game-ux-case-study-stray
- Ledge detection with a forward cast for the wall and a downward cast for the lip, plus a clearance check: https://www.patreon.com/posts/moving-kat-3-32716107

---
name: contextual-traversal
description: "Jumping, climbing and getting into or onto things for a game hero in Godot 4.7, inside what the real body can do: ability tiers read from the reality sheet (step, hop, leap, pull-up, scramble, climb), one-press targets that always succeed, ballistic arcs with a capped take-off speed computed in the pure sim, landings that support every foot, routes to roofs and high places, containers entered by the rim, and jump clips timed to the arc. Use when the plan has jumping, climbing, ledges, roofs, or containers the hero gets into, before the world and player lanes are briefed."
---

# Contextual traversal

Two failures, both common. If the player has to wiggle against a bin until they fall in, the game feels broken. If one press floats the hero up a wall three times its real jump, the game feels fake. The answer to the first is Stray's "every jump will be successful": show a target, one press makes it. The answer to the second is that a target is only offered when the real body could make that move.

## Ability tiers (from the sheet, never from this file)
Each tier is a row or two in `data/reality.json` (`skills/reality-sheet`): a height or length limit and the time the move takes. A game uses the tiers its hero really has.
| Tier | What it is | Limit comes from |
|---|---|---|
| step | walked up, no input | the body's curb step (`skills/character-body`), sized to the world's curb |
| hop | the free jump | take-off speed |
| leap | a jump onto or across, landing on the feet | take-off speed: rise `v²/2g`, length from the same speed |
| pull-up | catch the lip with the front limbs, kick up | leap rise plus reach |
| scramble | a run-up, feet on the wall, then a pull-up | the source for that body (a cat or a person clears a fence this way) |
| climb | hand over hand, or claws, on a surface that allows it | tagged surfaces only (`rough`, `ladder`, `vine`); a climb speed row |
| drop | coming down: step off, climb down, or fall | fall rows: what height is free, what it costs above that |

A target above every tier is not a target. Higher places are reached by **chaining** moves through lower ones.

## Rules
1. **Targets come from data and from the drawn world.** Anything standable within a tier: tops, container openings, ledges, roofs, listed or tagged in `data/world.json`. Read the landing from the drawn collision (`skills/world-collision`): a forward `ShapeCast3D` finds the wall, a `RayCast3D` down finds the lip, and a zero-length `ShapeCast3D` with the body's shape, a hair clear of the floor, proves the hero fits there.
2. **Pick one target per frame.** Score by distance and by angle to the hero's heading (a cone from `data/tuning.json`), prefer the lower tier, add hysteresis so the choice doesn't flicker.
3. **Show it.** A small marker on the landing point plus a prompt: the key bound to the action, or the touch button lit up on a phone. No marker means the action does the free hop.
4. **One press, always succeeds, and obeys gravity.** The arc is ballistic: its time comes from `g` and the heights, and the take-off speed it implies stays inside the sheet's row. The arc is a pure function in `sim/`, so the player, the bots and the reach check all agree on what can be reached:

```gdscript
# The arc to a landing, or {} when the body cannot make it. v_max and g are sheet rows, clear is the lip clearance.
static func arc(from: Vector3, to: Vector3, clear: float, v_max: float, g: float) -> Dictionary:
	var rise := to.y - from.y
	var apex := maxf(rise, 0.0) + clear
	var up := sqrt(2.0 * g * apex)
	var time := up / g + sqrt(2.0 * (apex - rise) / g)
	var v := Vector3(to.x - from.x, 0.0, to.z - from.z) / time + Vector3.UP * up
	return {"v": v, "time": time} if v.length() <= v_max else {}

static func at(from: Vector3, a: Dictionary, g: float, t: float) -> Vector3:
	return from + a.v * t + Vector3.DOWN * 0.5 * g * t * t
```
   During the arc the body skips `move_and_slide()` and is placed from `at()` every physics frame; at the end it stands on the landing's floor with zero `velocity`. Tiers above a leap are sequences (run-up, plant, pull-up), each with its own time, not one long float.
5. **A landing supports the whole body.** Offer a top only if every foot has floor (`feetAboveFloor` inside its sheet row), or the hero takes a perch pose lined up with it (`skills/character-life`). A rail narrower than the body is a perch, not a floor.
6. **Containers by the rim.** Up to the rim, a beat of balance, then down inside; out the same way. Never a single arc through the wall's top edge into the middle.
7. **Design where the hero can really go.** For each kind of high or hidden place the game wants reachable (roofs, ledges, lofts), build at least two routes out of tiers: a crate by a wall, a tree by a roof, a pipe, a fence. Mark climbable surfaces in world data. A chaser that cannot make the moves cannot follow, and the rules must agree.
8. **Free hop:** variable height with coyote time and a jump buffer (`skills/character-body`). It must not land the hero inside geometry.
9. **Animation phases are clips** in the creature's `AnimationTree` (`skills/character-life`): anticipation (body low, a small lean back), take-off (back legs extend, front reach), air (tucked, tail or arms as a counterweight, head toward the target), reach (front limbs toward the landing), land (a squash at the feet, front legs absorb). A pull-up and a climb have their own clips. Timing follows the arc, not a fixed share: the arc starts on the clip's take-off frame, and the air clip is stretched to the arc's time (`AnimationNodeAnimation` with `use_custom_timeline`, `timeline_length` and `stretch_time_scale`). A model with no jump clips falls back to poses built from joints (`skills/character-life`, section 7).
10. **Camera during an arc:** keep following, damp vertical motion more.

## Checks
- The probe's jump rows (`node ../../tools/feel-probe.mjs data/reality.json .`): the apex of every offered move is at most its tier's limit, and the time in the air matches gravity.
- **Reach check** (a headless script in `tests/`, on world data and the sim's `arc()`): every standable top within the tiers is reachable from spawn by a chain of moves, or is listed with a reason. Each place the design names (each roof) has two routes.
- From in front of an open container, one press ends with the hero on the inner floor. From inside, one press gets it out.
- A marker appears only when a target is valid.
- One film per tier (`feel-probe --film`): the poses differ, and nothing floats.

## Sources
- Stray's jump design (every jump succeeds, prompts mark targets) and its critique (keep a free hop): https://pcgamer.com/stray-review and https://questforux.beehiiv.com/p/game-ux-case-study-stray
- Ledge detection with a forward cast for the wall and a downward cast for the lip, plus a clearance check: https://www.patreon.com/posts/moving-kat-3-32716107

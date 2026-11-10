---
name: contextual-traversal
description: "Stray-style contextual jumps and traversal for a game hero: jump targets that always succeed (ledges, container openings, roofs), one press to get into a bin or onto a ledge, a target marker and prompt, and jump animation phases (anticipation, take-off, air, reach, land). Use when jumps feel fiddly, when the player has to wiggle or clip to get into or onto something, or when designing climbing and jumping for an animal or parkour hero."
---

# Contextual traversal

If the player has to wiggle against a bin until they fall in, the game feels broken. Stray's answer: "every jump will be successful". Show a target when a jump is available, and one press makes it. Keep a free jump for small hops, so the world doesn't feel locked.

## Rules
1. **Jump targets come from data.** Anything climbable (its top), container openings (the inner floor of an open bin), ledges, roofs. Each target has a landing point and an approach range: about 0.4 to 2.5 m horizontal, and up to the hero's climb height vertical.
2. **Pick one target per frame.** Score candidates by distance and by angle to the hero's facing or input direction (cone about ±45°), then by height (prefer the reachable one). Add hysteresis so the choice doesn't flicker between two targets.
3. **Show it.** A small marker on the landing point plus a prompt with the key ("Space: jump in"). No marker means Space does the free jump.
4. **One press, always succeeds.** The press plays an authored arc to the landing point: a parabola whose peak is just over the highest lip in the way, lasting 0.3 to 0.6 s with the length depending on distance. Physics is off during the arc, and the hero is placed at the end on its floor. Out of a container: Space picks the rim or the ground outside as the target.
5. **Free jump:** a variable-height hop with coyote time and a jump buffer (see `skills/character-life`). It must not land the hero inside geometry. Physics handles it.
6. **Jump animation phases** (procedural poses, each blended with springs):

   | Phase | Share of the jump | Pose |
   |---|---|---|
   | anticipation | ~0.08 s before leaving | body low, front paws planted, a small backward lean |
   | take-off | 0–20% | back legs extend, front legs reach forward, spine stretches |
   | air | 20–70% | tucked legs, tail as a counterweight, head toward the target |
   | reach | 70–100% | front paws forward and down toward the landing |
   | land | 0.1–0.15 s after touching down | squash at the feet (5–10%), front legs absorb, tail settles |
7. **Camera during an arc:** keep following, but damp vertical motion more, so the jump reads as motion of the hero, not of the camera.

## Checks
- From 1.5 m in front of an open bin, one press of Space puts the hero on the inner floor in under 0.8 s. No other input.
- From inside, one press gets the hero out.
- A target marker appears only when a target is valid; with no target, Space does the free jump.
- One capture per jump phase: the poses differ visibly.

## Sources
- Stray's jump design (every jump succeeds, prompts mark targets) and its critique (it limits free exploration, so keep a free hop): https://pcgamer.com/stray-review and https://questforux.beehiiv.com/p/game-ux-case-study-stray
- Anticipation and squash: the animation principles in `skills/character-life`.

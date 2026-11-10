---
name: third-person-camera
description: "A third-person follow camera for a three.js game that never ends up inside geometry: sphere-cast collision against the same colliders as the hero, whisker rays, tight-space framing (under cars, in tunnels), fading the hero when the camera is close, damping and hysteresis. Use when building a follow camera, or when a user reports see-through objects, the camera inside walls or cars, the hero filling the screen, or jittery zoom."
---

# Third-person camera

"Cameras are most noticeable when they fail" (John Nesky, GDC 2014, *50 Camera Mistakes*). The usual failures:
- the lens inside a car body or a wall, where back faces are culled so the object looks transparent;
- the hero's tail filling the screen;
- the camera popping in and out.

## Rules
1. **Collide against what is drawn.** The camera casts against the same physics colliders as the hero, and those come from the render meshes (see `skills/world-collision`). A camera tested only against logic boxes goes straight through every prop that has no box.
2. **Cast a sphere, not a ray.** Use a sphere with a radius a bit larger than the near plane's half-diagonal (about 0.1 to 0.15 m). Place the camera at the hit minus the radius. A ray lets the near plane clip into a surface, and you see through it. Rapier: `world.castShape` with a ball, excluding the hero's collider.
3. **Pull in fast, ease out slow.** Cut to the safe distance at once when something blocks. Return to the wanted distance with a spring over about 0.3 to 0.5 s. Hold the shorter distance a minimum time (about 0.2 s) so thin blockers don't flicker it.
4. **Whiskers:** a few short rays fanned left and right of the boom detect a wall before it blocks, so the camera swings away early. Player input wins over avoidance when they disagree.
5. **Tight spaces** (under a car, in a pipe, under a bench): when the space over the hero is low (a short upward probe), lower the camera height and pitch, and shorten the distance. That frames the hero from behind under the obstacle, so the camera never sits inside it.
6. **Fade the hero when the camera is close.** From about 0.8 m down to 0.35 m, fade the hero's materials out. In three.js set `material.alphaHash = true` and lower `opacity`: you get a dither with no sorting problems, and no extra draw calls. Hide it fully below the end distance. Never show the inside of the hero's head.
7. **Derive distance from pitch:** closer when looking up, a little farther when looking down. Keep the hero's size on screen steady.
8. **Damping:** a critically damped spring on the follow target; smooth vertical movement more than horizontal so jumps don't jolt the view.
9. **Store yaw, pitch and distance,** never a world position, and rebuild the camera from them every frame.

## Checks
- A capture with the hero under the lowest crawl gap: the frame shows the obstacle's underside, not see-through geometry.
- The hero pressed against a wall with the camera turned toward it: the camera stays outside, and the hero fades when the camera is close.
- Walk past a lamp post: the camera does not pop. Log the distance per frame and check there are no jumps longer than one frame in and out.

## Sources
- John Nesky, *50 Camera Mistakes*, GDC 2014: https://gdcvault.com/play/1020460/50-Camera. Summary: https://matellion.blogspot.com/2016/08/50-common-game-camera-mistakes-and-how.html
- Eric Undersander, accurate collision zoom (cast the near plane, not a ray): https://gamedeveloper.com/programming/accurate-collision-zoom-for-cameras
- Opsive Object Fader (fade the character by camera distance): https://opsive.com/support/documentation/ultimate-character-controller/camera/object-fader/
- Third person and de-occlusion (sphere cast, ease-out, hysteresis): https://www.strayspark.studio/docs/godot-camera-system/third-person-and-deocclusion
- Little Polygon, third-person camera tech breakdown (damping, framing): https://blog.littlepolygon.com/posts/cameras

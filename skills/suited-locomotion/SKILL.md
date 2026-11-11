---
name: suited-locomotion
description: "Make a hero in a heavy protective suit (a space suit, a diving suit, a hazmat suit, plate armour, a firefighter's kit) look and move like a person inside one, under any gravity, in Godot 4.7: the parts the model must show (life support, helmet and visor, bulk, joints, gloves, boots, identity bands), how a suited gait differs from an unencumbered one (cadence, stride, stance width, knee bend, lean, flight phase, stops, jumps, falls), with sourced numbers, footstep contacts timed to the frame the foot lands, and the side-view films that prove it. Use when the plan has a suited or armoured actor on screen, before choosing its model or writing its animation brief."
---

# Suited locomotion

A slim figure in armour that walks with a city stride reads as a toy, however good its surface. In one build the player said the hero "looks like he came from cyberpunk, I cannot see any life support" and that "his jumping and walking motions look weird": the model had no backpack and an opaque face plate, and its walk was a stock human cycle played slower. A suit is a machine the person carries: it is bulky, stiff at every joint, heavy and often top-heavy, and the gait shows all of that. Load `character-life` (clips, tree, layers) and `reality-sheet` (every number below becomes a row) with this skill. Where they disagree on a suited actor, this one wins.

## 1. What the model must show
Ask the user what real suit the actor wears (the interview's "real thing"), then find two or three photos of it from the side and the back. The silhouette must carry these, each visible from the default camera:
- **Life support.** The pack that keeps the person alive: a space suit's backpack, a diver's tank, a breathing-apparatus cylinder. It is the largest thing on the body after the torso. Size it from the source: a NASA EVA backpack is "as much as 0.75 m x 0.56 m x 0.254 m" (NTRS 20150009500), and the Artemis prototype's backpack weighs about 209 lb (95 kg) dry, of a 391 lb (177 kg) suit (Ogilvie 2026). No pack means no life support to the eye.
- **A helmet you can see into, with a visor and no face.** A clear bubble or a big window, and a tinted or gold sun visor pulled down over it: NASA's sun visor "has a special gold coating that works like the astronaut's sunglasses". The visor is what makes the head read as a helmet and not a mask. Helmets get lights and a camera on a band (the Artemis prototype lists "HD Video and Lights").
- **Bulk.** A hard, deep torso, arms and legs as thick tubes, the elbows held in front of the body ("The elbow joint center is consistently in front of the body", NTRS 20240005868). A suited person is about 1 m wide (99th percentile, NTRS 20090032975). Apollo's suit alone measured 170 x 82 x 28 cm on its mannequin (NASM).
- **Joints that look like joints:** rings at the neck, shoulders, waist, hips and ankles (the Z-2 has a "2-bearing rolling convolute shoulder", a "waist bearing" and "boots with ankle bearings"), thick gloves, big boots.
- **Identity in a band of a colour the ground never has; never a suit the colour of the ground.** Suits are white because "the white outer layer reflects heat from the sunlight"; crews tell each other apart by stripes ("Some suits are plain white and some have stripes", NASA; Apollo's commander wore red stripes from Apollo 13). A game picks the band colour from its design file, not the suit colour.
- **Proportions:** keep the person's height (crew 1.49 to 1.95 m unsuited) and add the suit around it. Do not shrink the head inside the helmet, do not slim the waist.
Check before accepting a model: silhouette from the side and from behind at play distance. If someone who has not seen the game cannot point to the life support, the model fails.

## 2. How a suited gait differs (numbers become sheet rows)
Unencumbered adults on Earth walk at 115 to 120 steps/min with a 1.5 to 1.7 m stride (Pirker 2017) and bend the knee about 60 degrees in swing (gait teaching slides, Newcastle). Human stride frequency stays under about 2 Hz on any planet (Sylos-Labini 2014). A suit changes the walk in these directions; take the actor's own numbers from a source for its suit and gravity.
| Measure | Suited vs unencumbered | Source |
|---|---|---|
| Cadence | lower. Pressure suit at 1 g: 88.8 vs 98.7 steps/min (one subject). Apollo on the Moon: 70 to 80+ steps/min, about 105 at the fastest | Cullinane 2017; Apollo 16 time and motion study |
| Step and stride | a little shorter at 1 g (step 0.595 vs 0.631 m). Lunar walk stride "in excess of 4 feet", hops "less than 3 feet"; another mission measured about 30 in | Cullinane 2017; Apollo 16 and 15 studies |
| Stance width | wider: dynamic base 0.19 vs 0.08 m; standing 0.355 vs 0.263 m. Apollo: "feet spread apart 10 to 15 inches" | Cullinane 2017; Apollo 15 study |
| Knee bend in swing | far less: a pressurised suit peaks near 20 to 28 degrees (read from a graph) against about 60 unsuited. Pressure made it "challenging to fully buckle the knee joint" | Norcross 2010; Carr and McGee 2009 |
| Foot clearance | lower: the suited walker "had lower clearance heights" | Cullinane 2017 |
| Walk to run | earlier: suited people left the walk at Froude 0.36, against about 0.5 unsuited | Carr and McGee 2009 |
| Flight | in low gravity both feet leave the ground in a walk ("floating"); duty factor about 10% lower at 0.25 to 1 g | Apollo 15 study; Donelan and Kram 1997 |
| Arms | held out and in front, a small swing; the arms cannot hang at the sides | NTRS 20240005868 |
Rules that follow:
1. **The suit's walk is a clip of its own,** not the stock walk slowed down. A slowed human walk keeps its knee bend and foot lift and only loses cadence, which reads as slow motion. If no suited clip exists, edit a walk in Blender: cap the knee near the source's peak, widen the stance, lift the arms off the body, lower the foot lift, then measure it again (`character-life` section 1).
2. **Gaits come from the actor's source, not from Earth.** On the Moon, Apollo crews used four: "flat-footed walk, lope, skip" and a two-footed "kangaroo hop", the hop "used only in play or downhill". In stronger gravity the walk lasts longer before the change (Froude). Name the bands on the sheet.
3. **Everything takes steps.** Stopping took "two or three steps", a sideways change "a couple of steps" (Aldrin, ALSJ). A suited actor never stops or turns on the spot: brake and turn rates are sheet rows.
4. **Lean is limited and costly.** A successful pick-up leaned about 25 degrees from vertical; a fall came at far more (Apollo 16 study). Reaching the ground is a knee drop or a hop, then a kneel, "all done in one continuous motion", never a bend at the waist.
5. **The body still bobs.** A walk with no rise and fall of the hips glides. Measure the clip's hip travel; zero is a bug.

## 3. Jumps, falls and getting up
- **The jump is small and two-footed.** Apollo 16: Young "bends his knees slightly, springs about a half meter off the ground", 1.45 s in the air at about 1.17 m/s take-off (ALSJ). The suit limits the crouch, so the anticipation is short and shallow. Keep the take-off speed of the source and let the actor's gravity give the height: `h = v^2 / 2g`, air time `2v / g`.
- **A tall pack tips the body back.** Armstrong: a "tendency to tip over backwards on a high jump"; Duke "tipped over backwards and landed on his PLSS" (ALSJ). Lean the jump clip a little forward and let the arms swing forward for balance.
- **Falls are slow and soft in low gravity** (the film "gives the impression of a slow-motion film"); getting up is a sequence: "getting on all fours, leaning forward, pushing back with his hands ... to his knees and then to his feet" (Apollo 16 study). If the game has falls, the get-up is a clip.

## 4. Footstep contacts on the landing frame
Footprints, dust and footstep sounds must start when a foot lands, never before. Two failures seen: the "lower foot changed" test fired 0.19 to 0.25 s early in a walk clip (the swinging foot passes below the rising heel of the other while still 5 cm up) and 0.14 to 0.17 s early in a run (14 cm up); and timers drift off the feet whenever speed changes.
1. **A contact is a foot that is low and still.** Mark contacts where the foot is within a few centimetres of the floor and its speed drops below a threshold; this is how motion data is labelled ("computing the magnitude of the velocity of the heel and toe joints and observing when these velocities go below some threshold", Holden 2017). Fire on the rising edge, once per foot, and place the mark under the foot on that frame.
2. **Bake it per clip at load.** Sample each gait clip in model space (`character-life` already does this for the clip's ground speed): a foot is down where its height is near its lowest and it moves backward at the clip's ground speed. Store the touchdown phase of each foot. At runtime fire when the clip's phase crosses it. Engines name these: Unreal's sync markers ("Right Foot Down") and notifies "such as footsteps", Godot's Call Method tracks.
3. **Godot fires a method track from every clip with any blend weight** (`AnimationMixer`: only a zero weight is skipped), so a walk and run blend steps twice. Either fire from the dominant clip only, ignore the same foot within half a cycle, or detect from the drawn pose (rule 1) on `BoneAttachment3D` feet.
4. **Keep blended clips in phase:** `AnimationNodeBlendSpace1D.sync_mode = SYNC_MODE_CYCLIC_MUTABLE`. `sync = true` is the old `SYNC_MODE_INDEPENDENT`, which lets clips of different lengths drift, so the blended feet never plant together. Each gait clip starts on the same foot's touchdown.
5. A landing sets both feet down at once, on the frame the body touches the floor. Effects at the contact belong to `ground-contact-fx`.

## Checks
- **Silhouette:** a capture from the side and from behind at play distance; the life support, the helmet's visor and the bulk read without a caption. No face pixels.
- **Clip measures** (a headless script over the clips, numbers into the sheet): cadence, stride, peak knee flexion, stance width, foot lift and hip bob for each gait, each inside its sheet row. Hip bob above zero.
- **Side-view films** (`feel-probe --film`, camera at hip height, a body length to the side): one per gait, the jump and the stop. Look for: knees that stay straight-ish, feet wide, arms forward, the body rising and falling, two or three steps to stop, a small two-footed jump with a short crouch.
- **Contact timing:** in a test, record each footstep event and the drawn foot height on that frame; every event has the foot within the sheet's contact height, and no foot lands without an event. Run it at the slowest walk, in the walk to run blend and at the top speed.
- The user watches the films before any lane builds on the gait.

## Sources
- NASA, "Spacewalk spacesuit basics" (gold visor, white layer, stripes, rear entry): https://www.nasa.gov/centers-and-facilities/johnson/spacewalk-spacesuit-basics/
- Ogilvie et al., ICES-2026-127 (xEMU 177 kg, backpack 209 lb, part masses): https://ntrs.nasa.gov/citations/20260003038
- NTRS 20150009500 (backpack envelope), 20090032975 (suited breadth), 20200001257 (xEMU features), 20150022144 (Z-2 bearings), 20240005868 (suited arm range)
- Smithsonian NASM: Armstrong's A7L (170 x 82 x 28 cm), Cernan's commander stripes
- Apollo Lunar Surface Journal, lunar gaits and the Apollo 16 jump: https://www.nasa.gov/history/alsj/a11/a11.gaits.html
- Apollo 15 and 16 Time and Motion Studies, NTRS 19730008096 and 19730008098 (cadence, stride, stance, falls, pick-ups)
- Carr and McGee 2009, "The Apollo Number", PLoS ONE 4(8):e6614: https://pmc.ncbi.nlm.nih.gov/articles/PMC2719915/
- Cullinane et al. 2017, Aerosp Med Hum Perform 88(6):589 (suited vs unsuited gait at 1 g)
- Norcross et al. 2010, NASA/TP-2010-216125 (suited knee and hip angles in reduced gravity): https://ntrs.nasa.gov/citations/20110003409
- Donelan and Kram 1997, J Exp Biol (walking at 0.25 to 1 g); Sylos-Labini 2014 (2 Hz limit); Pirker 2017 (normal cadence and stride)
- Holden et al. 2017, "Phase-Functioned Neural Networks for Character Control" (contact labels from foot speed)
- Unreal Engine docs, Sync Groups and Animation Notifies; Godot 4.7 `AnimationMixer` (animation_mixer.cpp) and `AnimationNodeBlendSpace1D` class reference

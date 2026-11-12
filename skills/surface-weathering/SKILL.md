---
name: surface-weathering
description: "Coat every object in a world with what really settles on it (dust, snow, ash, grime) the way the real thing does: thickest on level tops, thin on walls, none underneath, gathered in seams, a thin layer that tints and lets the paint and its texture show through, a thick one that hides it, shine gone wherever it lies, and storms that make it worse, all in the house style's one shader (DESIGN.md `weathering`) at no extra draw call, in Godot 4.7 Compatibility. Use when the plan has a dusty, snowy, sooty or dirty world, or a player says the objects look too clean or shiny for where they stand."
---

# Surface weathering

The fake look has a name: a showroom-clean model standing in a dusty world. It shines, its white is the whitest thing
on screen, and nothing ties it to the ground it stands on. The other fake is a uniform tint over everything, as if the
whole model were dipped in paint: walls as dusty as roofs, undersides too, the texture gone.
- Real coats come from above. Mars Pathfinder measured dust on a level plate at "0.28 percent per day" (Landis), and
  "the camera window on the Viking lander showed no dust adhering to the vertical surface" (Jenkins and Landis).
- Real coats are thin for a long time. The thickest coat on a Mars rover's calibration target after years was
  "≈ 29 ± 15 µm" (Kinch 2015). Through it, the target still shows: "the contrast ... is reduced by the overlying dust".
- What the eye reads first is the shine going and the colour shifting, not a layer.

## 1. Ask for each world (write the answers into the reality sheet or DESIGN.md prose, with sources)
- What settles: its colour against the ground (Mars bright dust has albedo 0.22 to 0.27, dark sand under 0.15,
  Christensen 2001), and how it filters what is under it (Mars dust is "dark at blue wavelengths and bright in the red",
  Kinch 2015: thin, it tints red).
- How fast it builds on a level top, and how old the scene is. Mars: "a loss of 0.2% per Sol is typical ... between
  0.05% and 2% per Sol" (Lorenz 2021), an exponential: coverage ≈ 1 - exp(-0.002 × sols), 0.55 after 400 sols.
- What clears it: wind gusts and their season ("wind speeds exceeding 20 m/s", Vaughan 2010; Spirit's cleanings came
  in dust devil season, Lorenz 2021), people sweeping (solar cells someone keeps clean), heat (a hot vent), motion.
- What a storm does: more falls than is lifted (2018 Mars storm, tau 10.8, JPL), and wind drives it onto walls: a
  vertical target on Curiosity averaged 4.7% coverage but reached 49% "during a major dust storm" (Lorenz 2021, after
  Yingst 2020).

## 2. Where it lies (one rule per face, from the face's own direction)
1. Level tops take the full amount. Faces turned up take most of it (a smooth step from about 10° to 60° above level).
2. Walls take a share of it (the `side` token). Undersides fade to none. Overhangs keep what is under them clean.
3. Seams, pits and ledges take more: "slits and cavities are prone to accumulating dirt and dust" (UNIGINE); sand
   "fills cracks between them, leaving tops of stones pure" (Mishkinis 2013). The cheapest cavity map is the role's own
   photo: its dark lines are its seams.
4. Patches, never an even film: a wind-swept deck shows "patterns of heavily dusty and windswept areas" (Planetary
   Society, reported). One low-frequency noise breaks the amount up, metres across, never a hard edge.
5. Moving parts carry their coat: take the mask and the noise in the mesh's own space, so a turning wheel or door does
   not swim through it. Things that hold still take it in world space, so copies of one model differ.
6. Opt-outs are real things, not taste: a light's lens, a solar cell someone keeps swept, a visor someone wipes, a
   plant indoors, ground and rock that are already the dust's colour (never coat them twice).

7. **A walker is coated from below and where it touches, not from above.** A suit after a surface walk: dust
   "quickly and effectively coated surfaces", "boots, gloves, suits, and hand tools", and wore suits through "above
   boot" (Gaier 2005, Apollo); Cernan back in the cabin, "note lunar dust on his suit" (NASA, AS17-145-22224). So the
   mask comes from the body, not the face's direction: heaviest on boots and lower legs (kicked up at every step),
   the knees, shins and front of the thighs (kneeling, falls), gloves and forearms (tools, samples), light on the
   torso, a little on a pack's top, none on a visor someone wipes. Bake it per vertex in the rest pose (by the bone
   that carries the vertex, its height and facing, times the patch noise) into the vertex colour, so the shader reads
   one number and the patches ride on the moving body. Where no one has walked yet (Mars), say it is by analogy.
8. **A hero that must read against the ground keeps less of the coat's hue.** The coat's full colour turned a white
   suit the ground's orange in a storm, and a figure the colour of the ground vanishes into it. Take the stain's
   brightness and a share of its hue (a grey-brown), cap how much any part shows, and keep the identifying bands
   uncoated enough to read.

## 3. How it looks
- Thin coat = a filter: the paint, its plates and its bumps all show, tinted toward the coat's colour (multiply, so a
  dark part stays dark). Thick coat = the coat's own colour and grain.
- Shine goes first: "a clean array would appear more like specular glass" (Vaughan 2010); a dusty one is diffuse.
  Roughness rises to 1 and metalness falls to 0 by coverage. Naughty Dog treats dust as "fuzzy", like peach fuzz.
- Keep half the base normal under a thin coat: the coat drapes the shape, it does not fill it.
- Glass gets a film that raises its opacity, still see-through while thin.

## 4. Cost (Godot 4.7 Compatibility, web and phones)
- No extra pass, no `next_pass`, no decal, no screen-space dirt (UNIGINE's takes 4 to 32 samples and "significantly
  affects performance"). It is a few lines in the material shader every object already uses, so draw calls stay equal.
- An up mask is one dot product (Epic's World Aligned Blend, Naughty Dog's frost "only to the upward-facing surfaces").
  Pick one planar projection by the face's main axis instead of triplanar: GPU Gems 3's triplanar reads 6 textures.
- Low preset: the mask alone. Middle: plus ALU noise. High: plus the coat's photo, reusing a texture the ground already
  loaded (no new memory).
- An official model with its own textures goes through the same shader with its albedo (and normal) map, so it gets
  the coat without a second pass.

## 5. In this factory
DESIGN.md `weathering` (house_style.gd, surface.gdshader `COAT`), checked by style-check:
`{ color, amount, side, crevice, noise, texture, textureSize, clean }`, plus a role's `weathering` share (0 to 1,
default 1). `clean` is a node-name pattern whose meshes stay uncoated. A sky state (`DESIGN.<state>.md`) sets its own
`amount` and `side`; the restyle on a theme switch carries it. Any change is a DESIGN.md edit the user approves.

## Example (any world: fill the numbers from your own sources)
A base on a dusty plain, a year old: level tops at about the coverage the deposition rate gives for its age, walls a
fraction of that, undersides none, the storm state with more on tops and much more on walls, solar cells and lamp
lenses clean, the ground and rocks untouched.

## Checks
1. Draw calls are equal with the coat on and off (capture-view reports them per view).
2. One close-up of a wall, a roof and an opt-out part (a solar cell): the roof is coated, the wall less, the opt-out
   clean, and the base texture (plates, seams, lettering) still reads through the coat on the wall and the roof.
3. A storm or worse state shows more coat than the calm one in the same view.
4. Nothing on a dusty world is shinier than its ground under the low sun, except what was opted out.
5. A moving part (door, wheel) shows the same coat pattern in two frames of its motion.
6. `node tools/style-check.mjs DESIGN.md` fails a `weathering` value out of range or an unknown key.

## Sources
- Gaier 2005, "The Effects of Lunar Dust on EVA Systems During the Apollo Missions", NASA/TM-2005-213610,
  https://ntrs.nasa.gov/citations/20050160460 ; his slides (quotes above):
  https://www.nasa.gov/wp-content/uploads/2019/04/06_2_jgaier_whatdoweneedtoknowv1_pres.pdf
- NASA image AS17-145-22224, Cernan after the second EVA, "Note lunar dust on his suit":
  https://www.nasa.gov/image-detail/amf-as17-145-22224
- Christoffersen et al. 2009, lunar dust on the Apollo 12 and 17 suit fabrics (residual dust in the outer layer):
  https://ntrs.nasa.gov/citations/20090015239
- Landis, "Measuring dust on Mars" (Pathfinder MAE), NTRS 20050180606: 0.28% per day on a level plate.
- Jenkins and Landis, dust characterization experiment, NTRS: no dust on Viking's vertical camera window ("anecdotal").
- Lorenz et al. 2021, "Dust on Mars solar arrays", Planetary and Space Science (HAL): 0.2% per sol typical, 0.05 to 2%;
  Curiosity's vertical MAHLI target 4.7% mean, 49% in a major storm; cleaning in dust devil season.
- Kinch et al. 2015, MER calibration-target dust (PMC): thickest ≈ 29 ± 15 µm; dust dark in blue, bright in red;
  contrast reduced, not hidden.
- Vaughan et al. 2010, Spirit dust aggregates: clean array "more like specular glass"; cleaning winds over 20 m/s.
- Christensen et al. 2001, TES review: albedo 0.22 to 0.27 at dusty landing sites, under 0.15 in dark regions.
- JPL, Opportunity and the 2018 storm: tau 10.8, more dust falling than raised (WebFetch).
- Naughty Dog, "Technical Art of Uncharted 4", SIGGRAPH 2016: frost only on upward faces, dust as fuzz.
- Epic Games, layered materials / World Aligned Blend: snow on upward faces stays on top as the object turns.
- GPU Gems 3 ch. 1 (triplanar: 6 reads); Unity Shader Graph Triplanar node (3 samples); Godot docs (triplanar).
- Mishkinis 2013, "Advanced Terrain Texture Splatting": height blend, sand fills cracks.
- UNIGINE docs, SSDirt: cavities gather dirt; screen-space version costs 4 to 32 samples.
Excerpts with URLs: the project that first needed this saved them under `design/research/pages/dust-coat/`.

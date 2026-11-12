---
name: day-cycle
description: "Run a world on its own compressed clock in a Godot 4.7 Compatibility game shipped to the web: one clock in data that every listener reads (sun, sky, fog, lamps, sound, rare events), a day length picked from the play session and not from the planet, two time scales kept apart (what happens over hours runs on the fast clock, what moves in seconds keeps its real speed), a night that is short or skippable and never pitch black, a sun moved in smoothed bursts so shadows do not crawl, and a sky whose reflections are refreshed in steps instead of every frame. Keeps the look clock (allowed in a sandbox) apart from rules that count days. Use when the plan has a day and night cycle, a moving sun, time of day, a clock knob, or a playtest says the sky jumps between states, the shadows swim, or the night is a chore."
---

# Day cycle

The failure has two faces. A world stuck at one hour reads as a diorama; a sky that switches between a few fixed
states reads as a slideshow. The other face is the cycle that runs too fast: "it makes the game feel like it's in
fast forward and I don't actually have the time enjoy a more leisurely pace" (Subnautica forum, 2016, about a 20
minute day). And one that runs too slow for a long game: Occupy Mars players called a 24 + 10 minute day "far, far
too short" and modded it longer, because their whole routine fitted inside one day (Steam, 2023).

Rule: **one clock, in data, that the look reads and the rules may read later; a day long enough to do a few things in
and short enough to see several in one session; night shortened, skippable or still playable, never black.** Load
`godot-3d-essentials` and `godot-shaders` with it; `frame-budget` owns the cost of what follows, `living-atmosphere`
owns the sound and the ambient motion that listen to the clock, `surface-weathering` owns what settles on surfaces.

## 1. Pick the day from the session, not from the planet
Ask at the interview: how long is one sitting, how many days does the story need, and must the player see a night in
the first sitting. Then compare with games whose numbers are known:
| Game | Real minutes per day | Night | Source |
|---|---|---|---|
| Animal Crossing | 1,440 (the console clock) | real | Nookipedia, "Time travel" |
| Skyrim | 72 (1,440 / timescale 20, our maths) | wait or sleep 1 to 24 h | UESP/Fandom console commands, "Waiting" |
| GTA V, RDR2 | 48 | a time-lapse at a timed mission; RDR2 runs faster at night | GTA and RDR wikis |
| Zelda: Breath of the Wild | 24 | rest at a campfire to morning, noon or night | Zelda Wiki, "Time" |
| Minecraft | 20 (8 min 20 s of night) | a bed skips to morning | Minecraft Wiki, "Daylight cycle", "Bed" |
| Subnautica | about 20 (4 min 30 s of full night) | a bed any time, 10 min cooldown | Subnautica wiki, "Planet 4546b" |
| Stardew Valley | 14 (6 am to 2 am) | a bed ends the day at any hour | Stardew Valley Wiki, "Day Cycle" |
| Oxygen Not Included | 10 (75 s of night) | none needed | ONI wiki, "Cycle" |
| Don't Starve | 8 (16 segments of 30 s) | a light is required | Don't Starve wiki, "Day-Night Cycle" |
- **A fast day costs the long story.** Days times minutes is the play time: write it down. A story of N days at M
  minutes is N x M minutes of play with no skips; if that is longer than the audience plays in a week, the clock is
  too slow or the story needs skips. For children's daily gaming, Common Sense Media measured 1 h 27 min a day for
  ages 8 to 12 (2021 census); the Canadian guidelines for ages 5 to 17 say "No more than 2 hours per day of
  recreational screen time".
- **Short nights are the norm in games that are not about night**: Oxygen Not Included 75 s of 600, Don't Starve 2 of
  16 segments in midsummer, Minecraft about 40% with a bed to skip it. A game may give night fewer real minutes than
  day; it may not hide that night exists if the setting has one.
- **Skips are standard, and they move only the clock.** Minecraft's sleep "does not accelerate processes that take
  place over time such as the growth of crops or smelting" (Minecraft Wiki, "Bed"). Decide per process whether a skip
  advances it; the rules lane owns that, never the renderer.
- **Pause the clock when the player cannot act**: Stardew pauses time "when viewing a cutscene, viewing a dialog or
  menu" in single player (Stardew Valley Wiki). A clock that runs under a tutorial card punishes reading.

## 2. One clock, many listeners
- **The clock is one number, the hour of the day (0 to 24 local), advanced by `delta * 24 / (day_minutes * 60)`**,
  with `day_minutes` in the project's tuning file. Everything else is a function of the hour: sun direction from the
  place's latitude and the season, sun colour and energy, ambient, fog, sky colours, lamp state, sound bed, which rare
  events may start. When a listener keeps its own timer, the sky and the lamps drift apart and the player sees it.
- **Keyframes in data, blended in code.** Fixed sky designs (day, sunset, night, storm) are the keys at given hours;
  the clock blends every token between the two keys around it. Assassin's Creed IV stored lighting as "8 key-framed
  values a day" and blended them at run time (Wronski, GDC 2014). A key is where an artist approved the look, so the
  blend can never leave the approved set by much.
- **A look clock first, the rules later.** In a sandbox that may not hold game rules, the clock drives only the look:
  no day counter, no deadlines, nothing scored. The rules lane later owns the clock (the sim's time) and the look reads
  it; the knob and the hour stay the same.
- **`render_game_to_text()` reports the hour, the sun's elevation and azimuth, the keys being blended and their
  weight**, so a test can set an hour and check the state without a picture.

## 3. Two time scales: things that take hours, things that take seconds
The day runs 60 to 120 times fast; the hero does not. Walking, driving, a dust devil crossing, a gust, a flag or a
cloud of kicked dust keep their real speed (`reality-sheet` rows); only what really unfolds over hours rides the
fast clock: the sun, the sky's colour, frost forming and going, temperature, the season's wind, a storm building or
clearing, dust settling on a surface. Write each process once, as "per game hour" or "per real second", next to its
source. Mixed up, the world feels wrong in a way no one can name: a cloud that crosses the sky in two seconds, or
frost that takes a whole real hour to go.
- **Rare events keep their real hour and their real duration**: whirlwinds at Gale crater peak between 11:00 and 13:00
  local time, about one a sol (Newman 2019), so one appears around the fast day's midday and lasts real minutes.
- **Clouds and sky features move at the clock speed only if they really move with the sun** (stars, moons, the
  sun's glow); weather clouds keep a real wind speed, or the "fast forward" complaint above follows: "how fast the
  clouds, sun, moon and orbiting planet / moon all move in the sky".

## 4. The sun in smoothed bursts, not every frame
At a 20 minute day the sun turns 0.3 degrees a second, and a person's shadow at 10 degrees of sun elevation grows
about a metre for each degree (`L = h / tan(e)`). Long shadows visibly crawl at dawn and dusk whatever you do; that
is the price of a fast day and players accept it in every game in the table. What they should not see is the shadow
map's texel grid turning with the light: Godot stabilises a directional shadow only against camera movement, by
snapping the projection to texel steps in the light's own axes (`renderer_scene_cull.cpp`, 4.7.2), so a turning
light drags the grid across every edge. A Godot maintainer: "many AAA games don't rotate the sunlight continuously,
but rotate it by small steps every few seconds instead (with some interpolation occurring between each step)"
(Calinou, godotengine/godot issue 90175, 2024).
- Keep the true sun angle every frame in code; move the light to it in a short eased burst whenever it is a set
  angle away. Pick the step and burst time on the weakest preset's shadow map, by filming an edge (check 3).
- Directional shadows are drawn every frame in Godot 4.7 whether the light moved or not (the shadow loop in
  `renderer_scene_cull.cpp`), so bursts buy steadiness, not frame time, in this engine.
- Low sun is where it shows: below about 15 degrees, shrink the step or slow the burst.

## 5. The sky: never a material parameter per frame
- **A sky material parameter changed every frame re-renders the sky's reflection cubemap**: the GLES3 renderer sets
  `reflection_dirty` when the sky material's uniforms change, and for a shader that reads `TIME` every frame
  (`rasterizer_scene_gles3.cpp`, 4.7.2). Anything that changes with the clock (colours, glow strength, the night sky's
  turn) is a **global shader uniform** set from code, which leaves the cubemap alone (factory gotcha, `house_style.gd`
  SkyClock).
- **The sun is the exception you cannot hide by globals**: a sky shader that reads `LIGHT0_*` marks the cubemap dirty
  whenever the light's direction, energy or colour changes (same file, the directional light buffer check). Either
  accept a refresh per sun burst (section 4 makes those rare), or set the light's `sky_mode` to
  `SKY_MODE_LIGHT_ONLY` ("the light will not be visible from sky shaders", class reference) and draw the disc from a
  global uniform. Check that fog sun scatter still shows on the sky in that mode before relying on it.
- **Refresh reflections in steps you choose.** A stale cubemap shows a noon sky in a metal surface at night. Bump one
  material parameter at each key change or every few game hours; in `PROCESS_MODE_INCREMENTAL` (what a shader with
  custom uniforms gets by default, `class_sky.rst`) the filtering is spread over several frames, as many as
  `rendering/reflections/sky_reflections/roughness_layers` (default 8).
- **Reflection probes**: never `UPDATE_ALWAYS` on a weak device ("a significant performance cost ... only use one
  ReflectionProbe with UPDATE_ALWAYS at most per scene", class reference). Re-dirty `UPDATE_ONCE` probes at the same
  steps (`HouseStyle.warm()` knows how; a dirty probe draws only once a camera sees it).
- **Ambient and fog are cheap per frame** when ambient is a colour (`AMBIENT_SOURCE_COLOR`): they are environment
  values, not sky uniforms. Ambient taken from the sky would follow the stale cubemap instead.

## 6. Dusk: lamps, and night that stays readable
- **Lamps switch on from the clock with hysteresis** (on below one sun elevation, off above a higher one), staggered
  a little so a base does not flip like a switchboard. Each additive light is a shader variant: warm the lamps-on look
  at load even in daytime (`frame-budget` section 1), or the first dusk on the web hitches.
- **Never pitch black.** "Night should be dark, but it shouldn't be pitch black" (Subnautica, Steam, 2021, answering
  a player with no gamma setting). Keep a cool ambient floor at night, lamps that light where the player works, and a
  sky glow; measure a pixel of the darkest ground under the darkest key on the weakest device, under the real tone
  curve (factory gotcha on ACES black).
- **The hour the session starts is a choice.** Start shortly after sunrise so the first minutes are in light and the
  first sunset arrives inside the first session; never start at night.

## 7. Things that settle and stay
Dust, snow, ash, frost: what builds up over the clock is a **world value, not a sky key**. A coat that belongs to the
"storm" key vanishes the moment the storm key blends out, which is wrong. Mars solar panels lose "0.2% per Sol" typically and get it back only in occasional wind "cleaning
events", a "sawtooth" (Lorenz 2021); where no whirlwinds came, InSight's output fell from about 5,000 to 500 Wh a sol
and stayed down (NASA 2022). Settled dust is state (`surface-weathering`). Keep the coat as its own number (a global
uniform the surface shader reads), raised by the weather and lowered only by a cleaning event, with a per-object
override for what has been cleaned. Its rate per game hour comes from a source; whether it changes any rule (power,
health) is the rules lane's decision.

## Checks
1. **State, no picture:** set the hour to 0, 6, 12, 18 and the dusk hour; `render_game_to_text()` reports the sun's
   elevation and azimuth, the blended keys and weights, lamps on or off, and the coat value. A test asserts the
   lamps switch once each way across dusk and dawn with the hysteresis, and that menus stop the clock.
2. **No per-frame sky churn:** every sky material parameter set and every sun burst goes through one function that
   counts them; run 30 s at the shortest `day_minutes` and assert the count stays at the planned steps, not one a frame.
3. **Shadow film:** `feel-probe --film` of a fixed camera on a shadow edge at sun elevation 10 degrees, on the weakest
   preset, continuous turning against bursts. Pick the burst settings from the film.
4. **Timelapse pictures:** capture the default view at the key hours and at the midpoints between them; no midpoint
   may be darker or more saturated than both keys around it.
5. **The darkest pixel:** at the night key, the darkest ground pixel in the play view is above black on the weakest
   device's capture.
6. **The user plays one whole day** in the web build on the weakest device, at the chosen `day_minutes`, and says
   whether the day felt too fast, too slow, and whether the night was a chore.

## Sources
- Minecraft Wiki, "Daylight cycle", "Bed", "Game rule": https://minecraft.wiki/w/Daylight_cycle
- Zelda Wiki, "Time": https://zeldawiki.wiki/wiki/Time
- GTA Wiki, "Time"; Red Dead Wiki, "Conditions in Redemption 2"; Elder Scrolls Wiki, "Console Commands (Skyrim)",
  "Waiting" (Fandom, wikitext via the MediaWiki API)
- Stardew Valley Wiki, "Day Cycle": https://stardewvalleywiki.com/Day_Cycle
- Don't Starve Wiki, "Day-Night Cycle": https://dontstarve.wiki.gg/wiki/Day-Night_Cycle
- Oxygen Not Included Wiki, "Cycle": https://oxygennotincluded.wiki.gg/wiki/Cycle
- Subnautica Wiki, "Planet 4546b", "Beds"; Unknown Worlds forum thread 141528 (2016); Steam discussion
  3046104336673960683 (2021)
- Nookipedia, "Time travel": https://nookipedia.com/wiki/Time_travel
- Occupy Mars, Steam discussion 3880470363408017994 (2023)
- Common Sense Media, "The Common Sense Census: Media Use by Tweens and Teens, 2021"
- Canadian 24-Hour Movement Guidelines for Children and Youth (5 to 17 years), CSEP
- Bartlomiej Wronski, "Assassin's Creed IV: Black Flag, Road to Next-Gen Graphics", GDC 2014:
  https://bartwronski.com/wp-content/uploads/2014/03/ac4_gdc.pdf
- godotengine/godot issue 90175, "Jumping Shadows" (Calinou, 4 Apr 2024): https://github.com/godotengine/godot/issues/90175
- Godot 4.7.2 source: `drivers/gles3/rasterizer_scene_gles3.cpp` (sky dirty rules), `servers/rendering/renderer_scene_cull.cpp`
  (shadow stabilisation, shadow loop); Godot 4.7 docs: `class_sky.rst`, `class_directionallight3d.rst`,
  `class_reflectionprobe.rst`, `class_projectsettings.rst` at https://raw.githubusercontent.com/godotengine/godot-docs/4.7/classes/
- Lorenz et al. 2021, dust on Mars solar arrays (HAL hal-03369920); NASA, InSight power 2022 (PIA25284)
- Newman et al. 2019, convective vortices at Gale, JGR Planets, doi:10.1029/2019JE006082
- Microsoft, "Common Techniques to Improve Shadow Depth Maps" (texel snapping, given as the fix for a moving camera):
  https://learn.microsoft.com/en-us/windows/win32/dxtecharts/common-techniques-to-improve-shadow-depth-maps

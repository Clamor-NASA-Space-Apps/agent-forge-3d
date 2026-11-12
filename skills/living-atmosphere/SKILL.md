---
name: living-atmosphere
description: "Make a 3D game world and its hero feel alive rather than rendered, in Godot 4.7 shipped to the web: a sound bed in layers (the medium outside, a body or suit layer, footsteps on the real contact frames, an inside that differs from the outside) built within the web export's audio limits (no bus effects, so filters are baked into files and spaces crossfade by volume), ambient motion that answers one shared wind and keeps machines visibly working, the hero's own secondary motion on top of its clips (breath, look-at, lean, settle), and objects that show weight when they land, move or are carried. Use when the plan has a world the player walks through, before the audio, world and player lanes are briefed, and when a playtest says the game feels static, lifeless, like a model in a render, or silent."
---

# Living atmosphere

The failure has a name, from a playtest: "it looks good but feels static, like a model walking inside a rendered world". That build had good models, light and particles, and no sound, a hero with clips and nothing on top, and objects moved by linear tweens. Swink's definition of game feel names the missing third: "real-time control of virtual objects in a simulated space, with interactions emphasised by polish". This skill is that polish, in four layers, each cheap. Load `godot-audio` and `godot-animation` with it; `ground-contact-fx` owns what the ground throws, `third-person-camera` owns the camera, `suited-locomotion` and `character-life` own the clips. Every physical number below becomes a row on the reality sheet (`reality-sheet`).

Rule: **every loop listens to the game, and every layer answers the same few values** (speed, contact, wind, inside or outside, load). Journey's first sound pass "played all of their sounds at random and seemed pretty dumb and robotic"; the fix was loops "always reading a few variables from code ... player velocity, wind speed" (Johnson 2012).

## 1. The sound bed comes first
Silence reads as a render. "Ambient sound is one of the main ways to immerse people psychologically", and "Games that have sounds that skip, drop out, or have periods of silence tend to lose my attention" (O'Donnell, Halo). Build four layers on four buses before any music:
| Layer | What | Listens to |
|---|---|---|
| **Medium** (outside, 3D) | wind, machines, distant events, through whatever the world has for air | wind strength, distance, the medium's density |
| **Body** (the hero, not positional) | footsteps, landings, gloves on handles, a load creaking | contact frames, speed, surface, load |
| **Enclosure** (suit, helmet, cab, armour; not positional) | fans, pumps, breath, radio | exertion, inside or outside |
| **Inside** (rooms) | the room's machines, clear steps and doors | which room, what runs there |
1. **Ask the interview what the medium does to sound, and find a source.** Thin, cold or no air changes everything: on Mars "only lower-pitched sounds would travel long distances", and sound "falters at just 26 feet (8 meters), with high-pitched sounds being lost completely at that distance" (NASA/JPL 2022); in vacuum "the only way to hear anything is either through direct impact or via vibrations when in contact with a solid object" (Hellion). Water, fog, snow and caves each have their own. Put the cutoff, range and loudness on the sheet with the source, then check them by ear against a real recording if one exists.
2. **Short range is a distance setting.** The thinner the medium, the smaller the `max_distance` of every 3D player in it: "the less the air pressure, the smaller the max distance would be" (Hellion).
3. **A suited or enclosed hero hears the enclosure most.** Spacewalkers: "Mostly what you hear is the sound of the pumps and fans that circulate air and water through your suit" (Reisman), "a persistent humming and clanking" (NASA, via National Geographic). Not "no sound other than your own breathing". Breath rate and its rise with effort come from a source (a resting adult: MedlinePlus vital signs) and share one clock with the breathing motion in section 3.
4. **Footsteps fire on contact frames, never on a timer.** Use the contact events `suited-locomotion` section 4 produces (one per foot, rising edge, both feet on a landing). Journey "distinguished" left from right steps "for a back-and-forth sound". Pick at random from a set per surface and nudge `pitch_scale` a little; scale loudness with speed; split movement sound into layers as Hellion did ("Footsteps Type, Suit Type, and Weapon Type").
5. **Inside differs from outside, and the doorway is the show.** No Man's Sky's ambience knows "whether the player is indoors or out" and what the weather does (Weir). Going in: the outside layer fades, a transition sound plays (a hiss, a door seal, a pressure change), the inside layer fades up. The contrast is how a player feels the medium.
6. **Natural recordings over synthesis** for wind and weather: "Wind can be cold, gentle, spooky, reassuring ... it's a lot harder to do this with synthetic sound" (Weir). Official agency recordings and CC0 libraries come first; check each licence page and keep it beside the file.

### Godot 4.7 web: the audio limits that decide the design
- **No bus effects in a web build.** Since 4.3 web exports play in **Sample** mode: "AudioEffects are not supported", "Reverberation and doppler effects are not supported", "Positional audio may not always work correctly" (exporting_for_web.rst). The engine's web code gives a bus volume, mute, solo and send, and a player pitch (`library_godot_audio.js`, 4.7.2). Forcing **Stream** "may cause high audio latency and crackling". So:
  - **bake every filter into the file** (an "outside" copy of each outdoor sound, made once with ffmpeg), never an `AudioEffectLowPassFilter` on a bus;
  - **crossfade spaces by bus volume** (Inside up, Medium down), never by sweeping a filter;
  - `AudioStreamPlayer3D.attenuation_filter_*` is an effect too: do not count on it in the browser.
- **Unlock on the first input.** "Some browsers restrict autoplay ... request the player to click, tap or press a key/button to enable audio" (same page). Start the bed from the first tap.
- Loops are short mono OGG; long recordings are trimmed to the seconds that matter before they count against the data budget.

## 2. Ambient motion: one wind, many listeners
- **One gust value** (direction from the world data, strength from slow noise) drives every wind listener: particle amount, wind volume, cloth, a telltale or a flag, vehicle dust. When they move together the player believes one wind blows. Journey's wind sounds scaled "according to the wind speed".
- **Each motion at its real speed.** Ask how fast the real thing moves before animating it, and find the source. Something that really changes over days (dunes, ripples, glaciers) must not scroll while the player watches; what the wind lifts off it in a gust can. Thin air moves cloth little, water moves it slowly. The rate is a sheet row.
- **Machines work on their own.** Something the base or town runs should visibly turn, track, blink or hum: Hellion built a room's ambience from its life support, "air generators, nodes, and air filters". A light that blinks flashes no more than three times in any one second (WCAG 2.3.1, "Three Flashes or Below Threshold").
- **Rare events in their real season and hour** (whirlwinds on hot afternoons, fog at dawn, birds at dusk), each from its source. Rarity is part of the effect.
- In Compatibility: `GPUParticles3D` one-shots and loops, vertex shaders for sway, no decals, no volumetric fog (see `ground-contact-fx` section 6).

## 3. The hero's own motion on top of its clips
Clips give the gait; layers give the life. Naughty Dog blended "Independent Actions – Moving – Breathing – Facial Animations", and found that animating only part of the neck and spine "made the character look stiff"; additive layers gave "natural 'swaying' on arms and head" and a combined "Look-At" (Gyrling 2008). In Godot 4.7 these are `SkeletonModifier3D` children of the `Skeleton3D` (`character-life` section 4):
1. **Breath:** a small rise and fall of the upper spine on the breath sound's clock, faster after effort.
2. **Look-at:** `LookAtModifier3D` on the head (parent bones above child bones in the list, as the class reference requires), aimed at the nearest usable thing, a rare event, or the camera's aim; small angles. A helmet or armour moves the torso with the head, so share the turn down the spine. This is anticipation: "attention focusing on an object that a character is about to pick up" (twelve principles).
3. **Lean and settle:** lean into acceleration and turns, back when braking; on stopping, the heavy parts overshoot and come back ("follow through": loose parts "keep moving beyond the point where the character stopped only to be subsequently 'pulled back'"). One damped spring per layer, as Paragon smoothed its hips "via springs" (Delayen 2016).
4. **Load shows:** a carried weight changes lean and stiffness: Death Stranding's hero should "lean or sway, and then readjust his balance, based on changes in cargo weight".
5. **Loose chains** (hoses, scarves, straps, tails): `SpringBoneSimulator3D`, unbranched chains only, never on a scaled skeleton (class reference).
6. **Limits:** lean and look angles come from the actor's source (the sheet), never from taste. No squash on a person ("an object's volume does not change"), and secondary action must "emphasize, rather than take attention away from the main action".

## 4. Objects with weight
- **Landing:** a low sound on contact, the ground's response from `ground-contact-fx` (grit, haze, mark) at the contact point, a small sink into soft ground and a small settle that comes back. Sink and settle are sheet rows from a source for that ground.
- **Moving parts ease in and out** ("needs time to accelerate and slow down"); a motor sound's pitch follows the part's speed; an end stop clunks.
- **The carrier reacts** (section 3.4) and the load makes its own sound on each step (Body layer).
- **Vehicles** roll in turns and settle after a stop; their sound follows speed and what the wheels touch.

## 5. Music is rare
The bed means the world is never silent, so music can be scarce: a short motif at a few moments the player earns (a first step outside, a sunset, a door closing behind you). Journey's score was "a big cello concerto where you are the soloist" and the rest "the world around you" (Wintory), and sound effects stayed "pretty subtle" but "make the world feel tactile and real". Breath of the Wild's piano was meant to bring out the ambient sounds (Wakai, reported). Music and its licence are decided at plan time.

## Checks
1. **State, no picture:** `render_game_to_text()` reports each bus's volume, the playing loops, the last footstep (time, foot, surface) and the gust value. A test walks the hero 10 m and asserts one footstep per contact event and none without one; a test walks through a doorway and asserts the outside bus falls and the inside bus rises within the sheet's fade time.
2. **No effect leaks into the web build:** a check that fails when any bus in `default_bus_layout.tres` holds an `AudioEffect`, or any player outside the medium's range rule has `max_distance` above its sheet row.
3. **Listeners agree:** with the gust forced high and then low, the particle amount, the wind volume and every wind-driven node angle all rise and fall together (one assertion per listener).
4. **Hero layers:** a side-view film (`feel-probe --film`) of standing still for ten seconds shows the chest moving at the sheet's breath rate and the head turning toward a placed target; a stop shows one overshoot that settles.
5. **Weight:** a capture 0.1 s and 1 s after a set-down shows the contact effect and the settled object, and the log shows one landing sound.
6. **The user plays the web build with sound on**, on the weakest device, five minutes. The bed is judged on that device's speaker: small speakers lose the low end (Journey's transition bass "was blowing out small TV speakers").

## Sources
- Swink, Game Feel (2009), definition via https://en.wikipedia.org/wiki/Game_feel
- Steve Johnson, "The Sound Design of Journey", Game Developer, 10 Oct 2012: https://gamedeveloper.com/audio/the-sound-design-of-i-journey-i-
- Austin Wintory interview, The Sixth Axis, 15 Mar 2012: https://www.thesixthaxis.com/2012/03/15/interview-journey-composer-austin-wintory/
- Marty O'Donnell, HBO forum Q&A, 2002: https://halo.bungie.org/misc/hedge_martyinterview.html
- Paul Weir, No Man's Sky audio Q&A, Audiokinetic blog (Wayback copy, 8 Nov 2024): https://www.audiokinetic.com/en/blog/behind-the-sound-of-no-mans-sky-a-qa-with-paul-weir-on-procedural-audio/
- "Sounds from Outer Space: Hellion", Audiokinetic blog (Wayback copy, 8 Nov 2024): https://www.audiokinetic.com/en/blog/sounds-from-outer-space-hellion-game/
- Garrett Reisman via Slate/Quora, 14 Oct 2013: https://www.slate.com/blogs/quora/2013/10/14/what_sounds_do_astronauts_hear_during_a_spacewalk.html ; Nadia Drake, National Geographic, 14 Apr 2015: https://www.nationalgeographic.com/science/article/a-behind-the-scenes-look-at-that-amazing-gopro-footage-from-space
- NASA, "Sounds of Mars": https://science.nasa.gov/mission/mars-2020-perseverance/sounds-of-mars/ ; NASA/JPL 2022, "What Sounds Captured by NASA's Perseverance Rover Reveal About Mars": https://www.nasa.gov/solar-system/what-sounds-captured-by-nasas-perseverance-rover-reveal-about-mars/
- W3C, WCAG 2.2, Success Criterion 2.3.1 Three Flashes or Below Threshold: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- MedlinePlus, "Vital signs": https://medlineplus.gov/ency/article/002341.htm
- Christian Gyrling, "Creating a character in Uncharted: Drake's Fortune" (slides): https://www.slideshare.net/naughty_dog/creating-a-character-in-uncharted-drakes-fortune
- nucl.ai 2016 talks (Delayen, Clavet), summarised: https://gamedeveloper.com/programming/most-inspiring-game-animation-tech-talks-of-2016
- Death Stranding developer Q&A, 505 Games, 21 Sep 2020: https://deathstrandingpc.505games.com/en/?p=7726
- Twelve basic principles of animation (Thomas and Johnston 1981): https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation
- Godot 4.7: `tutorials/export/exporting_for_web.rst`, `class_projectsettings.rst` (`audio/general/default_playback_type.web`), `class_audiostreamplayer3d.rst`, `class_lookatmodifier3d.rst`, `class_springbonesimulator3d.rst` at https://raw.githubusercontent.com/godotengine/godot-docs/4.7/ ; `platform/web/js/libs/library_godot_audio.js` at tag 4.7.2-stable

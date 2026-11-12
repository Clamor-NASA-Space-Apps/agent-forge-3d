---
version: alpha
name: Forge neutral
description: The factory's fallback style and template. Bevelled toy-like hard surfaces, one warm accent, soft daylight. Every project replaces it with its own DESIGN.md, made from the user's references.
colors:
  primary: "#e8772e"
  on-primary: "#1c1206"
  surface: "#16181b"
  surface-container: "#202328"
  on-surface: "#eceae4"
  on-surface-variant: "#b3b1aa"
  outline-variant: "#3d4147"
  danger: "#e5484d"
  body: "#e9e6de"
  trim: "#8d9196"
  accent: "#e8772e"
  metal: "#9aa1a8"
  glass: "#2c4a63"
  rock: "#8a6f58"
  light: "#ffd27a"
  sky: "#b9c6d2"
  ground: "#6f5e50"
typography:
  headline:
    fontFamily: Lexend
    fontSize: 28px
    fontWeight: 700
    lineHeight: 36px
  body:
    fontFamily: Lexend
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  label:
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
rounded:
  sm: 8px
  md: 16px
  full: 9999px
spacing:
  "1": 8px
  "2": 16px
  "3": 24px
  "4": 32px
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 48px
    padding: 0 24px
  card:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  alert:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
materials:
  body: { color: "{colors.body}", roughness: 0.55, metalness: 0 }
  trim: { color: "{colors.trim}", roughness: 0.6, metalness: 0 }
  accent: { color: "{colors.accent}", roughness: 0.45, metalness: 0 }
  metal: { color: "{colors.metal}", roughness: 0.35, metalness: 1 }
  glass: { color: "{colors.glass}", roughness: 0.1, metalness: 0 }
  rock: { color: "{colors.rock}", roughness: 0.95, metalness: 0, detail: { pattern: grain, size: 0.4, strength: 0.4 } }
  light: { color: "{colors.light}", roughness: 0.4, metalness: 0, emissive: 2 }
geometry:
  shading: smooth
  bevel: 0.05
  bevelSegments: 3
  human: 1.8
  door: 2.0
  budgets:
    prop: { tris: 4000, height: [0.1, 3] }
    building: { tris: 15000, height: [2, 12] }
    vehicle: { tris: 10000, height: [0.5, 4] }
    rock: { tris: 2000, height: [0.1, 5] }
lighting:
  sky: "{colors.sky}"
  ground: "{colors.ground}"
  sunColor: "#fff3e0"
  sun: 2.5
  ambient: 1.2
  elevation: 40
  azimuth: 35
  exposure: 1.0
  toneMapping: aces
  fog: { color: "{colors.sky}", near: 40, far: 160 }
quality:
  low: { msaa: 0, scale: 0.75, shadows: 0, glow: 0, lamps: 4, detail: off }
  medium: { msaa: 2, scale: 1, shadows: 2, shadowMap: 1024, glow: 0.5, detail: code }
  high: { msaa: 4, scale: 1, shadows: 4, shadowMap: 2048, glow: 0.5, detail: texture }
kit:
  "metal|steel|iron|chrome": metal
  "glass|window|screen": glass
  "rock|stone|dirt|sand": rock
  "light|lamp|emissive|glow": light
  "orange|red|accent|stripe": accent
  "dark|grey|gray|trim": trim
---

# DESIGN.md

The factory's neutral style. It exists so the forge always has tokens to read, and as the template a
project copies. **A real project never ships it:** its own DESIGN.md is written after the user has
shown reference images and picked one of three rendered variants.

The front matter is the normative part, in Google Labs' DESIGN.md format (`npx design.md lint`
checks it). The 3D keys (`materials`, `geometry`, `lighting`, `quality`, `kit`) are our extension; the linter
accepts them. This file is the only place a colour value may appear. The forge (`forge/lib.py`),
the browser (`runtime/house-style.js`) and the checker (`tools/style-check.mjs`) all read it.

## Overview

Mood: clean, friendly, readable at a glance. Toy-like hard surfaces with soft bevels, matte
materials, one warm accent, daylight from one sun. Nothing glossy except metal and glass.

**Reference board:** a project lists every image in `design/refs/` here, one line each: what we take
from it, what we avoid. The neutral style has no references.

## Colors

One palette serves the HUD and the 3D world, so the screen and the scene look like one product.

- `body`, `trim`: most of every model. Light and mid neutral.
- `accent`: the one warm highlight, at most about 10% of any model's surface. Also the HUD's `primary`.
- `metal`, `glass`, `rock`, `light`: what their names say. `light` is only for things that glow.
- `sky`, `ground`: the lighting rig and fog, never a model.
- `danger`: warnings in the HUD only. Never on a model, so red always means a problem.

## Typography

Lexend for everything (designed for easier reading). Headline 28, body 16, labels 14 at weight 600.

## Layout

8 px grid. Touch targets at least 48 px.

## Shapes

HUD cards at 16 px radius, buttons as pills.

## Components

`button`: accent pill, one per screen. `card`: dark surface, 16 px padding.

## Materials

The seven core roles every DESIGN.md must define, because probes and kit mapping use them: `body`,
`trim`, `accent`, `metal`, `glass`, `rock`, `light`. A project adds more if its references need them.
A recipe asks for a material by role name (`mat("body")`); a raw colour is an error.

A role may also say what its surface is made of. The engine lays it on by world position on meshes that
hold still, and by the mesh's own position on meshes that move, so it travels with them:
- `detail: { pattern, size, strength, texture, normal, roughness, textureSize }`. `pattern` is drawn by
  code: `grain`, `bricks`, `tiles` or `planks`, `size` metres per repeat (a number, or `[w, h]`),
  `strength` 0 to 1. `texture` is a photo beside this file, `textureSize` metres across, shown where a
  quality preset asks for it; `normal` (OpenGL convention) and `roughness` are the same set's other maps.
  Either one only shades the role's colour, light and dark, and the roughness map keeps the role's
  roughness as its average: the palette stays the palette.
- `opacity` (0 to 1, default 1): below 1 the role is see-through glass, alpha blended. Blended surfaces sort
  and cost more on a phone, so keep it to glass.
- `shadow: false`: the role only ever lies flat on the ground (a road, a lawn), so drawing it into the
  sun's shadow map would be work for nothing.
- `lit: { color, emissive, share, period }`: panes of this role light up one by one, `share` of them
  at any moment, each deciding again every `period` seconds. For windows at night.

## Quality

`quality` holds the presets a player can choose between, `low`, `medium` and `high`. A phone starts on
`low`, anything else on `high`. Each preset sets all of these, so switching leaves nothing behind:
- `msaa` (0, 2, 4, 8) and `scale` (the 3D picture's size as a share of the window): edges and pixels.
- `shadows` (0 for none, else the sun's splits: 1, 2 or 4) and `shadowMap` (pixels). Optional: `shadowRange`
  (metres of shadow, capped by the fog's far end), `shadowFilter` (0 hard to 5; 2 is 5 taps, 4 is 13) and
  `normalBias`. The near split is sized from the sun's elevation to hold a person's whole shadow
  (`lighting.shadowPad`, metres added for the camera, default 6): skills/shadows-and-grounding.
- `glow` (0 for none, else its strength) and `lamps` (how many lamps shine at once, the nearest ones).
- `detail`: `off`, `code` (each role's pattern) or `texture` (its photo, where it names one).

## Geometry & Proportions

- 1 unit = 1 metre. A person is 1.8 m, a door 2.0 m. Every model is checked against these in the lineup.
- Bevel width is 5% of a part's smallest side, 3 segments. Sharp edges look unfinished.
- Shading `smooth` (with weighted normals). `flat` gives a faceted low-poly look.
- Triangle and height budgets per asset class; a model's class is its file-name prefix
  (`building_*.glb`). Anything else counts as `prop`.

## Lighting & Camera

One sun at 40° elevation, warm white, with sky and ground fill. ACES tone mapping at exposure 1.
Light fog in the sky colour from 40 to 160 m. The same rig lights the forge previews and the game.

Optional `lighting` keys: `horizon` (the sky's colour at the horizon; else `sky`), `ambientColor` (the
shade's colour; a cool one keeps shadows from going muddy), `sunDisc` (the sun drawn in the sky, degrees
across, with a haze about ten times wider; 0 or absent draws none), `halo` (that haze: `color`, the sun's by
default; `size` in degrees; `strength`, 0.7 by default), `twilight` (a glow along the horizon toward `azimuth`,
the sun's by default, fading over `height` degrees: `color`, `strength`; it needs no disc, so a night can keep
the glow where the sun went down). `fog` also takes `density` (the most
fog anything gets, at `far`: 1 by default; a far hill wants 0.4 to 0.7), `curve` (above 1 keeps the
near ground clear), `sky` (how much fog covers the sky: low keeps its gradient) and `sun` (fog lit when
you look toward the sun).

## Kit adaptation

Models from kits keep their shapes and lose their colours. `kit` maps a material-name pattern to a
role; anything unmatched takes the nearest palette colour and logs a warning to fix the map.
Textured kit materials are kept as they are, with a warning; map one to `keep` when its textures are the point (an
official scan or model), which keeps it with no warning.

## Do's and Don'ts

Do ask for a material by role. Do check every new model in the lineup next to a 1.8 m person.
Do keep the accent rare.

Don't type a colour anywhere but this file. Don't add a light to a scene outside the rig. Don't use
`danger` on a model.

## Decided exceptions

None yet. A project records every deliberate deviation here, so nobody "fixes" it later.

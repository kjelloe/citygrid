# Ruling 033 — The painted look is the target

- **Date:** 2026-09-05
- **Source:** P37 — D0 "Higashiyama, painted" and D4 "yes, desktop tier", chosen from the options in `specs/engine/12-decisions.md`
- **Status:** ruled

## Question

fable51-worlds renders in two ways: Union Square is photographic (PBR, Canvas-generated
textures and normal maps, ACES, a sky and PMREM environment, Blender-generated GLB kits);
Higashiyama is painted (toon shading with tinted shadow bands, ink from depth, a split-tone
grade, no assets). Which does cityviewer match?

## Ruling

**Higashiyama.** cityviewer's target style is `painted`, made real:

- **Shading**: `MeshToonMaterial` with hand-authored ramps and the shader-chunk patch that
  tints the dark bands toward a cool colour instead of merely darkening them
  (`../fable51-worlds/kyoto-higashiyama/src/core/toon.js`). High-key ramps for anything pale
  that must stay pale in shade.
- **Rig**: a warm key quantised by the ramp, a strong cool fill from the opposite quarter that
  carries the whole shadow side, a violet up-light for undersides, a hemisphere with a violet
  ground. Shadow focus follows the camera target, snapped to a texel.
- **Finish**: ink from the **second difference of linearised depth**, a split-tone grade with a
  preset per time of day, FXAA. Desktop tier only, gated by V2's frame-time governor; on a
  phone the finish is off and the toon shading and rig stand on their own.
- **Palette**: its own entry in `palettes.js`, through the colour-vision test like the others.

`plain` stays the phone default and the fallback (022 is not overturned, it is extended: plain
ships on every device; painted ships where the device can afford it). `pixel` stays as the
seam it always was.

## Why

Kjell's choice, and the reasons hold up:

- **Cheapest.** No texture toolchain, no assets (036). A new building is still a function.
- **Closest to the pillar.** Art-direction §1.7 asks for a colourful miniature world, cosy and
  legible. A cel-shaded street with coloured shadows is that; a PBR street is a photograph of a
  model.
- **The ink does not fight detail.** Ruling 017 rejected a screen-space outline because a
  luminance Sobel fires on every window sill. A second difference of depth is flat across any
  plane at any angle and fires only on silhouettes and creases — convex strongly, concave
  faintly, which is the contact line an animator draws. It is a different instrument, and it
  is the one the probe never tried.
- **Legibility survives.** Toon bands keep every face bright enough to read its colour, which is
  what the overlays and the owner tints depend on; deep PBR shadow sides do not.

## Consequences

- Slices P1 (toon shading, rig, palette) and P2 (ink, grade, FXAA) in `plan-v1.md`. P1 lands
  before the street lane so facades are authored under the shading they ship with.
- The style gains three fields — `rig`, `shading`, `post` — and the baker and pools ask the style
  for their material; nothing else in the renderer knows which one it got.
- The ink pass needs a depth-texture render target (WebGL2, which the boot already requires)
  and three full-screen passes; the frame-time governor (V2, ruling 040) is a prerequisite.
- Ruling 017's order still holds: geometry, shading, palette, finish. A style that is only its
  finish is not a style.

## Enforced by

- `specs/engine/07-style-light-post.md` — the specification
- `client/render/styles.js`, `style-assets.js`, `style-light.js` — the seam (after P1)
- `tools/style-sheet.mjs` — three styles from one city, one seed, one camera, side by side
- `test/render.test.js` — the painted palette under protan, deutan and tritan simulation

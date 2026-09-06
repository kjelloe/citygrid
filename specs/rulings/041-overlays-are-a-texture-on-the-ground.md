# Ruling 041 — Overlays are a texture on the ground, never a layer floating over it

- **Date:** 2026-09-06
- **Source:** Q29, raised by slice V4 and reviewed after E3; `specs/plan.md` §6 said this in the first draft ("block maps as `DataTexture` blended in one shader pass") and the renderer never did it
- **Status:** ruled

## Question

With relief (038) every flat layer either follows the ground or floats. The zone tint became a
colour of the terrain mesh (V4). The overlay wash could not, because it is toggled at runtime
and repainting the mesh would rebuild every chunk on every switch — so it sits at the mean of
the tile's corners and grazes the slope. Is that the answer?

## Ruling

**No. An overlay is a `DataTexture`** — one byte per tile, the band — **sampled by world x/z
in the terrain material** through `onBeforeCompile`, and blended over the ground in the fragment
shader. **Over the lit result, not into the diffuse colour** (V7): mixed in before the light it is
shaded with the grass, and on the `hilly` fixture at a low pitch the darkest twentieth of the
ground separated adjacent bands by 25 in 8-bit RGB against E6's floor of 30 — a slope in shadow
turned amber and red into one colour. Over `outgoingLight` the separation is the palette's own gap
times the wash everywhere on the map, and the 45% of the ground that is left still shows its
shading. Toggling an overlay uploads `width × height` bytes and rebuilds nothing. The
wash follows any slope because it is the ground's colour for that frame. The per-band marks
(dot, bar, cross — never colour alone, art-direction §1.6) stay instanced, seated on
`heightAt`.

The same mechanism carries the territory overlay's patterns (hatch, dots, chevrons) as a second
byte, and it is the mechanism E5's marking strips do **not** use: a marking is geometry the
walker is tested against (A33), an overlay is information about a tile.

## Why

It is what the plan said; it was cheaper to write instanced quads on a flat map, and the map is
no longer flat. Measured on a saturated 128×128 the overlay pass is 24,000 quads plus three
mark pools every frame it is on; a texture is one upload on toggle and zero instances. And the
first-draft reason still holds: eleven overlays blended in one shader pass cannot depend on
which one is showing.

## Consequences

- Slice V7 in `workitems-cityviewer.md`: the texture, the shader patch in `makeMaterial` for
  the terrain material only, `updateInstances` loses the `ovl` pool, `bandAt` in
  `client/ui/overlays.js` fills the byte array, `a11y_smoke` re-checks legibility on a slope.
- The orthographic picture moves; V7 re-baselines the screenshot pair and fixes A32 (the
  portrait `tilePixels`) in the same slice, since both change it.
- `estimate` loses the overlay term; `budget_gate` runs one row with an overlay on.

## What it does not cover (V7)

The wash is the **terrain mesh's**. Baked street chunks — carriageway, kerb, pavement, verge — and
the baked facades carry their own materials and are not washed; the marks and the terrain under
them are what say which band a tile is in at street level. Nothing in the interface selects the
territory overlay, so `drawOptions.territory` is reachable only from a gate (**Q61**).

## Enforced by

- `specs/engine/05-ground-and-streets.md` §5.6 — the flat-layer table
- `test/overlay-texture.test.js` — the plane has one byte per tile, every value `bandAt` can return has a colour, and `PLANE_NONE` is a sentinel rather than a band index
- `test/chunks.test.js` — the territory flag salts `chunkHash`, so a toggle marks every baked chunk stale (A44)
- `tools/a11y_smoke.mjs` — three shots of one city differing only in the wash: adjacent bands 37 and 32 apart in the darkest twentieth of a shaded hillside, against a floor of 30
- `tools/play_smoke.mjs` — the overlay button is pressed and the screen is read: 6,042 of 7,540 sampled pixels move with the wash on, 0 keep it after it is switched off
- `tools/budget_gate.mjs` — an overlay adds 0 triangles, and the territory toggle rebakes 8 of 8 live chunks on, 0 while it stays on, 8 coming back off

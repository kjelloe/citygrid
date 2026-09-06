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
in the terrain material** through `onBeforeCompile`, and blended over the ground colour in the
fragment shader. Toggling an overlay uploads `width × height` bytes and rebuilds nothing. The
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

## Enforced by

- `specs/engine/05-ground-and-streets.md` §5.6 — the flat-layer table
- `test/render.test.js` — the overlay texture has one byte per tile and a band for every value `bandAt` can return (after V7)
- `tools/a11y_smoke.mjs` — overlay contrast on the `hilly` fixture (after V7)

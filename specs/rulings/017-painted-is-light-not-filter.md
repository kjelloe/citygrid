# Ruling 017 — A style is geometry, shading and palette; the filter is last

- **Date:** 2026-08-28
- **Source:** Kjell, on the first probe — "all three samples looked like low poly"
- **Status:** ruled

## Question

The three probe candidates were one set of box geometry with a different screen-space
post-process over each. Is a post-process a style?

## Ruling

**No.** A style owns four things, in this order of importance:

1. **Geometry** — what a building is actually shaped like.
2. **Shading** — lit, or baked into the vertices.
3. **Palette** — the colours the world is made from.
4. **Finish** — the post-process, which is the least of the four and is optional.

`painted` in particular carries **no post-process at all**. It is a low warm sun, a deep cool
fill and a richer palette.

## Why

The first three candidates were indistinguishable because they differed only in (4). The
criticism was immediate and correct.

There is also a technical reason `painted` cannot be a filter: a screen-space outline **fights
detailed geometry**. Once buildings had window grids, sills and roof clutter, nearly every pixel
sat on an edge, the edge test fired everywhere, and the image turned to mud — it read as dusk
rather than as illustration. The more detail the art gains, the worse an outline pass gets, which
is exactly backwards.

Lighting and palette do the work an illustration actually does. A warm key against a cool fill
gives a temperature split between lit and unlit faces, and that split is what separates a drawing
from a photograph.

## Consequences

- `client/render/style-assets.js` owns per-style palettes, materials and lighting;
  `client/render/building-kit.js` and `detail-kit.js` own geometry. `styles.js` is now only the
  finish, and two of the three styles do not use it.
- The `pixel` style is **unlit**: lighting produces smooth gradients across a face, which is the
  one thing pixel art does not have. Its face shading is baked into vertex colours instead.
- A style that wants a filter can still have one; it simply may not be the only thing it has.

## Enforced by

- `client/render/style-assets.js` — `PALETTES`, `makeMaterial`, `lightingFor`
- `tools/style-sheet.mjs` — renders all three from one city, one seed, one camera, side by side,
  so "are these actually different" is answerable in one glance

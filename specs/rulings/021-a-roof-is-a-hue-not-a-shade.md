# Ruling 021 — A roof is a hue, not a shade of the wall

- **Date:** 2026-08-28
- **Source:** P12 — *"Yes please split... into two instanced meshes (walls, roof) with independent colours"*
- **Status:** ruled

## Question

A building was one instanced mesh with one colour. Roofing was expressed as a
vertex-colour multiplier (`ROOF = 0.44`) on that colour. How does a house get a
terracotta roof over cream walls?

## Ruling

**It does not, until the roof is its own mesh.** Building geometry is built into
two buffers, walls and roof, and emitted as two instanced meshes sharing one
matrix per building and carrying independent instance colours.

Roof colours are their own palette per style, split two ways: houses draw from
tile and slate, everything else from the flat greys of felt and gravel. The pick
is deterministic from the building id, like its variant, so a roof never enters
game state.

## Why

A multiplier can only darken. `0.44 × cream` is brown, so a cream house got a
cream-brown roof and the whole building read as one lump — which is exactly what
the original comment on `ROOF` admitted it was working around. The reference
gets much of its charm from a *different hue* above the walls, and no
multiplier reaches a different hue.

The house/other split is doing more work than it looks. It is most of what tells
a terrace from an office block at a zoom where no other detail is legible.

Two colours were tried and rejected on sight:

- **Tan and brown house roofs.** On cream walls they landed close enough to the
  wall colour to undo the entire point of the split.
- **Full per-building colour scatter.** A roof colour is a *material* — tile,
  slate, felt — and materials vary less than paint does. At the scatter used for
  walls the terracottas slid into maroon. Roofs now vary at half that.

## Consequences

- One extra draw call per building variant per tier, not per building. Measured:
  40 draw calls where there were 27, and every zoom still inside the 80k budget
  (ruling 019).
- The territory overlay gives the roof a darkened owner colour rather than a
  tile colour, so ownership still reads at a glance.
- Anything else that wants its own colour — a door, a shopfront awning — now has
  a pattern to follow, and a cost to justify against it.

## Enforced by

- `client/render/building-kit.js` — `roofPart`, `finishBuilding`
- `client/render/instances.js` — the `_roof` pools and `roofColour`
- `client/render/palettes.js` — `roof.house` and `roof.flat` per style

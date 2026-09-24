# Ruling 043 — A corridor has one cross-section from end to end

- **Date:** 2026-09-24
- **Source:** T1b — the avenue's picture. A60 asked for a second road kind; T1a put the kind on the
  tile and T1b had to decide what a corridor is when the kind changes halfway along one.
- **Status:** ruled

## Question

`tiles.road` carries `NET_AVENUE` per TILE. A corridor (`client/world/corridors.js`) is a maximal
run of tiles between two nodes, and everything downstream measures the street from it: the ribbon's
half-width, the kerb, the pavement, a lot's frontage, the ground's flatten, the lane offsets, the
junction box. The deputy upgrades a run of `deputy.avenueTiles` either side of the busiest tile, so
an avenue very often starts and ends in the middle of a corridor.

Does a corridor take a width per TILE, a width by majority vote, or one width that forces a split?

## Ruling

**One cross-section per corridor, and a kind change splits it.** `half`, `frontage`, `lanes` and
`median` are fields on the corridor, taken from `road.avenue` in `data/cityviewer.json` when the run
is an avenue and from `road` when it is not. Where the kind changes mid-run, the first AVENUE tile
becomes a node of kind **`seam`** — degree 2, straight, not a junction — and the run becomes two
corridors that meet there. A corridor's kind is decided by its interior tiles, the ones it does not
share with the nodes at either end.

A NODE carries the half-width and frontage of the widest corridor at it, because the junction box,
the signal heads, the crossing bars and the ground's flatten all step out from a node's middle.

## Why

A width per tile is not expressible: a corridor is a polyline, its ribbon is built along the whole
of it, and a lot fronts the corridor rather than a tile. Ruling 030 already says a network is drawn
from its runs and never as a tile patch.

A majority vote is expressible and wrong. It hands a 300 m street one width for its whole length
because eight of its tiles are avenue, so the carriageway is drawn over its own kerbs at one end,
the pavement moves three metres, and the lots on the narrow half front a road that is not there. A
width the corridor does not have anywhere is worse than either width.

The split costs one node kind and gives every downstream consumer exactly what it already assumes —
that the number it read at the start of the run is true at the end of it.

## Consequences

- `nodeKind()` gains no case: a seam is found in a second pass, over avenue tiles with a
  differently-kinded neighbour, and only for the road layer.
- The lane graph joins the two sides of a seam with a **taper** `corridor.half` long, not a stop
  line: a seam is not a junction and the street runs through it, but the lane on the far side may be
  somewhere else across the width of the road. Lanes are mapped by index, and a lane the far side
  has spare is fed by the nearest lane on this one.
- The L3 kerbside trim is per END, so a seam takes no junction box and the kerb, the pavement and
  the median run through it.
- Anything that measured the road from `cfg.road.width` measured a STREET. Nine things did, and
  every one of them put something inside an avenue's carriageway — see the dev-log for T1b.
- T2's rail is the same structure with its own width (`deriveCorridors(state, "rail")`), and a level
  crossing is a node where two corridors of different LAYERS meet, which this ruling does not
  answer.

## Enforced by

- `specs/engine/04-city-model.md` §4.3, §4.6a — the specification
- `test/world.test.js` — an avenue is a wider corridor, a kind change is two of them, the seam node
  is the first avenue tile, and every node has a width
- `test/lanes.test.js` — two lanes each way at the offsets round the median, the junction rule, and
  the seam's taper, merge and diverge
- `tools/avenue_shots.mjs` — the picture, counting the avenue corridors and the two-lane links
  before it calls one an avenue

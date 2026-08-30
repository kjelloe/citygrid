# Ruling 030 — A network is drawn from its connection mask, never as a tile

- **Date:** 2026-08-31
- **Source:** P32's playtest — "just a dot on each tile"
- **Status:** ruled

## Question

Roads, wire and pipe all live one-per-tile in a typed array. How is a network
drawn so that a run of ten tiles reads as one thing?

## Ruling

**A network tile draws a hub at its centre plus an arm towards each neighbour
its own connection mask names**, each arm reaching exactly half a tile.

The mask is the low four bits of the tile, in `DIR4` order, maintained by the
reducer. The renderer reads it; it never re-derives adjacency by looking at
neighbours itself.

Half a tile is exact, not approximate: shorter leaves the gap this ruling
exists to close, longer overlaps at the join and doubles the colour there.

## Why

Wire and pipe each drew one square centred on the tile. That leaves a gap at
every tile boundary, so ten poles in a line read as **ten dots**, and a player
who had just drawn a power line could not tell whether anything had been placed.
Roads escaped it only because a road quad fills its whole tile.

The failure is invisible to every gate the project has. The pool counts are
right, the overlay is right, the simulation is right — the tiles *are*
connected. Only the picture disagrees, and only a person looking at it can say
so. That is why it is a ruling and not a bug fix: the next network will be
written by someone who has the same typed array and the same instinct.

Each network keeps its own silhouette. Borrowing the road's quad would make a
power line read as a road, which is a worse lie than a dotted one.

## Consequences

- Any future positional network — rail, transit, a second water tier — draws
  hub-and-arms from its mask. A tile-shaped patch is the defect, not the default.
- The mask is a rendering input. A reducer that stops maintaining it breaks the
  picture silently, so `test/utilities.test.js`'s mask assertions are load-bearing
  for the renderer as well as for the simulation.
- Arms are their own instance pool, sized for four per tile.

## Enforced by

- `test/render.test.js` — "wire and pipe are drawn joined, like roads", "an arm
  reaches exactly half a tile", "an isolated network tile still draws its hub"

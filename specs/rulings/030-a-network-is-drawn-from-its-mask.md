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

## Amendment, 2026-09-04 (P33) — one width, and a skirt

The playtest reported the dots again on the build that shipped this ruling.
Three reasons, all of them still this ruling's business:

**One width from end to end.** The hub was drawn wider than its arms (0.20
against 0.14). At city zoom the arm falls under a pixel and the hub does not, so
the run reads as a bead on a string — the same complaint, from a picture that
technically joins up. A ribbon is one width or it is dots.

**A skirt, not a flat quad.** The ground is a continuous surface whose corners
are the average of the four tiles meeting there; a flat layer drawn at its own
tile's height leaves a vertical step wherever two neighbours differ, and a
camera at 35° looks straight through it. Every ground layer that must read as
continuous — road, wire, pipe — hangs a skirt below its top face.

> **Superseded, 2026-09-05 (P35).** The skirt was right about the cause and
> expensive about the cure: twelve triangles a tile instead of two, 29,868 for
> the roads and 48,600 for the two ribbons on a saturated 96×96, which took the
> frame over its budget with the whole sacrifice ladder spent (ruling 019,
> amended). A **road is now a colour of the terrain mesh**, where it shares the
> ground's own corners and is seamless by construction at no cost at all. The
> **ribbons are quads again**: they are drawn well clear of the ground and that
> offset already carries a run across any step it crosses. The rule that
> survives is the diagnosis — a flat layer at its own tile's height does not
> meet its neighbour — and the cheapest cure is to stop being a separate layer.

**Above the road, not under it.** Both networks were drawn below the road
surface, so a run crossing a street broke in two. Realism says a water main goes
under the tarmac; the picture has to say the run continues.

## Consequences

- Any future positional network — rail, transit, a second water tier — draws
  hub-and-arms from its mask. A tile-shaped patch is the defect, not the default.
- The mask is a rendering input. A reducer that stops maintaining it breaks the
  picture silently, so `test/utilities.test.js`'s mask assertions are load-bearing
  for the renderer as well as for the simulation.
- Arms are their own instance pool, sized for four per tile.
- Hub and arm share a width; the two networks differ from each other by width
  and colour, never by the hub being fatter than its own run.

## Enforced by

- `test/render.test.js` — "wire and pipe are drawn joined, like roads", "an arm
  reaches exactly half a tile", "an isolated network tile still draws its hub",
  "a network ribbon is one width from end to end", "wire and pipe cross a road
  instead of vanishing under it", "a road tile has a skirt, so an elevation step
  is not a green seam"

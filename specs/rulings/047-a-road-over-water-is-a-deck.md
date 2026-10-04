# Ruling 047 — A road over water is a deck, and the ground under it is still the river

- **Date:** 2026-10-03
- **Source:** S13 — the bridge. A84 (Q104) took the expensive option over Q58's causeway, and A111
  re-scoped the slice when H7's played fixture turned out to contain ten road tiles standing on
  shallow water: the crossings already existed, the deck did not.
- **Status:** ruled

*Specified by `specs/engine/05-ground-and-streets.md` §5.5 and `specs/engine/04-city-model.md` §4.2.*

## Question

A road may cross water — `placeNetwork` has always allowed it and `build.roadOverWater` has always
been charged for it. What height is it at, and what is underneath?

Q58 answered "the water's surface", which is a causeway. It is cheap, it needs no new geometry, and
it has three consequences nobody chose: the bank is a 0.72 m step the walker cannot climb (939
refusals in one `walkthrough` run), the carriageway sits at the waterline, and nothing can pass
under it. A84 overruled it.

## Ruling

**Two height questions, not one.** `heightAt(x, z)` answers what a ROAD stands on, and over water
that is the water's level plus `road.deckClearance`. `heightAt(x, z, false)` answers what the
GROUND does, which under a deck is still the riverbed.

Everything that belongs to the street takes the first: the corridor profile, the lane graph, the
ribbons, the props, the walker's floor. Exactly three readers take the second, all of them through
`cornerHeightAt` — the terrain mesh, the overlay quads and the camera's ground orbit.

**The clearance is measured to the girder, not to the surface it carries.** `deckClearance` (5 m) is
the deck's own surface over the water; `deckDepth` (1 m) is the structure hanging under it, drawn by
`skirt` with a depth per point. What passes beneath has the difference, and the difference is chosen
from the tallest hull in the city: the ferry's 3.4 m.

**A span, and an end on dry land.** `build.bridgeSpan` is 6 tiles — 120 m, a river rather than a
lake — and `crossingRefusal` refuses a run longer than that, a run that starts or ends on water, and
a diagonal hop across it. Road layer only: the wire and the pipe cross water routinely, and the
first cut of this rule applied to every layer and stopped the deputy building anything at all.

## Why

**The ramp falls out of the grade machinery.** The deck is not a special case in `gradeProfile` or
`relaxNodes`: it is a different answer from the function they sample. Both already respect
`road.maxGrade`, so an approach comes out at 33 m on each bank at 15% with no new code, and S11's
junction relaxation applies to a bridge's junctions for free.

**A deck in the corner table is an embankment.** The terrain mesh samples the same field, so with
one answer for both questions a crossing became a wall of earth with the river inside it. Measured
on an avenue (a street's half-width plus its blend is 8 m and the nearest mesh corner is 10, so a
street crossing cannot see this at all): **0.206 m** of lift on every mesh corner in the channel,
and the invariant that pins it is not a threshold but an identity — the terrain under a bridge is
the terrain of the same channel with no bridge over it.

**The parts nobody would have looked for.** Two of the four defects in this slice were in code that
had nothing to do with heights: `computeTile` painted the riverbed `palette.road` because the tile
carries a road, and `skirt` could only hang one depth for a whole run, which drags a girder across
the dry land either side. Both are invisible in a green suite and both are in the first screenshot.

## Consequences

- **A balance era of its own (24),** because the deputy crosses rivers now: `buildBlockAlong` spans
  water when it can reach the far bank, and the span does not count against the block's length,
  because a bridge is not street. A water tile is exempt from the step-along-the-run slope rule
  (J3) — a water tile's elevation is its BED, so every river was a cliff to that rule, which is
  why the deputy had never crossed one.
- **The gate city carries a bridge on purpose.** `saturatedCity` lays one crossing through the
  reducer after the play (`bridge: false` is the before-and-after lever, and `walkthrough`'s fourth
  argument is `nobridge`). It has to: the deputy meets water fifteen times in a twenty-year city
  and a building on the far bank refused all five attempts, so **no city any renderer gate measured
  contained one road tile on water**, and a deck nothing looks at is a deck nobody can see a defect
  in. The recipe throws if no bridge could be laid.
- **`walkthrough` counts the decks it walked** — 1,356 steps over 15 legs on a played 96 — and fails
  if the city has a crossing and the walk never set foot on one. Its three crossing counters are
  failure counters and all three read 0 in a bridgeless city, which is how a causeway shipped for
  five slices with a gate pointed at it.
- **The deck is the one road surface that is geometry.** Every other road is a colour of the terrain
  mesh (N30), and under a deck the terrain is the riverbed — so a crossing had centre markings
  floating over open water with nothing beneath them, at every zoom, until a `deck` pool was added
  (one box a tile, carriageway plus pavements across, `deckDepth` thick). It is priced in the LOD
  estimate and counted in the census, and it moves `client_smoke`'s draw-call ceiling 73 → 74.
- **Four scripted cities laid no road at all.** A run spanning more than the span is refused WHOLE,
  and the middle row of seed 1003 crosses twenty-seven tiles of river: `budget_gate`, `a11y_smoke`,
  `play_smoke` and `shoot.html` all laid one command across the map. They lay one command per dry
  stretch now, and `budget_gate` checks the result before measuring anything on it.
- The hulls move from `instances.js` into `data/cityviewer.json`, because a clearance and the thing
  it is a clearance for cannot live where no test can compare them.
- Unchanged: the walker still drowns off the deck, and `water.wade` is still the paddle at the edge.
- Open: **Q143** — should the deputy SEEK a crossing, the way it seeks a rail line, rather than
  bridging only where a block happens to meet a river?

## Enforced by

- `test/build.test.js` — a run from bank to bank is accepted and charged at the water price; a run
  that ends ON the water is refused; a span longer than `build.bridgeSpan` is refused and one
  exactly at it is accepted
- `test/water.test.js` — mid-channel the road is a deck `road.deckClearance` over the surface and
  the lake beside it is not; the terrain under the deck is the terrain of the same channel with no
  bridge over it, to within a nanometre; and the walker crosses the whole span with nothing refused
  and nothing drowned
- `test/collision.test.js` — the deck is a floor and a step off it is not (was the causeway's test)
- `test/lanes.test.js` — the crossing is ONE corridor, and no lane sample over the water is at the
  waterline
- `test/ribbon.test.js` — `skirt` hangs a different depth at every point, and the deep part is only
  under the points that asked for it
- `test/ground-colour.test.js` — a bridge tile is not `palette.road`, and the road beside it is
- `test/boats.test.js` — the tallest hull in the city fits under the girder
- `tools/walkthrough.mjs` — walks the decks and fails if a city with a crossing in it never put a
  foot on one

## The picture

`reports/smoke-S13-bridge.png` — from the bank, from the deck, and from the water under it.

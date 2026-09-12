# Ruling 019 — The triangle budget is measured, not estimated

- **Date:** 2026-08-28
- **Source:** P10 — *"go ahead with N1, but do make the budget configurable for the LOD system i.e start at 80k"*
- **Status:** ruled

## Question

The renderer needs a triangle budget. Is it spent against a cost model of what a
frame will contain, or against what the renderer reports having actually drawn?

## Ruling

**Configurable, and enforced by measurement.** `setBudget(triangles)` sets it,
default 80,000, and a phone, a debug view or the perf harness can each ask for a
different one.

`choosePlan` still estimates, because an estimate is cheap and is usually right.
But `draw()` renders, reads `renderer.info.render.triangles`, and if that is over
budget it steps down the sacrifice ladder and renders again.

Two gates decide the plan. **Resolvability** drops detail nobody can see whatever
the budget allows — below 42 pixels a tile there are no props, below 20 no road
markings, below 13 a building is a box. Drawing a window sill smaller than a
pixel is not a trade-off, it is waste. **Budget** then walks a fixed ladder:
props, markings, poles, shadows, building detail, tree detail, silhouettes,
trees.

## Why

The cost model was wrong four times in a row, and each fix revealed the next
error:

| What the model missed | Size of the error |
| --- | --- |
| the shadow pass redraws every caster | actual was 2× the estimate |
| `triangleCount` ignored the index buffer | undercounted every indexed mesh |
| terrain chunks are frustum-culled | charged 49k for ground never drawn |
| a tier-0 tree was priced at zero | 18,220 triangles, invisible to the budget |

Every one of those was plausible when written. The renderer's own counter cannot
be.

After the last fix the estimate tracks within about 10% and the correction loop
never fires in practice — `rebuilds=0` at every zoom. The loop stays anyway. It
costs one extra render on a frame that would otherwise have been over budget,
and nothing at all on a frame that would not.

## Consequences

- Measured on a saturated 128×128 sixteen-seat region, 25 years, plain:

  | span | tile px | triangles | plan |
  | --- | --- | --- | --- |
  | 12 | 60 | 19,442 | props dropped for budget |
  | 25 | 29 | 61,164 | detail not resolvable |
  | 40 | 18 | 54,354 | silhouettes only for budget |
  | 70 | 10 | 68,152 | trees dropped for budget |
  | 100 | 7 | 68,980 | buildings only |
  | 180 | 5 | 68,980 | buildings only |

- **The ladder has a bottom.** Terrain and roads are not optional and have no
  tiers, so a fully built 128×128 region cannot be drawn for less than about
  74,000 triangles however far detail is stripped. Below that the plan reports
  `overBudget: true` rather than pretending. That is why the default is 80k and
  not 40k, and it makes a terrain LOD the obvious next lever if the budget ever
  has to go lower.
- Any future cost added to a frame must be priced in `DEFAULT_COSTS` *and*
  measured, or it will be spent without being counted — which is exactly how the
  tier-0 tree hid 18,220 triangles.

## Amendment, 2026-09-05 (P35) — the ground is measured too, and shadows are not counted at all

The rule above ("priced *and* measured") was written and then not applied to the
ground. Buildings and trees have been measured by `createInstances` since N1;
roads, markings, poles and props were remembered constants, and wire and pipe
had no price at all. N28 turned a road from a two-triangle quad into a
twelve-triangle skirted box, and the table still read `road: 2, // one upward
quad`.

Measured on a saturated 96×96: the planner believed **79,068** triangles while
three drew **97,500**, over an 80,000 budget with the entire sacrifice ladder
already spent. A saturated city therefore rendered with no trees and no markings
and was over budget anyway. Eleven browser gates were green.

Three corrections, each measured rather than argued:

1. **The ground is measured.** `createInstances` now passes the real triangle
   count of every ground pool — markings, poles, both network ribbons, and the
   average prop — into `setCosts`, alongside buildings and trees.
2. **A road costs nothing**, because it is painted into the terrain mesh
   (slice N30). The floor below is 29,868 triangles lighter on that map.
3. **Casters count once, not twice.** The doubling for the shadow pass was
   correct when it was written; it is not now. Toggling `shadowMap.enabled` on
   the real page moves `renderer.info.render.triangles` by **exactly zero** —
   three resets the counter after the shadow pass — and that counter is what
   this ruling defines the budget to be. Charging twice against a measurement
   that only counts once put the estimate 92% over the truth at close zoom, and
   the ladder dropped the props the player had zoomed in to look at.

After all three, the estimate tracks the truth within **1–5%** across four zooms
on a saturated city, against 38–92% before.

**The correction loop only steps DOWN**, and that is why an over-charging model
is as damaging as an under-charging one: the frame silently loses detail it had
room for and nothing ever gives it back. Neither direction was visible to any
test, because nothing compared the two numbers. `tools/budget_gate.mjs` does,
and it is the gate this ruling was missing.

## Amendment, 2026-09-12 (B4) — the street-chunk rung is taken until one chunk is left

The ladder's first rung dropped **one** baked street chunk and moved on. At street level on the
64-tile played city (seed 1003, forty years, High) one chunk was **38,700** triangles and every rung
after it together — props, cars, people, markings, poles, networks, shadows, building detail,
trees — came to **25,000**. So the frame kept six chunks and gave up every car and every person in
the street to save a fifth of what a second chunk would have: no street-level screenshot this
project had taken contained a moving car, and B4's own gate (a street at rush) could not be met.

`stepDown` now stays on a rung while it can still give (`AGAIN` in `client/render/lod.js`), and the
only such rung is the street chunks, down to `KEEP_STREET_CHUNKS = 1` — the chunk the camera stands
in is never given up (S1b). The order is unchanged: every chunk the rung is willing to give goes
before the props, because on the frames that have chunks at all a chunk outweighs the rest of the
ladder. Measured on the B4 shot: 7 live chunks and 0 cars (296,706 triangles) became 2 live chunks
and the street's traffic drawn (387,818 of 400,000).

**A consequence found the same day:** the cache chose which chunks carry furniture from the chunks
the budget let in, and the flag is part of a chunk's hash — so a frame squeezed below three chunks
rebaked chunks it had kept. `street-chunks.js` now ranks furniture by distance alone.

## Amendment, 2026-09-12 (B7) — a street-chunk count the plan refused is not asked for again at the same view

The estimate charges the chunks that are baked, so it can only price a chunk while it is baked.
On `budget_gate`'s street view that made the ninth chunk flicker, logged draw by draw: baked, the
estimate came to about 405,000 and shed it; after the cache's two-second grace it was evicted;
charging eight, the estimate came to 380,134 and asked for it back; rebake — every two seconds
with the camera and the city standing still. The gate's "settles with nothing changing" check had
been failing intermittently since B4 and every run once B7's crowd added to the frame.

`createChunkCeiling` in `client/render/lod.js` is the hysteresis: when a plan, estimated or
measured, sheds street chunks at a view, the count it settled on is the ceiling until the view
(camera position and rotation, canvas), the budget or the world changes. The shed made while the
chunk could be priced is the informed answer, and a still camera keeps it. Measured after: the
territory toggle rebakes 8, 0 while held, 8 back; the night frame is "full" at 295,859 of 400,000.

A price-ahead estimate — charging the chunks the plan would hold rather than those baked — was
tried first and reverted: some chunks the plan wants in view never bake, and the close zoom's
estimate went 56–171% over what was drawn.

## Also enforced by

- `tools/budget_gate.mjs` — a saturated city at four zooms: the frame is inside
  its budget, and the estimate is within 25% of what three actually drew
- `test/lod.test.js` — "the estimate charges for every network the renderer
  draws", "a junction's markings are counted, not assumed to be one", "the
  estimate does NOT charge twice for a shadowed caster"
- `test/render.test.js` — "the triangle budget is spent against MEASURED ground
  costs"

## Enforced by

- `client/render/lod.js` — `setBudget`, `estimate`, `stepDown`, the ladder
- `client/render/scene.js` — the render-measure-step loop in `draw()`
- `test/lod.test.js` — the order of sacrifice, the floor, the shadow doubling, and the street rung
  shedding chunks down to one before anything else goes, and the ceiling holding a refused count
  at one view and forgetting it at the next

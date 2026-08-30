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

## Enforced by

- `client/render/lod.js` — `setBudget`, `estimate`, `stepDown`, the ladder
- `client/render/scene.js` — the render-measure-step loop in `draw()`
- `test/lod.test.js` — the order of sacrifice, the floor, the shadow doubling

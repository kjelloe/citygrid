# Ruling 040 — The quality tier changes rendering only, never the simulation

- **Date:** 2026-09-05
- **Source:** P36 asked for Low, Medium and High settings and raised Q26; `specs/engine/08-camera-lod-budget.md` §8.3 specifies the tiers on that assumption, accepted with P37
- **Status:** ruled

## Question

`createRenderer` already takes `pixelRatio`, `antialias`, `shadowMap`, `triangleBudget`,
`trees`, `props` and `shadows`, and nothing sets them; `deviceClass()` has been unused since
N12. A Low / Medium / High setting is mostly wiring. What is it allowed to change?

## Ruling

**Rendering, and only rendering.** A tier sets the triangle budget, the pixel ratio,
antialiasing, the shadow map and whether shadows draw, the street-level chunk radius, the car
and pedestrian caps, and which post passes may run. It never touches map size, worldgen,
traffic sampling or anything in `engine/`. The tier is a client preference stored locally, like
the style (013), and defaults from `deviceClass()`.

Two instruments, because a phone is fill-rate bound and a triangle budget cannot see fill:

1. the measured triangle budget and its ladder (019), per tier;
2. a **frame-time governor**: a rolling p95 frame time; if it exceeds the tier's target for a
   second, the most expensive optional pass is disabled in a fixed order — ink, then shadows,
   then supersample — and the choice is remembered for the session.

| Tier | Budget | Street chunks | Cars | Shadows | Post |
|---|---|---|---|---|---|
| Low | 40k | none | 60 | off | none |
| Medium | 80k | 4, day only | 200 | soft | pixel only |
| High | 200k | 9 | uncapped | soft, following frustum | any |

## Why

A tier that changed the simulation would be hashed state, and in a shared region two players
on different tiers would desync on the first month tick. That is the whole of the argument and
it is why Q26's assumption was always the answer.

The governor exists because the painted finish (033) is three full-screen passes and a depth
read, invisible to `renderer.info.render.triangles`. Without it a phone on Medium would meet
its budget and miss its frame rate, and the budget gate would be green.

## Consequences

- Slice V2, unchanged in scope; it is a prerequisite for V1 (caps), P2 (governor) and E5
  (chunk radius).
- `budget_gate.mjs` runs at all three tiers and both projections.
- Map size advice (011) stays where it is, driven by `deviceClass()` and not by the tier.

## Enforced by

- `specs/engine/08-camera-lod-budget.md` §8.3 — the tiers
- `client/ui/settings-model.js` — the tier is a local preference (after V2)
- `test/purity.test.js` — no tier value reaches `engine/`
- `tools/budget_gate.mjs` — three tiers, two projections

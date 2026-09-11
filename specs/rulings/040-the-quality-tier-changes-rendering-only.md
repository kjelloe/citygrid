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
   second, the most expensive optional pass is disabled in a fixed order — pixel, then ink, then
   shadows, then supersample (`pixel` added in R1.4) — and the choice is remembered for the
   session. The target must sit **above** the refresh interval the tier aims at; see the 2026-09-08
   amendment below for what happens when it does not.

| Tier | Budget | Frame target | Street chunks | Cars | Shadows | Post |
|---|---|---|---|---|---|---|
| Low | 40k | 40 ms | none | 60 | off | none |
| Medium | 140k | 40 ms | 4 | 200 | soft | pixel only |
| High | 400k (320k until S10) | 20 ms | 9 | uncapped | soft, following frustum | any |

*Amended 2026-09-06 (slice E5, Q37 → A35): the budgets were a V2 prediction made before L3
existed. Nine chunks of real facade measured 200k on their own, so High went 200k → 320k and
Medium 80k → 140k. `data/cityviewer.json` is the source; this table mirrors it.*

*Amended again 2026-09-08 (slice D5, on the first real-device card — Kjell's RTX 4090,
`reports/perf/desktop-4090.json`, commit `2f26532`).* **The frame target is a threshold with
headroom, not the refresh interval.** It was the interval: 16 ms at High against the 16.666 ms a
60 Hz display actually delivers, and 33 at Low and Medium against 33.33 at 30 Hz. `p95 <= target`
was therefore false forever on any machine locked to its refresh rate, and the governor spent its
entire ladder four seconds after the city loaded — on a 4090 holding a flat 16.7 ms across all
nine sweep steps. Silently, because the picture degraded while the frame time stayed perfect.
Now 20 ms and 40 ms: 60 fps and 30 fps with a fifth of a frame of room each, and one interval
late still costs a pass. **The budgets in this table are still a SwiftShader-era prediction at
one end** — no phone has produced a card, so Medium and Low have never been measured on a device
that struggles (`workitems-measurement.md` D2, D3).

*Amended a third time 2026-09-11 (review after S1, A72, on Kjell's second 4090 card —
`reports/perf/desktop-4090.json`, build `167b733c86ca`).* **High's budget is 400,000**, not
320,000. The card drew 289,086 triangles at a flat 16.7 ms p50 with the governor idle, so the
320k figure — measured on SwiftShader in E5 — was holding the world lane's detail below what the
one real device can draw. `data/cityviewer.json` and this table change together; Medium and Low
are untouched until a phone card exists (D2), and the next desktop card re-checks that 400k still
sits under the 20 ms target — the only way a budget may move again. Built in S10.

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

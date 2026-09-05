# Ruling 032 — cityviewer rebuilds the renderer to the fable51 standard, behind the same interface

- **Date:** 2026-09-05
- **Source:** P37 — "The point is to upgrade and change citygrids renderer to match that of fable51-worlds"; name "cityviewer" from the same prompt
- **Status:** ruled

## Question

P36 asked for a city closer to the Transport Worlds reference. P37 raised the bar: the
renderer should match what `../fable51-worlds/` does — a place you can stand in, not a tile
diorama. Is that a lane of improvements to `client/render/`, or a new renderer?

## Ruling

**A new renderer, built in place, behind the interface the game already calls.** It is named
**cityviewer** and it is two directories: `client/world/`, a pure derived city model over
`state` (frame, height function, corridors, lots and frontages, lane graph, nav graph, building
parameters), and `client/render/`, rebuilt to draw that model at four fidelity levels. The
specification is `specs/engine/`, thirteen documents, and the slices are the E-, V- and
P-series lane in `plan-v1.md`.

Three things do not move:

1. `engine/`, `shared/`, the hash, the save and the wire. Every structure cityviewer builds is a
   pure function of state plus a per-tile or per-id hash, thrown away and rebuilt at will
   (`instances.js` already does this for variants, roof hues and parked cars).
2. The `createRenderer` interface `game.js` and every gate call: `draw`, `resize`,
   `worldChanged`, `showGhost`, `showGhostTiles`, `hideGhost`, `stats`, `setBudget`, `dispose`.
   The old renderer keeps running until a slice replaces the piece it is drawing.
3. The renderer's promises: it never writes state (CLAUDE.md non-negotiable 6), the budget is
   measured (019), sixteen owner colours and eleven overlays stay legible (art-direction §1.5),
   and every constant it reads comes through `client/constants-mirror.js`.

`client/world/` imports no three.js and is tested by `node --test` like `engine/` is.

## Why

The two fable51 worlds prove the target is reachable in a browser on three.js alone: Union
Square is 453 footprints, 129 storefronts, 220 pedestrians and 109 vehicles at 57–89 fps;
Higashiyama is a 2.3 km walkable route with no binary assets and a handful of draw calls per
district. What they have that City Grid does not is one layer — the world model between the
data and the meshes — and both build everything else from it. Polishing the current renderer
would rebuild that layer piecemeal inside `instances.js`, which is already 532 lines and reads
raw tile arrays in eleven places.

Behind the same interface, because the gates are the project's memory: `client_smoke`,
`play_smoke`, `ui_smoke`, `budget_gate` and `mvp_acceptance` all drive the real page through
`game.js`, and a renderer that changed the calling convention would take every one of them
red at once.

## Consequences

- `specs/engine/` is the design of record for cityviewer; `specs/plan.md` §6 defers to it.
- The E-series slices (E0 model, E1 lane graph, E2 baker, E3 ribbons, E4 street camera,
  E5 facades, E6 time of day, E7 pedestrians) join V1–V6 and P1–P2 in `plan-v1.md`.
- E0's gate is pixel identity: the model feeds the existing renderer and the picture does not
  change. Anything else means the derivation is wrong.
- Rulings 033–040 settle the choices the specification depended on.

## Enforced by

- `specs/engine/03-architecture.md` — what is kept and what is replaced
- `test/render.test.js` — the constants mirror still matches the engine
- `test/purity.test.js`, `test/subset.test.js` — `engine/` and `shared/` are untouched
- `tools/client_smoke.mjs`, `tools/play_smoke.mjs`, `tools/budget_gate.mjs` — the interface
  survives every slice

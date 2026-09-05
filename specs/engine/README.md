# cityviewer — rebuilding City Grid's renderer to match fable51-worlds

*Written 2026-09-05 from a read of `../fable51-worlds/` (Union Square, Higashiyama) and this
repo at commit `9894840` ("the city you can zoom into" lane, P36). Nothing here is built. The
decisions are collected in `12-decisions.md` and ruled in `specs/rulings/032`-`040`.*

**cityviewer** is the name for the whole of the rebuilt renderer: the derived city model in
`client/world/` and the drawing code in `client/render/`. It is a name for the seam, not a
package; nothing else consumes it yet (ruling 032).

## The goal in one paragraph

City Grid's renderer today is a tile diorama: an orthographic camera, two triangles a tile,
four instanced box variants per zone, flat colour. fable51-worlds renders the same kind of
data - streets, lots, buildings, props, traffic - as a place you stand in: a perspective
camera at eye height, ground that has a height, roads with kerbs, buildings with openings,
signs, moving cars, time of day, and a chosen look (photographic in Union Square, painted in
Higashiyama). The goal is to **replace City Grid's `client/render/` with a renderer of that
kind**, keeping everything above it (the pure engine, the hashed state, the HUD, the gates)
and everything the renderer promised (never writes state, measured budget, sixteen owner
colours, overlays). The fable51 worlds are the reference implementation; City Grid's state is
the data; this set of documents is the specification of cityviewer, the renderer in between.

## How to read this

| File | What it settles |
|---|---|
| `01-what-exists.md` | Inventory: the reusable parts of both fable51 worlds and of City Grid, and how they line up |
| `02-constraints.md` | City Grid's rules as they bind an engine (no build step, three r169, hash, budget, camera ruling) |
| `03-architecture.md` | The layers, the seam, and what stays derived |
| `04-city-model.md` | The derived model: frame, ground, corridors, lots, frontages, lane graph, life inputs |
| `05-ground-and-streets.md` | Terrain relief and blending, corridors, ribbons, kerbs, markings, water |
| `06-buildings-and-kit.md` | Kit levels from box to facade, plots, the baker, materials without binary assets |
| `07-style-light-post.md` | The style seam extended: rigs, toon and ink, time of day, sky |
| `08-camera-lod-budget.md` | City, tilt and street cameras; one LOD policy for orthographic and perspective; the budget |
| `09-life.md` | Traffic from `state.tiles.traffic`, pedestrians later; what is and is not deterministic |
| `10-qa.md` | Gates: capture, perf, walkthrough, budget, style sheet |
| `11-roadmap.md` | Slices, sizes, order; how they map onto V1-V6 |
| `12-decisions.md` | The questions only the owner can answer, each with options and a recommendation |

## What this is not

- Not a merge of the three codebases. Union Square is Vite + TypeScript + three r185 with 206
  GLB modules; Higashiyama is Vite + JS + three r180 with no binary assets; City Grid is
  no-build ES modules on a vendored three r169. The engine is specified against City Grid's
  stack, and fable51-worlds is the reference implementation of the patterns.
- Not a change to any rule, number or hash in City Grid. Every structure described here is
  derived from state by a pure function and a per-tile hash, and can be thrown away and
  rebuilt. That is the same discipline `client/render/instances.js` already uses for
  variants, roof colours and parked cars.
- Not an incremental polish of the current renderer. The current one is kept running behind
  the same `createRenderer` interface (`draw`, `resize`, `worldChanged`, ghosts, `stats`) while
  the new one is built beside it, so `game.js` and every gate keep working until the switch.

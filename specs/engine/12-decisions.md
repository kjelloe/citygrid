# 12 - Decisions

Each of these changes what gets built. Recommendation first.

**All settled 2026-09-05 by Kjell (P37), and ruled:**

| Decision | Choice | Ruling |
|---|---|---|
| D0 look | (a) Higashiyama, painted | 033 |
| D1 where | inside City Grid, behind `createRenderer` | 032 |
| D2 tile | 20 m | 035 |
| D3 camera | (b) perspective play camera, orthographic kept for the phone | 034 (amends 006) |
| D4 painted real | yes, desktop tier | 033 |
| D5 assets | (a) none, all procedural | 036 |
| D6 traffic | (b) local car-following | 037 |
| D7 relief | 0.5 m per elevation step; perspective per D3 | 038 |
| D8 addons | (a) hand-roll | 039 |
| D9 name | **cityviewer** | 032 |
| Q26 tier | rendering only, never the simulation | 040 |

The sections below are kept as the record of the options considered.

## D0 - Which fable51 look is the target

The two worlds render the same kind of data in two different ways, and the choice decides the
material system, the post pipeline, the asset policy and the mobile story:

- **(a) Higashiyama - painted** (recommended for City Grid): toon shading with tinted shadow
  bands, ink from depth, a split-tone grade, no binary assets, Canvas2D signage. Cheapest to
  produce, closest to the "colourful miniature world" pillar in the design, and the ink is the
  finish that does not fight detail. Costs three post passes, so it is a desktop-tier finish
  with a plain fallback.
- (b) Union Square - photographic: PBR materials with Canvas-generated textures and normal
  maps, ACES tone mapping, a sky and PMREM environment, GLB module kits generated offline with
  Blender. The most "real" and the most expensive: a toolchain, megabytes of precache, and the
  hardest to keep legible under sixteen owner colours and eleven overlays.
- (c) Hybrid: Higashiyama's construction (height function, corridors, plots, baker, kit
  levels) under City Grid's existing plain palette and soft rig, with the painted finish as
  an optional style. Least art risk; the street still reads as a plain diorama at eye height.

## D1 - Where the engine lives

**Settled by the brief: inside City Grid.** `client/world/` for the model, `client/render/`
rebuilt in place behind the existing `createRenderer` interface; these docs move to
`citygrid/specs/engine/` and each decision here becomes a ruling.

## D2 - Metres per tile

16, **20** (recommended), 24 or 32. See 04.1. It fixes road width, lot size, house size and the
L3 threshold, and it should be chosen before E0 because every later number is in metres.

## D3 - The camera the game is played from

The renderer target is fable51's, but the game is still a builder played on a phone. Ruling
006 (four snapped yaws, orthographic) was made for that, and matching fable51 reopens it:

- (a) Keep the orthographic city camera as the play camera; tilt and street are views you
  visit. Least disruption to input, picking and the LOD policy.
- **(b) Perspective becomes the play camera** (recommended if "match fable51" is literal):
  free orbit with the four snapped yaws kept as keys, zoom from aerial to eye height on one
  continuous ray, street mode when the eye reaches the pavement. Picking, `pixelsToTiles` and
  the LOD's tile size all become per-chunk (08.2). Orthographic stays as an option for the
  phone.
- (c) Perspective only, orthographic removed. Cleanest, and it breaks ruling 006's promise that
  mobile and desktop see the same thing.

## D4 - Make `painted` real

- (a) No: plain ships, `painted` stays a lighting preset, no toon, no ink. Zero art cost.
- **(b) Yes, desktop only** (recommended if any second style is ever wanted): toon shading plus
  the depth-based ink, gated by tier. It is the one finish that the probe's objection (outlines
  fight detail) does not apply to, and it is what makes the eye-height street read as
  illustrated rather than as low-poly.
- (c) Yes, and on mobile at reduced resolution. The ink pass at 0.5× resolution loses the thin
  lines it exists for; not worth it.

## D5 - Binary assets

- **(a) None** (recommended): procedural geometry, Canvas2D textures, emissive buckets. Zero
  toolchain, precache stays small, Higashiyama proves the ceiling is high enough.
- (b) Offline-generated GLB modules (Blender-as-a-library, as Union Square): richer windows,
  columns, vehicles; needs `GLTFLoader` vendored, a Python + Blender toolchain in `tools/`, and
  the precache grows by megabytes.

## D6 - Traffic determinism

- (a) Hashed time: no local state, identical on every client, cars never queue.
- **(b) Local car-following** (recommended): queues and crawl, seeded, cosmetic, thrown away
  on reload. Two players may see different cars; they cannot see different rules.

## D7 - Relief and projection (Q24, Q25)

Relief, `RELIEF_M` per elevation step: 0 (today), 0.25 (gentle, 2-3 m hills), **0.5**
(recommended: hills a house tall, roads visibly climb, overlays still flat enough), 1.0 (a
block tall, as the reference; picking and every flat layer will fight it).

Projection: the tilt camera as an option beside the orthographic one, both keeping the snapped
yaws. Ortho stays the default and what the phone gets.

## D8 - three addons

- **(a) Hand-roll** (recommended): a fifty-line merge, a ten-line full-screen quad, a
  fifty-line sky dome. City Grid already writes raw buffers.
- (b) Vendor `BufferGeometryUtils.js` and `Pass.js` as second pinned files. Fine, but the
  precedent is one vendored file and the pieces needed are small.

## D9 - Name

**cityviewer.** The model stays in `client/world/`, the drawing in `client/render/`; the name
is for the two together and for these specs.

## D10 - Process

City Grid's `CLAUDE.md` says every change is a slice with a gate, a dev-log entry, and a
ruling for every decision. Done: the decisions above are rulings 032-040, the slices are the
E-series lane in `plan-v1.md`, and Q24-Q26 are answered as A26-A28 in `dev-questions.md`.

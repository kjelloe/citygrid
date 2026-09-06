# 11 - Roadmap

Sizes as in `plan-v1.md`: **S** a sitting, **M** a day, **L** several. Every slice keeps every
hash, every rule and every number; every slice has a gate and a `dev-log.md` entry. Nothing is
scheduled until the decisions in `12-decisions.md` are taken.

The end state is a City Grid renderer whose street-level output is of the same kind as the
fable51 worlds. Lane A gets the city camera to the reference shots in `debugging/`; Lane B is
the eye-height renderer; Lane C is the painted finish. All three are needed for "match", and
they are ordered so every slice ships a visible improvement on its own.

## Lane A - the city you can zoom into (the V lane, re-sequenced)

| # | Slice | Size | Depends on | Done when |
|---|---|---|---|---|
| **E0** | **The city model** - `client/world/`: `TILE_M`, `heightAt`, corridors from masks, lots and frontages, the parameter function, node-tested | M | D2 | Fixture assertions in 10.1 pass; `instances.js` reads variants and roof hues through the model and the picture is pixel-identical |
| **V2** | **Quality tiers** with a frame-time governor | S | - | **Done 2026-09-06.** Three tiers in data, defaulted from `deviceClass()`, applied live; a pure governor (p95 over 60 frames, ink → shadows → supersample). The Low tier did not fit its own budget until the ladder gained a `networks` rung — the utility ribbons are 43% of the frame on a wired city (Q27) |
| **E1** | **Lane graph** in the model, node-tested | S | E0 | **Done 2026-09-06.** 5,810 links and 372 signals on a saturated 96×96. Right turns came out zero metres long until lanes were trimmed to the junction box; the model rebuild went 123 ms → 35.7 ms on the way |
| **V1** | **Traffic you can see** - local car-following on the lane graph, density from `tiles.traffic`, instanced, capped, a ladder rung | M | E1, V2, D6 | **Done 2026-09-06.** Load sets the SPEED and the density follows, which is the reverse of §9.1's order and the reason the first build looked the same at every load. 997 cars on a 64×64 at 0.09 ms a step; `?life=0` makes two screenshots byte identical |
| **V3** | **Ground that is not a checkerboard** - corner colour blend on natural tiles only, mottle, distance-to-street tone | S | E0 | **Done 2026-09-06.** Natural corners blend, built land stays flat; the shoreline goes from a staircase to a graded shore while the road grid is pixel-for-pixel as crisp. 1.4 ms on a saturated 128×128, and the tone is a two-ring flood rather than a corridor query per tile (Q28) |
| **V4** | **Real relief** - `RELIEF_M`, corridor flattening, seating on the lowest corner, height-field picking, every flat layer re-checked | M | E0, D7 | **Done 2026-09-06.** Full audit in 05.6. The zone tint stopped being a quad and became a colour of the mesh; the overlay wash sits at the mean of the tile's corners and is the one still floating (Q29). Picking marches the field, bounded to the band between `minHeight` and `maxHeight`. Two gates were projecting tile centres at y = 0 and had to be fixed before they could see the game |
| **V5** | **Tilt camera** - perspective option, per-chunk `tilePixels`, frustum bounds, sky dome | M | V4, D7 | **Done 2026-09-06.** One view, two cameras, shared pose; `span` still the zoom. The plan is per chunk (3 distinct across 64 on a 128×128) and `estimate` prices each chunk at its own plan — without that it was 77% over at close zoom. Terrain counts against the frustum footprint, not its box. `play_smoke` and `budget_gate` run both projections; the orthographic picture is **byte-identical** to V4 at two zooms |
| **V6** | **Lots with something on them** - fences, hedges, paths, wider colour range, more silhouettes | L | E0 | Content against the existing kit; style sheet |

E0 is the slice that makes the rest cheap, and it is pure, so it is the safest first move.

## Lane B - the street you can stand in

| # | Slice | Size | Depends on | Done when |
|---|---|---|---|---|
| **E2** | **The baker and the chunk cache** - `baker.js`, in-repo merge, per-chunk build keyed by content hash, one build per frame, disposal | M | E0 | A chunk rebuilds only when its hash moves; draw calls per L3 chunk ≤ materials in use |
| **E3** | **Ribbons** - carriageway, kerbs, sidewalks, junction boxes, connector curves; marking canvas per chunk | M | E2, V4 | Kerb is a 0.15 m step in `floorAt`; no z-fight on a slope |
| **E4** | **Street camera and collision** - walk controls, `CollisionWorld` (walls from lots, patches from sidewalks), enter/exit, touch | M | E3, V5 | `walkthrough.mjs` walks every corridor of a saturated fixture; `passability` clean |
| **E5** | **L3 facades** - the generated spec, the four category grammars, roofs with eaves, reveals built outward, signage canvases, emissive buckets | L | E2, D5 | Style sheet at street level; L2 and L3 agree per building id; budget at High tier with 9 chunks |
| **E6** | **Time of day** - preset list per rig, clock-driven with an off switch, lit windows, lamp pools, following snapped shadow frustum | M | E5 | Night at street level inside budget; `a11y_smoke` still reads overlays at night |
| **E7** | **Pedestrians** - nav graph, commuters and shoppers, signal waiting, simplified rig | M | E4, E6 | Capped per tier; frozen for capture |

## Lane C - painted (required: D0 chose the Higashiyama look)

| # | Slice | Size | Depends on | Done when |
|---|---|---|---|---|
| **P1** | **Toon shading** - `MeshToonMaterial` ramps and the shadow-tint patch as `shading: 'toon'`, the anime rig, a painted palette | M | V2 | Style sheet shows three styles that differ in geometry, shading, palette (ruling 017) |
| **P2** | **Ink and grade** - depth-texture target, second-difference ink, split-tone grade, FXAA, desktop tier only, governor-gated | M | P1, V2 | Ink on silhouettes and creases, none on flat road at grazing angle; frame time inside High tier |

## Order

With D0 (painted), D2 (20 m) and D3 (perspective play camera) settled:

E0 → V2 → E1 → V1 → V3 → V4 → **V5** → **P1** → E2 → E3 → E4 → E5 → E6 → P2, with V6 and E7
when wanted.

V1 lands fourth because it is the thing that was asked for and it needs only E1 and V2. V5 is
now the play camera rather than an option, so it moves ahead of the street lane and carries the
per-chunk LOD change with it. P1 (toon shading and the anime rig) lands before the street lane
so every L3 chunk is authored under the shading it will ship with - a facade tuned under
Lambert and then switched to a three-band ramp has to be retuned. P2 (ink and grade) is last
because it is a finish (ruling 017) and needs V2's governor to be safe on a phone.

## What would make us stop

- E0's model cannot be made pixel-identical to the current picture: the derivation is wrong and
  everything after it inherits the error.
- V4 at any useful `RELIEF_M` breaks overlay legibility in the colour-vision test: relief and
  overlays are in tension and the overlay wins.
- E5 cannot hold the High-tier budget with 9 chunks on a saturated fixture: the L3 radius comes
  down before the kit does.

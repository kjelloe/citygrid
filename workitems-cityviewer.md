# cityviewer — work items

*Written 2026-09-05 after slice E0. This is the hand-off for whoever implements the rest of
cityviewer in this repo. Each item is one slice: it has a gate, it ends with a `dev-log.md`
entry with numbers, and it is committed as `slice-<id>`. The design is `specs/engine/`; the
decisions are rulings 032–041; the order and sizes are `specs/engine/11-roadmap.md`. Do them
in the order below unless a dependency says otherwise. The review pass at the end of each item
is what the author of this file will check.*

**The lane is finished (2026-09-07).** Twenty items, all done, all on `dev_night`. §2a is the
table of what each one measured; §2b, §2d and §2e are the three review rounds it went through;
§2c indexes every question it raised. What follows it is `workitems-mainline.md`.

## 0. How to work

- **Follow `.claude/skills/slice-workflow/SKILL.md`** to the letter: orient, tests first,
  implement, `./test.sh` green twice (read the fail count), run the item's gate, dev-log entry
  with measurements, sync docs, commit `slice-<id>` only when asked.
- **The renderer never writes state** (CLAUDE.md 6). Nothing under `client/world/` or
  `client/render/` may import `engine/` (read constants through `client/constants-mirror.js`,
  and add to it when you need one — `test/render.test.js` keeps the mirror honest).
- **No hash moves.** Every one of these items is cosmetic. If `test/fixture.test.js` goes red,
  stop: you have changed the game, not the picture.
- **Numbers in `data/cityviewer.json`**, mirrored in `client/world/config.js`;
  `test/world.test.js` refuses drift. No magic numbers in render code.
- **Measure, then write it down.** Draw calls and triangles first, milliseconds second, on the
  saturated fixture (`test/fixtures/` and `tools/budget_gate.mjs`'s city), never an empty map.
- **Every new file goes in the precache**: `node tools/make_precache.mjs` after adding a module
  or `test/pwa.test.js` fails.
- Modules ≤ ~300 lines, one subsystem each, acyclic imports (`world/` never imports `render/`).
  Comments only where the *why* is non-obvious; cite the ruling.
- Keep screenshots per item in `reports/`, from `tools/screenshot.mjs`. They are ignored by git
  (`reports/smoke-*.png`) and are what the review looks at first. **In practice this stopped
  being a before/after PAIR after V3**: what an item changes is usually not visible at one zoom,
  so the convention became `smoke-<id>-<what>.png` — a handful per item naming the thing each
  one shows (`smoke-E8-shore`, `smoke-R3-relief05`/`-relief10`, `smoke-V7-verge-sand`/`-grass`).
  A pair is still right when the item has a before and an after worth diffing; a pair of an
  empty field is not.

## 1. What E0 left you

`client/world/model.js` — `createModel(state)` returns:

What E0 left, and what the lane added to it. The whole of it is derived from state and nothing
in it is remembered (ruling 032).

```
tileM, reliefM                       numbers from config
corridors[]   { id, kind:'road', points:[{x,z}] metres, tiles:[index], half, frontage,
                length, from:nodeId, to:nodeId, box }
nodes[]       { id, tile, x, z, mask, degree, kind:'end'|'bend'|'junction'|'isolated'|'loop',
                corridors:[id] }
connectors[]  { node, a, b, points:[{x,z}] }         a quadratic curve through each bend
nearestCorridor(x, z, max?) → { corridor|node, dist, s, x, z } | undefined
heightAt(x, z), landAt(x, z), normalAt(x, z)                     metres
cornerHeightAt(cx, cz), minHeight, maxHeight, tileOf(x, z)
lots[]        { id, building, x0, z0, x1, z1, cx, cz, frontage:0..3 (DIR4 N,E,S,W),
                facing:boolean, frontageLen, bays, seat }
lotOf(id), lotAt(x, z)
surfaceAt(x, z) → { kind:'water'|'lot'|'road'|'sidewalk'|'ground', y, depth?, ... }
stats         { corridors, nodes, connectors, lots, links, turns, signals }

added by the lane
lanes         E1 — links, turns, signals, phaseAt(node, t), sample(link, s, out)
profileOf(id) R3 — a corridor's graded profile; steepestStreet is the worst left
water         E8 — isWater/levelOf/depthOf/bedOf per tile; waterLevelAt(x, z)
waterLevel        the old single global, kept only because two tests read it
```

And four modules that hang off it rather than living in it, all pure and all in
`client/world/`: `chunks.js` (what a baked chunk is made of), `nav.js` (E7, where a person can
walk), `foliage.js` and `signals.js` (V8, where a tree and a signal head stand — read by BOTH
the instanced pass and the baked one, which is the whole reason they are not in `render/`).

`client/world/params.js` — `buildingParams(building, palette, family, showOwner)` returns
`{ kind, variant, colour, roof, height, storeys, floorH, groundH, spin, lawn }`. Every fidelity
level draws a building from this and nothing else, so L2 and L3 agree.

`client/render/scene.js` owns the model (`renderer.model`), rebuilds it in `worldChanged()`,
and reports `stats.corridors` / `stats.lots`. Metres = tiles × `tileM`; the camera and the
instanced pools are still in tile units and convert at their own boundary.

## 2. The items

### V2 — The quality tier (S) — ruling 040

**Goal.** Low / Medium / High, defaulted from `deviceClass()` in `client/capabilities.js`,
remembered in settings, changing rendering only, with a frame-time governor.

**Do.**
- `data/cityviewer.json` gains `tiers: { low, medium, high }` with `budget`, `pixelRatio`,
  `antialias`, `shadowMap`, `shadows`, `streetChunks`, `carCap`, `pedCap`, `post` (a list of
  allowed pass names), `frameMs` (the governor target: 33 on low and medium, 16 on high).
  Mirror in `config.js`.
- `client/ui/settings-model.js` + `settings.js`: a `quality` row with three choices; i18n keys
  in both catalogues (ruling 008); default `deviceClass()` → `phone-weak: low`, `phone: medium`,
  `desktop-weak: medium`, `desktop: high`.
- `scene.js`: `createRenderer(canvas, state, { tier })` reads the tier's values into the
  options it already accepts (`pixelRatio`, `antialias`, `shadowMap`, `triangleBudget`,
  `shadows`), and `setTier(name)` at runtime re-applies what can be re-applied (budget, shadows,
  caps) and flags what needs a renderer rebuild (pixel ratio, antialias).
- `client/render/governor.js` (pure, tested): `createGovernor({ targetMs, ladder })`, fed a
  frame time per `draw()`, keeps a rolling p95 over ~60 frames, and after one second over
  target disables the next optional pass in order `ink → shadows → supersample`; remembers for
  the session; `reset()` when the tier changes.
- Remove the dead `settings.reducedEffects` string or wire it to Low (ruling 027 — a key with
  no screen is a broken promise).

**Tests first.** `test/settings.test.js`: the tier row exists, defaults per device class,
survives a save/load of settings. `test/governor.test.js`: p95 arithmetic; nothing disables
below target; the order of sacrifice; `reset`.

**Gate.** `tools/budget_gate.mjs` gains `--tier=low|medium|high` and passes at all three;
`tools/ui_smoke.mjs` hit-tests the new row; `reach_smoke` finds it.

**Done when** the row exists and is remembered, `budget_gate` is green at three tiers, and the
dev-log records the three budgets and the frame p95 on the saturated fixture for each.

**Must not change:** anything in `engine/`; the tier never reaches a command.

**Review will check:** the governor is pure and tested; no tier value is read inside a
reducer path; the `pixel` post pass is now behind the tier's `post` list.

---

### E1 — The lane graph (S) — spec §4.6, ruling 037

**Goal.** A directed lane graph derived from the corridors, in `client/world/lanes.js`, pure.

**Do.**
- Per corridor: `lanesPerDir` from `data/cityviewer.json` (`road.lanes: 1` per direction to
  start), lane centrelines offset `±laneW/2` from the corridor centreline, right-hand traffic
  (`DIR4` N,E,S,W: travelling north the lane is on the east side).
- Block links: from node to node along a lane, trimmed `stopLine` metres short of the node
  box on the approach side (`road.stopLine: 2`), `pts` as a `Float32Array` of x,y,z with
  `y = heightAt`, `cum` arc lengths, `len`.
- Connectors through each node: straight-through, right turn, left turn (all of them at a
  junction — the grid has no restrictions), sampled beziers like Union Square's
  `LaneGraph.buildConnectors`; at a bend the single continuation follows E0's connector curve.
- `next[]` per link with `turn` flags; `preds[]`; `entry` on links that start at an `end`
  node (spawn points) and `exit` on those that end at one.
- Signals: every `junction` node gets `signal = { cycle: 60, offset: jitter(node.tile, 97) * 60 }`
  and a pure `phaseAt(node, t)` → `'ns' | 'ew'` green, with a 3 s amber.
- `createModel` gains `lanes: { lanes, links, nodes, phaseAt, sample(link, s, out) }`.

**Tests first** (`test/lanes.test.js`): a straight road of six tiles has two links (one per
direction) of `5 × tileM − 2 × stopLine`; every link has a successor unless it is an exit;
a T has the right count of connectors (each approach: straight + one turn, or two turns for
the stem); no link is shorter than a car (4.5 m); `phaseAt` is periodic and never green both
ways; `sample` at `s = 0` and `s = len` returns the endpoints.

**Gate.** The unit tests, plus `node tools/where.mjs`-style dump: add `tools/lanes_dump.mjs`
that prints link and node counts for a fixture, so E1 leaves a number in the log.

**Done when** the tests pass and the dev-log states link/node/connector counts for the
saturated fixture.

---

### V1 — Traffic you can see (M) — ruling 037, spec §9.1

**Goal.** Cars on the lane graph, density from `state.tiles.traffic`, bunching behind signals,
renderer-side, capped per tier, a rung on the LOD ladder.

**Do.**
- `client/life/traffic.js` (renderer-local state, not part of the model): `createTraffic(model,
  { seed, cap })`; a pool of vehicles `{ link, s, v, cursor, colour, variant }`; per link a
  target density = `tiles.traffic[link tile] / 255 × road.maxDensity` (per 100 m); spawn at
  `entry` links and where a link is below target, despawn beyond target; IDM following with
  `S0 = 2`, `HEADWAY = 1.2`, `vmax` from `road.speed` (11 m/s), turns by `jitter(id, k)`;
  stop at a red signal's stop line; `update(dt)` and `pose(pools)` that writes instance
  matrices into the existing `car0`/`car1` pools in tile units (`/ tileM`) with yaw from the
  link tangent.
- `scene.js` calls `traffic.update(dt)` when `plan.cars` and `options.life !== false`;
  `draw()` passes `dt`. `game.js` already loops on `requestAnimationFrame`; give `draw` the
  clock delta.
- `lod.js`: a `cars` rung between `props` and `markings`; a cost per car measured from the
  car pool geometry; `counts.cars` from the traffic system's live count; a per-tier cap from
  V2.
- `?life=0` (and `Config`-style URL param in `tools/shoot.html`) freezes traffic at t = 0 so
  screenshots are deterministic; `client_smoke` and `budget_gate` pass it.
- Parked cars stay as they are (hash-placed on 28 % of road tiles); moving cars are drawn
  on the carriageway between them.

**Tests first** (`test/traffic.test.js`, pure parts only): IDM never produces a negative gap;
a link at target density holds ±10 % after 60 s of simulated updates; a red signal stops the
first car within `stopLine + S0` of the node; the cap is respected; two runs with one seed are
identical.

**Gate.** `budget_gate` at three tiers with cars on; `tools/traffic_gate.mjs` already exists
for the engine's traffic — leave it alone. Add `reports/smoke-V1-*.png` at span 12 showing a
queue at a junction on the saturated fixture; the dev-log names the frame time delta from
cars on a 64×64 and a 128×128 fixture.

**Done when** cars stream, bunch behind a signal, are capped, and no hash moved.

**Must not change:** `engine/traffic.js`, `tiles.traffic`, anything in the fixture hashes.

**Review will check:** the traffic module reads `state.tiles.traffic` and the model, nothing
else; the seed is the map seed; the cost is measured not remembered (ruling 019).

---

### V3 — Ground that is not a checkerboard (S) — spec §5.1

**Goal.** Natural terrain blends across tile corners; built, zoned and paved land keeps its
flat tile colour.

**Do.**
- `terrain.js: buildChunk`: a vertex on a corner shared only by natural tiles (grass, dirt,
  forest, sand, marsh, rock, water, shallow) takes the mean of the four tiles' colours; a
  corner touching any road, zone, building or lawn tile keeps the tile's own colour (so the
  grid still reads under the city). Add a per-tile mottle from `jitter(index, 5)` of ±6 %
  lightness, and a distance-to-street tone: tiles farther than `ground.urbanReach` (data:
  40 m) from any corridor darken and desaturate by up to `ground.farTone` (data: 0.12).
  Use `model.nearestCorridor` with a chunk-level cache so the rebuild stays ≤ 15 ms on 128×128
  (N30 measured ~12 ms today; record the new number).
- One knob, `ground.blend` in data, `0` reproduces today's picture exactly.

**Tests first.** A pure helper `groundColour(state, model, x, y, corner)` in
`client/world/ground-colour.js`, tested: a corner between four grass tiles is their mean; a
corner touching a road tile is the tile colour; `blend: 0` returns the tile colour everywhere.

**Gate.** `tools/screenshot.mjs` at three spans; the dev-log records chunk rebuild ms.

---

### V4 — Real relief (M) — ruling 038, spec §4.2, §5.6

**Goal.** The terrain mesh, every instanced pool, picking and the ghost use
`model.heightAt`; roads follow the ground as corridors; buildings seat on their lowest corner.

**Do.**
- `terrain.js`: corner heights from `model.heightAt(cx × tileM, cz × tileM) / tileM` (tile
  units — the pools are in tiles until V5 moves the camera to metres); dip `STREET_DIP`
  (data: 0.16 m) under a corridor so later ribbons never poke through.
- `instances.js`: `ground(index)` becomes `model.heightAt(tile centre) / tileM`; buildings use
  `lot.seat / tileM`; markings, wire, pipe, zone, lawn and overlay quads sample the height at
  their own position, and a quad that spans a slope (lawn under a 2×2) becomes two triangles
  with per-vertex heights or gets a skirt — check each one at `reliefM = 0.5` on a hillside
  fixture and write down which it was.
- `picking.js`: replace the y = 0 plane with a march: step the ray in 0.25-tile increments
  until it crosses the height field, then bisect; keep the integer-grid answer.
- `showGhost`, `showGhostTiles`: use `heightAt`.
- The shadow camera: keep the extent, raise `far` to clear the tallest hill.

**Tests first.** `test/picking.test.js` (pure maths with a fake `heightAt`): a ray down onto a
flat field picks the same tile as today; on a slope the pick lands on the visible face not
the y = 0 projection. `test/world.test.js`: hillside fixture assertions already there.

**Gate.** A hillside fixture (`seed` with `terrainStyle: 'hilly'` if worldgen has one, else
the steepest of the three) screenshotted at spans 40, 12 and 8 with every overlay on: no
seam, no floating building, no road stepping. `play_smoke` picks correctly on a slope (add a
step). `budget_gate` unchanged.

**Must not change:** `engine/terrain.js`, `tiles.elevation`, worldgen.

**Review will check:** the list of flat layers and what was done to each (spec §5.6); the
ghost follows the ground; `pickTile` still returns integers.

---

### V5 — The perspective play camera (M) — ruling 034, spec §8.1–8.2

**Goal.** `view.mode = 'city' | 'ortho'` (street comes in E4); perspective by default on a
fine pointer, orthographic on a coarse one; the four snapped yaws in both; per-chunk LOD.

**Do.**
- `camera.js`: `createCamera(aspect, mode)`; a `PerspectiveCamera(fov 50)` for `city`; `span`
  still the zoom control — the eye distance is `span / (2 tan(fov/2))` along the orbit ray so
  switching mode does not jump; `pitchBy`, `yawBy`, `rotate`, `panBy`, `zoomBy`, `focusOn`,
  `clampToMap` work in both; `setMode(view, mode)` swaps the camera and re-poses.
- `lod.js`: `tilePixels(view, canvasHeight, chunk?)` — orthographic as today; perspective
  `tileM_in_tiles × focalPx / distance(eye, chunk centre)` with `focalPx = canvasHeight / (2
  tan(fov/2))`. `choosePlan` runs per chunk and returns a plan per chunk; `updateInstances`
  takes the per-chunk plan and looks up the tier by the tile's chunk. `visibleBounds` for
  perspective: the frustum's ground footprint clipped by a far plane (data: `camera.far`).
- `controller.js: pixelsToTiles` — for perspective use the ground distance under the cursor:
  pick the tile under the pointer at drag start and pan so it stays under the pointer.
- A sky dome (`client/render/sky.js`, ~50 lines, from Higashiyama `sky.js`) and
  `scene.fog`, both only in perspective. Ruling 039: hand-rolled.
- Settings: `camera: perspective | orthographic` row, default from `isCoarsePointer()`.

**Tests first.** `test/lod.test.js`: per-chunk `tilePixels` under perspective decreases with
distance and equals the orthographic value at the orbit target; the plan for a far chunk is
never finer than a near one. `test/input.test.js`: Q and E snap in both modes; pitch is
clamped in both.

**Gate.** `play_smoke` in both projections (mouse and phone viewports); `budget_gate` in both;
`style-sheet` in both; `reports/smoke-V5-*.png` at a 20° pitch showing convergence.

**Review will check:** ortho is untouched pixel-for-pixel (`screenshot.mjs` before/after with
`mode=ortho`); the four yaws snap in perspective; the LOD plan is per chunk, not per frame.

---

### P1 — Toon shading and the anime rig (M) — ruling 033, spec §7.1–7.2

**Goal.** `painted` becomes a real style: `shading: 'toon'`, the four-light rig, its own
palette.

**Do.**
- `styles.js`: each style gains `rig`, `shading`, `post`. `style-assets.js: makeMaterial`
  returns `MeshToonMaterial({ gradientMap: ramp(bands), vertexColors: true })` for `toon` with
  the shadow-tint patch from Higashiyama `toon.js` (`onBeforeCompile` on
  `lights_toon_pars_fragment`; check the chunk shape and warn, as the original does). Ramps
  `2, 3, 4, soft, soft3` as `DataTexture`s. `faceContrastFor('painted')` drops to ~0.3 — a toon
  ramp already quantises; baked contrast on top double-shades.
- `style-light.js: lightingFor('painted')`: key warm 2.3, cool fill 1.05 from the opposite
  quarter, violet up-light 0.32, hemisphere violet ground 1.1; `scene.js` builds fill and
  bounce lights when the rig names them.
- `palettes.js: painted`: from the plain palette shifted toward Higashiyama's PAL — desaturated
  ground, warmer walls, the same roof split. Through the colour-vision test.
- The shadow camera follows the orbit target snapped to a texel (needed anyway for V5/E4).

**Tests first.** `test/render.test.js`: the painted palette passes protan/deutan/tritan; the
ramp textures are `NearestFilter`; `makeMaterial('painted')` is a toon material (this needs
three in node — skip if the module cannot load, as the existing tests do; test the ramp
arrays instead).

**Gate.** `tools/style-sheet.mjs` — three styles from one city that differ in shading, not just
tint; `client_smoke` for painted; `budget_gate` for painted (toon costs no triangles; check
draw calls did not double).

---

### E2 — The baker and the chunk cache (M) — spec §6.4, ruling 039

**Goal.** `client/render/baker.js`: vertex-colour merge per shading signature; per-chunk
groups keyed by a content hash; one build per frame, nearest first; disposal.

**Do.**
- `client/render/merge.js`: `mergeNonIndexed(geometries)` concatenating `position`, `normal`,
  `color` (and `uv` when every input has it) — no `BufferGeometryUtils`.
- `baker.js`: `createBaker(name)` with `add(geometry, matrix, colourHex, { bands, transparent,
  side, emissive })`, `triangles`, `build()` → `Group` with one mesh per bucket and the style's
  material for that signature; `dispose()`.
- `client/world/chunks.js` (pure): `chunkHash(state, cx, cy)` — FNV over the chunk's tiles
  (terrain, elevation, zone, road, buildingId) and the records of the buildings anchored in
  it; `chunksNear(view, radius)` ordered by distance to the orbit target.
- `client/render/street-chunks.js`: `createStreetChunks(scene, model)` keeps `Map<chunkKey,
  { hash, group }>`; `update(view, plan)` builds at most one missing/stale chunk per call within
  the tier's `streetChunks` radius, disposes chunks outside it after a 2-second grace, and
  reports `{ built, live, triangles }`. E2 ships with a placeholder builder that bakes each
  lot's footprint as a slab at `lot.seat` so the mechanism is visible and measurable; E3 and
  E5 replace the content.
- `lod.js`: an `L3` tier above `FULL` chosen per chunk at `tilePixels ≥ 160`, and a ladder rung
  "drop the farthest street chunk" before `props`.

**Tests first.** `test/baker.test.js`: two boxes merge to 24 triangles; colours land per
vertex; buckets split on `transparent`; `test/chunks.test.js`: the hash changes when a road
is painted in the chunk and not when one is painted elsewhere; `chunksNear` order.

**Gate.** `budget_gate` with the placeholder slabs at High tier: one draw call per material
per chunk, build ≤ 8 ms per chunk (measure in the page with `performance.now()`, report p95).

---

### E3 — Ribbons (M) — spec §5.2–5.4

**Goal.** At L3, carriageway, kerbs, sidewalks, junction boxes and connector curves as draped
ribbons; a marking canvas per chunk; wires with poles and sag.

**Do.**
- `client/render/ribbon.js`: `ribbon(points, halfWidth, heightAt, { lift, camber, step })` and
  `skirt(points, halfWidth, heightAt, drop)`, non-indexed, with metre UVs — the Higashiyama
  `util.js` primitives, hand-rolled.
- `client/render/streets-l3.js`: per corridor inside the chunk: carriageway at `+0.02`
  camber 0.035, kerb faces to `+0.15`, sidewalks at `+0.15` to `frontage`; per node: the box
  and four corner squares with kerbs on the exposed edges; per connector: a curved ribbon.
  Everything through the chunk baker (colour from the palette: asphalt, kerb, concrete).
- `client/render/markings-canvas.js`: one `CanvasTexture` per chunk (1024 px over the chunk's
  metres) with lane lines, centre dashes, crosswalk bars and stop bars from the lane graph;
  sampled by world x/z in the carriageway material via `onBeforeCompile` (Union Square
  `RoadMarkings.applyMarkingsOverlay`). Instanced tile markings hide inside an L3 chunk.
- Wire at L3: a pole every `wire.poleSpacing` (data, 60 m) along a wire run with a cross-arm,
  and a sagging wire between poles (`sagCurve`, 8 segments) — ruling 030 still: from the mask.
- The walker's floor (E4) will read sidewalk height from `model.surfaceAt`, so `surfaceAt`
  gains `y`: road `heightAt + 0.02`, sidewalk `heightAt + 0.15`.

**Tests first.** `test/ribbon.test.js`: a straight ribbon of length L and half-width h has
`2 × steps` triangles and every vertex `y = heightAt + lift`; the camber lowers the edges.
`test/world.test.js`: `surfaceAt(...).y` on a sidewalk is 0.15 above the road beside it.

**Gate.** `reports/smoke-E3-*.png` at street zoom on a slope: no z-fighting, kerbs continuous
through a junction, markings following the curve of a bend; `budget_gate` High.

**Built, with four deviations.** (1) The centre line is dashed ribbons, not a marking canvas —
one line does not need a texture and a second sampling path, and geometry is what E4's walker can
be tested against (**Q31**). (2) The kerbside — pavement, verge and centre line — stops short of
each junction rather than being drawn as corner squares; the carriageway runs through. (3) The
chunk lays its own **verge** out to the tile edge, because a road tile is painted asphalt for its
whole 20 m at city zoom and that leaves the carriageway floating in grey at street zoom. (4)
`streetChunks` is now gated on resolvability: L3 is a zoom, not a tier setting, and the cache had
been baking its tier's quota at every span.

---

### E4 — The street camera and collision (M) — ruling 034, spec §8.1, Union Square
`player/`

**Goal.** `view.mode = 'street'`: eye at 1.62 m over the sidewalk, pointer-lock or drag look,
WASD, collision against lots and kerbs, entered by zooming past the minimum span below a 25°
pitch or by a key, left the same way; touch: tap-to-walk.

**Do.**
- `client/world/collision.js` (pure): walls from every lot rectangle (`y0 = seat`, `y1 = seat +
  storeys × floorH`) in an 8 m spatial hash; `floorAt(x, z, footY)` = `surfaceAt(...).y` with a
  0.6 m step-up limit; `resolve(pos, r = 0.34, h = 1.7)` circle-vs-segment push-out.
- `client/render/walk.js`: keys, yaw/pitch, `teleport`, `update(dt)` applying speed 1.6 m/s
  (run 4), gravity to `floorAt`, `resolve`; writes `view.eye` in metres and `camera.js` poses
  the perspective camera from it in street mode.
- `controller.js`: mode transitions; in street mode the build tools are disabled (a street is
  for looking) and Escape leaves; the HUD shows a "return to city" control (ruling 027: a key
  with no screen is a broken promise; add the button and its i18n keys).
- `tools/walkthrough.mjs`: drives the walker along every corridor of the saturated fixture
  with the real movement code, samples `floorAt` every 2 m, reports legs it could not finish
  and ground discontinuities > 0.5 m. `tools/passability.mjs`: sweeps each corridor for a
  0.68 m + margin clear lane between colliders.

**Tests first.** `test/collision.test.js`: a walker 0.2 m inside a wall is pushed out to the
radius; a doorway 1.8 m wide passes, 0.6 m does not; `floorAt` steps up a kerb and not a
wall; the spatial hash returns the same answer as brute force on 200 random points.

**Gate.** `walkthrough` walks every corridor; `passability` clean; `play_smoke` enters and
leaves street mode by key and by zoom on both viewports.

**Built, with four deviations.** (1) The walker is `client/life/walker.js`, not
`client/render/walk.js` — it is pure, so node walks it into a wall (**Q42**). (2) Colliders are
lot BOXES, not four wall segments each: a segment push-out does not know which side of itself it
is on, and pushed a walker who was 0.2 m inside a building further inside it. (3) Drag-look only,
no pointer lock (**Q43**). (4) `walkthrough` walks the pavements and then walks head-on into every
lot, because the centre line alone covers 54 km without meeting a single building — ruling 035
puts the nearest lot line seven metres beyond the kerb, so a gate that only walks the carriageway
proves the walker can cross a field. It now fails if nothing was ever in the way.

---

### E5 — Street-level facades (L) — spec §6.1–6.3, §6.5–6.6, ruling 036

**Goal.** At L3 every lot in a street chunk is built at its real size on its real lot from a
generated facade spec, through the baker; the L2 box and the L3 building are the same house.

**Do.**
- `client/world/facade-spec.js` (pure): `facadeSpec(lot, params)` → the grammar in spec §6.2
  (wall, base, groundH, floorH, storeys, cornice/parapet/roof kind, edges with window module
  and bay width, storefronts for commercial from `lot.bays` with sign text from a name table
  `data/names.json` by `jitter(id, k)`, extras by category and variant).
- `client/render/facade.js`: builds the spec into a baker: panels, reveals built outward
  (four inner faces + backing panel), a ground band with storefront bays and a fascia,
  stringcourse, cornice or parapet; `client/render/roof-kit.js`: gable, hip, mansard, flat
  with parapet, sawtooth, all with `eave` overhang (data per category) and a shadow-line
  underside.
- `client/render/props-l3.js`: lamps every `props.lampSpacing` alternating sides, bins,
  hydrants, benches near commercial, tree pits, fences and hedges at residential lot lines,
  the path to the door.
- Signage: `client/render/signs.js` — Canvas2D fascia text, cached by string, shared
  material, merged by material after the bake (`mergeByMaterial`, hand-rolled).
- Emissive buckets for `window_lit` (35 % by hash) and `shop_lit`, intensity 0 until E6.

**Tests first.** `test/facade-spec.test.js`: a 20 m commercial frontage gets four bays; a
residential spec has a door and a pitched roof kind; storeys and floorH match `params`; the
same lot gives the same spec twice; a civic building has a portico extra. `test/roof-kit.test.js`:
each roof kind returns closed geometry (every edge shared by two triangles) and an eave wider
than the wall.

**Gate.** `style-sheet` at street level; `budget_gate` High with 9 chunks on the saturated
fixture (this is the number the whole lane is measured by — record triangles per chunk and
draw calls per chunk); `walkthrough` still walks (facades must not collide beyond the lot);
`reports/smoke-E5-*.png` from the sidewalk in all three styles.

**Review will check:** every building at L3 matches its L2 box in variant, roof hue, wall
colour and door side (write a page-level check in `tools/shoot.html` that compares
`buildingParams` with what the facade used); nothing under `client/` is a binary asset.

**Built, with five deviations.** (1) The L2/L3 agreement is not a page check — the two levels now
take their colour from one exported `familyColour`, and a unit test asserts both call it. A check
that two copies agree is weaker than not having two copies. (2) `facade.js`, `roof-kit.js`,
`props-l3.js` and `solid.js` are all PURE and live in `client/render/` (**Q38**); only `signs.js`
touches three. (3) The marking canvas §5.3 asks for is still dashed ribbons (**Q31**, from E3);
the Canvas2D work here is the shop fascias. (4) A chunk bake is two phases on two frames, because
streets plus facades is 15 ms against an 8 ms budget. (5) The tier budgets moved to 320k/140k/40k
(**Q37**) — 200k at High was set before L3 existed and nine chunks of facade is 200k on its own.

---

### E6 — Time of day (M) — spec §7.3

**Goal.** `day`, `sunset`, `night` presets per rig; the game clock choosing among them on a
schedule with an off switch; lit windows and shopfronts; lamp pools; a following, snapped
shadow frustum.

**Do.**
- `data/cityviewer.json: presets` per rig: sun azimuth/elevation, colours, intensities, fog,
  sky colours, `night` factor.
- `client/render/time-of-day.js`: `set(preset)`, `update(dt)` interpolating over 1 s; drives
  the rig lights, sky uniforms, fog, and `Materials.setNight(t)` over the emissive buckets.
- `client/render/night-lights.js`: the N nearest lamp positions (tier: 3/5/8) as point
  lights, the rest emissive only.
- Settings: `time: auto | day | sunset | night`, default `day` (plan.md §6: off until stable).
  The clock → preset mapping is in `game.js` from `state.tick`, read-only.

**Tests.** `test/time-of-day.test.js` (pure preset arithmetic): interpolation reaches the
target; `night` factor is 0 by day and 1 at night. `a11y_smoke`: overlays still legible at
night (contrast check on the overlay colours against the night ground).

**Gate.** `budget_gate` at night on High; `reports/smoke-E6-night.png` from the sidewalk.

**Built, with three deviations.** (1) One preset table, not one per rig: a preset SCALES the rig's
own intensities and only the colours are absolute (**Q44**), so dusk cannot quietly change which
of the three styles you chose. (2) The sky dome is TINTED rather than rebuilt — its gradient is
baked into vertex colours — and the renderer's clear colour moves with it, because street mode's
far plane is 100 tiles and the dome is 1,800. (3) The shadow frustum already followed and snapped
(V5); E6 added nothing there.

**And it found an E5 defect.** The prop pass had been building nothing at all since the slice that
introduced it: `bakeLots` called `corridorsIn` without its `junction` argument, `trim` was handed
`undefined`, every kerbside point came out `NaN` and `clip` dropped all of them. The lamps in E5's
screenshots were the L2 instanced poles. Nothing failed — the pass returned an empty list and the
baker added nothing — and it was only visible because the night rig asked "where are the lamps"
and got 0.

---

### P2 — Ink and grade (M) — ruling 033, spec §7.4

**Goal.** The painted finish: depth-texture target, second-difference ink, split-tone grade,
FXAA; desktop tier; governor-gated.

**Do.**
- `styles.js: createPost` becomes a small pipeline: `post: 'ink'` renders the scene to a
  `WebGLRenderTarget` with a `DepthTexture`, then the three passes from Higashiyama `post.js`
  (port the shaders verbatim; for the orthographic mode the depth is already linear —
  branch on `view.mode`). A 1.5× supersample on `devicePixelRatio < 1.5`, capped by the tier's
  pixel budget.
- `GRADE` presets per time-of-day preset; `pipeline.setGrade(name)` called by E6.
- The governor (V2) can turn `ink` off; `renderer.info` must be snapshotted before the
  post passes (`sceneInfo`) or the budget gate reads two triangles.

**Tests.** Shader sources are strings: assert the ink shader has no `pow` on depth and the
uniform names match what `setGrade` sets. `test/lod.test.js`: `stats.triangles` is the scene's,
not the quad's, when post is on.

**Gate.** `style-sheet` painted with ink on and off; `budget_gate` High painted; a screenshot
of a road at a grazing angle with no ink on the flat surface (the whole reason for the second
difference).

**Built, with three deviations.** (1) Two passes, not three: ink and grade fold together
(**Q48**). (2) The shader SOURCES and the grade table are in `ink-shaders.js`, which imports
nothing, so node reads them — the pipeline that needs three is `post-ink.js`. (3) `?style=` was
added to the URL config so the gate could reach a style the game cannot: ruling 033 names painted
as the target and nothing in the interface selects it, which is **Q47** and is Kjell's call.

**And it found the defect the item predicted.** `renderer.info.render` is reset by every
`render()` call, so the budget's measurement loop — the thing that makes the budget a promise —
had been reading the full-screen quad's two triangles for as long as any post pass has existed.
The `pixel` ladder never stepped down, and every style sheet since that style shipped reported
"1 draw, 2 tris" in its own caption.

---

### V6 — Lots with something on them (L) — spec §6.6

Front gardens, fences, hedges, paths, a wider roof and wall range, two more silhouettes per
category at L2. Pure content against the existing kit and `buildingParams`; every new colour
through the palette test; `style-sheet` before/after.

**Built, and it was not pure content.** Three things had to change first. (1) `VARIANTS` was
written down twice — `client/world/params.js` picks a variant with it and `client/render/
building-kit.js` builds a pool per variant from its own copy — so "two more silhouettes" would
have made every building of variants 4 and 5 vanish silently. One copy now. (2) Two categories
were already carrying a clone (`variant === 0 || variant === 2` in both commercial and
industrial), so "six silhouettes" needed three new ones there, not two. (3) A front garden is a
SETBACK: the L2 box filled its tile, so a hedge and a path landed underneath the house. Residential
boxes are set back by the same 3 m E5's facade already leaves (**Q50**). At city zoom the hedge is
a pixel or two and what reads is the setback and the lawn (**Q49**).

---

### V7 — Overlays as a texture on the ground (S) — ruling 041

*Specified in §2b below, where the review that raised it is. **Not started** — it is the last
outstanding item from that review, and it carries the fix for **Q30** (orthographic `tilePixels`
on a portrait screen) with it.*

---

### E7 — Pedestrians (M) — spec §9.3

***Done 2026-09-07 as `slice-E7`.*** What follows was the plan; §2d carries what it became, and
`specs/engine/09-life.md` §9.3 is now the authority for what is built. `client/world/nav.js` (sidewalk edges, crossings at nodes, a door node per lot);
`client/life/pedestrians.js` (commuters between a door and the map edge, shoppers between
commercial doors, waiting at a red walk phase, a two-part instanced body with a bob), capped
per tier, frozen by `?life=0`. Gate: `budget_gate` at High with the cap; `walkthrough` still
walks (pedestrians do not collide with the player).

**Three things it inherits.** (1) The tier now carries `pedCap` (0 / 40 / 120) and `lamps`, and a
night frame at High is already 266,538 of 320,000 — the pedestrians land in what is left, so price
them before building them. (2) `client/life/walker.js` and `client/world/collision.js` are the
shapes to follow: pure, delta-driven, `?life=0` freezes them. (3) The nav graph wants the same
`clip`/`trim` the kerbside already uses (`client/render/ribbon.js`), and the sidewalk edges are
`half + sidewalk / 2` off the corridor — the number `props-l3.js` puts the lamps on.

## 2a. Status

*Kept current by whoever implements. An item is **done** when it is implemented,
its tests are written or updated, its gate is green, its docs are synced and it
is committed as `slice-<id>`. Everything below is on branch **`dev_night`**.*

**Twenty of twenty done, in this order:** V2, E1, V1, V3, V4, V5, P1, E2, E3,
then the post-E3 review, then E4, E5, E6, P2, V6, R1, R2, V7, E7, R3, E8, V8.
**The cityviewer lane is finished**, with one review slice left — **R4** (§2f, three items,
the first of which is a lane-height defect the gates cannot see). What follows it is `workitems-mainline.md`,
then measurement, film and the worker — in that order, and the first thing any of
them needs is the row under "Noted, no slice" that nobody has done: **every
number in this lane is SwiftShader**, and the governor's whole reason is a phone.
Every gate is green: the suite twice, `budget_gate` (32 rows plus the opening
spans, four street-chunk checks, three car rows, a crowd row, an overlay row, a
territory-toggle row, four night rows and three painted rows), `walkthrough`
(which reports the steepest street as well as the walk), `passability`,
`lanes_dump` and the eleven browser smokes.

| Item | Status | Commit | Gate | Left for review |
|---|---|---|---|---|
| **V2** — the quality tier | **done** 2026-09-06 | `c12ca3a` | `budget_gate` at three tiers **and at the opening span**; `ui_smoke` 101 → 108 checks, hit-testing the row through the renderer | `test/governor.test.js` (8), `test/settings.test.js` (+6); tier table in `data/cityviewer.json`; ruling 040 satisfied by `test/purity.test.js`. **Q27** |
| **E1** — the lane graph | **done** 2026-09-06 | `2a527d6` | `tools/lanes_dump.mjs`: 5,810 links, 372 signals, shortest link 8.32 m against a 4.5 m car | `test/lanes.test.js` (19); spec §4.6a. Right turns came out zero metres long until lanes were trimmed to the junction **box**; the model rebuild went 123 ms → 35.7 ms on the way |
| **V1** — traffic you can see | **done** 2026-09-06 | `25adbc3` | `budget_gate` with cars; `reports/smoke-V1-a.png`; two `screenshot.mjs` runs byte identical under `?life=0` | `test/cars.test.js` (14) — **not** `test/traffic.test.js`, which is the engine's; spec §9.1a. Load sets the **speed** and density follows, which is the reverse of §9.1's order and the reason the first build looked the same at every load |
| **V3** — ground that is not a checkerboard | **done** 2026-09-06 | `ec6ce50` | `reports/smoke-V3-{before,after}-span{default,24,12}.png`; rebuild 10.2 → 11.6 ms on a saturated 128×128 | `test/ground-colour.test.js` (11); spec §5.1a. **Q28**: the distance-to-street tone is a two-ring flood, not a corridor query per tile — the specified way measured 16.6 ms against a 15 ms budget |
| **V4** — real relief | **done** 2026-09-06 | `f13b0dd` | `play_smoke` picks on a slope and the ghost stands on the ground; `reports/smoke-V4-cliff-span10{,-zoning}.png` at an 18° pitch on an 84 m `hilly` map | `test/picking.test.js` (10); the flat-layer audit is spec §5.6. **Q29** — the overlay wash was the one layer still floating — is closed by ruling 041, built in V7; `smoke-V4-*-zoning.png` and `-landValue.png` are superseded by `smoke-V7-slope-*.png` |
| **V5** — the perspective play camera | **done** 2026-09-06 | `556fa0a` | `play_smoke` and `budget_gate` in **both** projections (4 viewport/projection combinations; 2 × 3 tiers × 4 spans); `style-sheet` in both; `reports/smoke-V5-*.png` at a 20° pitch | `test/lod.test.js` (+10), `test/input.test.js` (+4), `test/settings.test.js` (+2); spec §8.1a. Orthographic is **byte-identical to V4** at two zooms, checked against a worktree of `f13b0dd`. **Q30** (ortho `tilePixels` on a portrait screen) is closed by A32, built in V7 |
| **P1** — toon shading and the anime rig | **done** 2026-09-06 | `044da85` | `style-sheet` in **both** projections — three styles that differ in shading, not tint; `client_smoke` painted; `budget_gate` (toon costs no triangles and no draw calls: painted and plain report identical counts) | `test/toon.test.js` (17); spec §7.1a. Two findings: the painted palette collapsed for a deuteranope at 0.042, and `shadowRadius`/`shadowIntensity` had been in the rig table since it was written with nothing reading them |
| **E2** — the baker and the chunk cache | **done** 2026-09-06 | `7f8b595` | `budget_gate` gains four street-chunk checks on the saturated 96×96 at High: **9 chunks live, 9 draw calls, 5,184 triangles, build p95 1 ms** against an 8 ms budget, and **0 rebuilds** over six frames of an unchanged city | `test/merge.test.js` (9), `test/chunks.test.js` (11); spec §6.4a. The merge is pure typed-array arithmetic so it can be tested in node; `chunkHash` covers the buildings' RECORDS as well as their tiles |
| **E3** — ribbons | **done** 2026-09-06 | `d4f19d3` | `budget_gate` green on all 32 rows plus the three opening spans; street chunks **9 live, 9 groups / 9 meshes, 76,294 triangles, build p95 7 ms** against an 8 ms budget, **0 rebuilds** over six frames. `reports/smoke-E3-{street,junction,slope}.png` | `test/ribbon.test.js` (18, incl. winding-against-normals in both directions, `dashes` over a bend, `clip`, `trim`), `test/lod.test.js` (+2: L3 is a zoom; a baked chunk is charged once a frame), `test/world.test.js` (+1: `surfaceAt` puts the pavement a kerb above the carriageway); spec §5.2–5.3 |
| **R1** — review fixes after E3 | **done** 2026-09-06 | `a4b8d26` | `budget_gate` gains three car rows on a live page: **15 cars in the pools, 6 moving, no pool hidden with cars in it**. All eight findings have a test or a gate row; the 128×128 model rebuild is **80.0 ms** (lanes 53.0 of it) and recorded as **Q51** | `test/cars.test.js` (+4), `test/governor.test.js` (+3), `test/lod.test.js` (+2), `test/render.test.js` (+2), `test/streaming.test.js` (+1); `client/world/orbit.js` is new and pure; spec §3.4a |
| **E4** — the street camera and collision | **done** 2026-09-06 | `4e7cc80` | `walkthrough`: 8,907 legs, **161 km walked, 0 unfinished, 0 refusals, 0 cliffs**, 1,127 lots walked into head-on and **0 entered**, 395,230 blocked steps. `passability`: 32,659 samples, 8,461 enclosed, narrowest **26.00 m**. `play_smoke` enters and leaves by key and by zoom on both viewports × both projections. `reports/smoke-E4-{street,pavement}.png` | `test/collision.test.js` (10), `test/walker.test.js` (9); spec §8.1b |
| **E5** — street-level facades | **done** 2026-09-06 | `a5d6c8d` | `budget_gate` High on the saturated 96×96: **25.7k triangles a chunk**, 8 live holding 205,864, **2 meshes a group**, build p95 **6 ms**. A facade is 700–1,100 triangles. `walkthrough` and `passability` still clean. `reports/style-sheet-street.png` (all three styles from the pavement), `reports/smoke-E5-{street,shopfront}.png` | `test/facade-spec.test.js` (13), `test/facade.test.js` (8), `test/roof-kit.test.js` (9), `test/props-l3.test.js` (6); spec §6.2a, §6.5 |
| **E6** — time of day | **done** 2026-09-06 | `ac7a2f5` | `budget_gate` gains four night rows on the saturated 96×96 at High: **266,538 triangles of 320,000, 44 draw calls, 8 lamps lit of 269 held**, night reaching exactly 1. `a11y_smoke` measures the overlay bands at both hours (**122 apart by day, 41 at night**, floor 30); `ui_smoke` drives all four settings values through the panel. `reports/smoke-E6-{night,sunset}.png` | `test/time-of-day.test.js` (14), `test/night-lights.test.js` (7), `test/settings.test.js` (+2); spec §7.3a |
| **P2** — ink and grade | **done** 2026-09-06 | `0111c95` | `budget_gate` gains three painted rows on a High page loaded with `?style=painted`, and the check that the counted triangles are the CITY's rather than the quad's. `style-sheet` shoots all three styles from the pavement with the post passes on and off (`reports/style-sheet-street{,-nopost}.png`); `reports/smoke-P2-{ink,noink}.png` is a road at a grazing angle with no ink on it | `test/post-ink.test.js` (11), `test/render.test.js` (+3); spec §7.4a |
| **V6** — lots with something on them | **done** 2026-09-06 | `b3f16bb` | `client_smoke` hashes every variant's vertices: **6 distinct silhouettes of 6** in all four categories, where before it was 4 of 4 with two categories carrying a clone. `budget_gate`, `walkthrough`, `passability` and the other ten gates green. `reports/smoke-V6-{city,suburb}.png`, `reports/style-sheet.png` re-baselined | `test/kit.test.js` (8); spec §6.6a, art-direction §3.1. `VARIANTS` was declared in two files and is now declared in one |
| **R2** — review fixes after R1 (§2d) | **done** 2026-09-06 | `06102b0` | All fourteen findings plus a fifteenth found doing them; `budget_gate` pins `?style=plain`, `a11y_smoke` gains a reduced-motion baseline that is not zero | The blank page was a temporal-dead-zone `ReferenceError` behind an uncaught `play()`; **Q59**, **Q60** |
| **V7** — overlays as a texture on the ground (ruling 041), amended in §2d | **done** 2026-09-07 | `7080bd5` | `budget_gate`: overlay on **70,016 triangles against 70,016 off** (0 extra) at 38 draws, and the territory toggle **rebakes 8 of 8 live chunks on, 0 while it stays on, 8 coming back off**. `a11y_smoke`: three shots of one `hilly` city at a 16° pitch differing only in the wash — bands **102/37** and **77/32** apart (median / darkest twentieth) against a floor of 30. `play_smoke`: the overlay button pressed on all four viewport/projection pairs, **6,042 of 7,540** sampled pixels move with it on and **0** keep it after. `reports/smoke-V7-{slope,verge,territory}-*.png` | `test/overlay-texture.test.js` (7), `test/chunks.test.js` (+1: the territory salt), `test/ground-colour.test.js` (+3: `natural()`), `test/facade-spec.test.js` (+2 source), `test/lod.test.js` (+1: A32). The wash mixes over `outgoingLight`, not into `diffuseColor` — before the light it failed the contrast floor at 25. **Q61** |
| **E7** — pedestrians | **done** 2026-09-07 | `f77c361` | `budget_gate` gains a crowd row: **120 people held, 63 on screen, 42 triangles each** — 5,040 of 320,000 at the cap, against **53,462 spare** in the night frame. `walkthrough` with the furniture solid: 8,907 legs, **161.04 km, 0 unfinished, 0 refusals, 0 cliffs**, 399,901 blocked steps over **5,609 solids** (E4: 1,129). `passability`: **0 too narrow**, narrowest 11.14 m, 25,560 of 32,659 samples enclosed (E4: 8,461). `reports/smoke-E7-{street,person,city,night}.png` | `test/nav.test.js` (15), `test/pedestrians.test.js` (13), `test/street-furniture.test.js` (8), `test/collision.test.js` (+4), `test/cars.test.js` (+4: A45), `test/lod.test.js` (fixtures). New pure modules: `world/polyline.js`, `world/nav.js`, `world/street-furniture.js`, `life/pedestrians.js`. Spec §9.3, §8.1b. **Q62**, **Q63** |
| **R3** — streets graded along their length, then taller hills (A42) | **done** 2026-09-07 | *this slice* | `walkthrough` reports both numbers now: steepest street **37.1% → 18.8%** on the saturated 96×96, the walker's worst ground jump **0.86 m → 0.40 m** over 2 m, **8 of 773** corridors left over because their two junctions are further apart than 15% allows. `reports/smoke-R3-{ungraded,graded}.png` is the steepest street before and after (**28.7% → 15.7%**); `smoke-R3-relief{05,10}.png` is the frame that kept `reliefM` at 0.5. All fifteen gates green. | `test/grade.test.js` (19), `test/world.test.js` (+4). New pure module `world/grade.js`; ruling 038 amended with the relief table; spec §4.2. Levelling the junction box mattered as much as grading — 35.5 of the field's worst 37.1% was the blend dragging a climbing street up to meet the one crossing it. **Q64** |
| **E8** — water | **done** 2026-09-07 | *this slice* | `client_smoke` **72 draws / 79,931 triangles** at span 9, against 70 / 77,271 before — one draw call and 2,660 triangles for every drop of water on the map. `walkthrough` and `passability` unchanged; all fifteen gates green. `reports/smoke-E8-{shore,night,city,causeway}.png` — a shore from the pavement, and the same shore at midnight | `test/water.test.js` (15), `test/collision.test.js` (+3: the walker stays out), `test/lod.test.js` (fixtures). New pure module `world/water.js`, plumbing `render/water.js`; spec §5.5, §4.2. Three deviations from §5.5, each measured: the level is per TILE (one global was 47.5 m against a riverbed at 14 m), one mesh not one per chunk (16 draw calls put `client_smoke` at 89 of 80), and LIT not unlit (three dims colours in linear space, so an unlit river glowed through a black city). **Q58 answered as A46**; **Q65**, **Q66** |
| **V8** — the street, finished | **done** 2026-09-07 | *this slice* | `budget_gate`: street chunks **269,940 triangles over 8** (a chunk is 33.7k against E5's 25.7k), build p95 **7 ms** of 8, night **289,446 of 320,000**; every other row unchanged. `client_smoke` 72 draws / 79,931 at span 9 — three new pools and no new draw call. All fifteen gates green. `reports/smoke-V8-{street,junction,night,dusk}.png` | `test/atmosphere.test.js` (10), `test/signals.test.js` (11), `test/foliage.test.js` (9), `test/minimap.test.js` (+6), `test/cars.test.js` (+4), `test/audio.test.js` (+5). New pure modules `render/atmosphere.js`, `render/trees-l3.js`, `world/foliage.js`, `world/signals.js`; spec §6.6b, §9.2, §9.4a. The dome had to learn to follow the eye; two things were paid for in buildings before the ladder was put back. **Q67**, **Q68** |

**Deviations from this document, each with the measurement that forced it and a
question so it can be reversed cheaply:**

- **V3** was specified to use `model.nearestCorridor` per tile with a chunk-level
  cache, held to ≤ 15 ms. It measured **16.6 ms** against a 10.2 ms baseline. A
  flood outward from the road layer, stopped after `ceil(urbanReach / tileM)`
  rings, is exact at the granularity the colour is computed at and gives
  **11.6 ms** (Q28).
- **V4**'s zone tint was to be checked as a quad and given a skirt or split into
  triangles. Neither: it stopped being a quad and became a colour of the terrain
  mesh, which is free and seamless. The overlay wash could not follow (Q29).
- **V1**'s tests were named `test/traffic.test.js` by this document. That file is
  the engine's traffic. They are `test/cars.test.js`.
- **V5** also had to change `countScene` and `estimate`, which the item did not
  mention: a per-chunk plan that is priced at the frame's plan is an estimate
  77% over the truth, and an over-charging estimate sacrifices detail for
  nothing (P35). Terrain is counted against the frustum footprint for the same
  reason.
- **E2** put the chunk size in `data/cityviewer.json` as `chunkTiles`: three
  things key off it — the terrain mesh's rebuild unit, the LOD's per-chunk plan
  and the street cache's bake unit — and they had three copies of `16`. And
  `streetChunks` is read as a **count** (none / 4 / 9), not a radius, which is
  what ruling 040's table says and what E5's "9 chunks" gate needs.
- **P1**'s ramps are a separate pure module (`client/render/ramps.js`) rather
  than living in `style-assets.js`, so the arithmetic can be tested in node —
  three cannot be resolved there, which the item's own "test the ramp arrays
  instead" anticipated.
- **E3–V6** each carry their own deviation list in the item above, and the
  pattern in all of them is the same one: **the item asked for a texture and the
  answer was geometry**, or the other way round. E3's marking canvas is dashed
  ribbons (Q31), E5's L2/L3 agreement is one shared `familyColour` rather than a
  page check that two copies agree, P2 folds three passes into two (Q48), and
  E6's presets scale the rig rather than replacing it per rig (Q44).
- **E5 moved the tier budgets** from 200k/80k/40k to **320k/140k/40k** (Q37).
  They were a V2 prediction; nine chunks of real facade is 200k on its own, so
  the ladder was quietly selling the cars and the props to pay for the buildings
  behind them and nothing went red. Every number measured before E5 belongs to
  the old budgets.
- **V6 was not pure content**, which the item called it: `VARIANTS` was declared
  in both `client/world/params.js` and `client/render/building-kit.js` and the
  two had to agree, two categories already carried a clone, and a front garden
  turned out to be a setback.

**Three gates were wrong about the game before they could see it**, all of the
same shape and all fixed in place: `lobby_smoke` hashed after an await, and
`play_smoke` and `mvp_acceptance` projected tile centres at `y = 0` to decide
where to click, which with relief aims down the slope.

**Eleven defects have now lived where the unit suite structurally cannot reach.**
`MARK_LIFT` was undefined on a branch only taken below 20 px a tile (V4);
picking built an orthographic ray, exact at the centre of the frame (V5);
`export { CHUNK } from "…"` re-exported without binding the name locally, so
every use of it in `terrain.js` was `undefined` and the page threw on load (E2);
E3's ribbons flipped a face's NORMAL when it pointed down and left the WINDING
alone, so half the streets in the city were lit correctly and then culled, with
the triangle count rising exactly as expected; E5's prop pass called
`corridorsIn` with five arguments where it takes six, so every kerbside point
came out `NaN` and the pass built nothing at all for a whole slice; and P2's ink
shader named a local `step`, which shadows the builtin the same shader calls, so
it did not compile for three runs and looked like the finish being too subtle.

Five more since: R2's blank page, a temporal-dead-zone `ReferenceError` behind an
`await play()` with no catch, so an unhandled rejection printed nothing at all
and `client_smoke` stayed green because it drives `tools/shoot.html` and never
`index.html`; E7's crowd, where three separate placement defects hid behind a
count that said 120 people were on screen while the street underfoot had two;
E8's water, where an unlit surface dimmed by the night preset's hemisphere
glowed through a black city because three multiplies colours in LINEAR space and
0.34 there is about 0.6 to the eye; V8's sky dome, correct only because it was
1,800 tiles away from a camera that was always near its centre, and a pale ball
in the middle of the map the moment it was scaled to 85; and V8 again, where the
night frame's budget LADDER — not its triangle count — was the instrument that
caught seven-sided tree blobs and 36-triangle signal lenses being paid for in
buildings.

All eleven are in modules that import three, which node cannot resolve, or in
numbers no assertion was watching. The browser gates, a screenshot somebody
opens, and the `lod` string beside the triangle count are the only instruments
that can see them.

**And two of them were found only because something downstream needed the
output for a second purpose.** E5's prop pass returned an empty list, which is
indistinguishable from a chunk with no streets in it; what exposed it was E6
asking where the lamps were and getting nought. E3's culled ribbons were
exposed by painting the carriageway magenta and floating it five metres in the
air, after an hour of reasoning about depth precision. When a pass can
legitimately produce nothing, count what it produced.

**A third pattern, which E7 and R3 both paid for: measure where the thing
actually is, not whether it exists.** E7's `stats.peds` said 120 and the street
was empty, because "in the visible box" and "where the player is looking" are
different questions under perspective at a low pitch; what found it was a
screenshot with the crowd painted magenta at three times size and then a
histogram of distance from the eye. R3 spent an hour concluding that grading
streets had made them steeper, because the "before" it compared against was the
bare land along a centre line and the code that shipped had returned the land
blended across every nearby corridor. Give the change an off switch (`?grade=0`)
and measure both from one harness.

**And two bugs were found only because a gate drives more than one
configuration.** V5's picking built an orthographic ray — exact at the centre of
the frame and wrong at its edges, so a single-configuration gate would have
passed it; and the perspective eye distance was derived from `span` as if it
meant the vertical extent, which is right in landscape and wrong on a portrait
phone. Desktop-perspective green beside phone-perspective red is the pair that
named the second one.

## 2b. Review round after E3 (2026-09-06)

*Read on `dev_night` at `d4f19d3` plus the uncommitted E4 work. Suite, `client_smoke` and
`budget_gate` re-run by the reviewer: smoke and budget green; the suite is red only on
`test/collision.test.js`, which is E4 in progress and uncommitted. Everything V2–E3 stands.
Six findings are real defects, two are unwired promises, and E4 inherits three constraints.
They are the **R1** and **V7** items below; do R1 before finishing E4, because E4 builds on the
camera and the cars.*

**What actually happened (2026-09-06).** R1 was not done before E4 — E4, E5, E6, P2 and V6 went
first and R1 last, at `a4b8d26`. Two of the review's own E4 constraints were fixed inside E4
anyway (the near plane per mode, and `mode !== "city"` not meaning orthographic), and the rest of
R1 was unaffected by the four slices in between. **V7 is still not started** and is the last
outstanding review item.

### R1 — Review fixes (S)

Each is a few lines and each has a test that can see it. Commit as `slice-R1`.

1. **Cars are posed everywhere and counted everywhere.** `traffic.pose` walks every car in the
   city and `counts.cars = traffic.count()`. On the saturated 128×128 (3,660 cars × 82
   triangles) that is 300k triangles a frame under a 200k High budget: the ladder drops cars
   at every zoom and the pools carry the cost anyway. Pose only cars inside `bounds` (a car's
   link has `tiles`; the first tile is enough) and count the same set. Test: a city with cars on
   two streets and bounds around one of them counts and poses only that street's cars.
2. **Moving cars are invisible when no parked car of that variant is in view.**
   `updateInstances` sets `mesh.visible = mesh.count > 0` and `traffic.pose` pushes afterwards.
   Re-derive visibility (and add the cars' triangles to `result.triangles`) after the pose, in
   `scene.js`. Test in `budget_gate`: a street-zoom row with `?life=1` reports car instances > 0.
3. **A car in a junction takes a stranger's speed.** `desired.get(link.kind === "block" ?
   link.id : link.from)` — `link.from` on a turn link is a node id, and `desired` is keyed by
   link ids. Carry the entering link's desired speed on the car (`car.v0`) when it moves onto a
   turn. Test: a car entering a turn from a loaded link keeps that link's speed through the box.
4. **The governor's `supersample` rung does nothing**, and the `pixel` post pass is not in the
   ladder at all (`allows("pixel")` is always true). Wire `supersample` to a pixel-ratio
   step-down (`ratioFor` → 1) and put `pixel` in `SACRIFICE` before `ink`. Test in
   `test/governor.test.js`: after the third sacrifice `allows("supersample")` is false; a
   page-level check that `renderer.getPixelRatio()` drops.
5. **`worldChanged` clears the street cache.** Every build action throws away nine baked chunks
   and re-bakes them one a frame; `chunkHash` exists precisely so that only the chunk that
   changed rebuilds. Remove `streets.clear()` from `worldChanged` and let `nextBuild`'s hash
   comparison decide. Test in `test/streaming.test.js`: after a change in one chunk exactly one
   entry is stale.
6. **The camera and the budget disagree about where the eye is** (A34). `applyPose` orbits
   `view.groundY`; `tilePixels` and `visibleBounds` orbit `y = 0`. Move the eye arithmetic into
   `client/world/orbit.js` — `eyeOf(view) → { x, y, z }` from target, yaw, pitch, distance and
   groundY — and call it from `camera.js`, `lod.js` and `picking.js`. Test: on a view with
   `groundY = 4`, `tilePixels` at the target equals the orthographic value, as V5's test already
   asserts for `groundY = 0`.
7. **`scene.fog = new THREE.Fog(...)` every frame.** Mutate `fog.near`/`fog.far` instead.
8. **The model rebuild is 35.7 ms on a 96×96 per build action**, and the ally measured nothing
   on a 128×128. Measure it there; if it is over one frame (16 ms), the corridor and lane
   derivation goes per chunk keyed by `chunkHash` — the deferral E0 recorded in
   `specs/engine/03-architecture.md`. Record the number either way.

**Done when** all eight have a test or a gate row, `budget_gate` shows `cars > 0` at a street
zoom on the 128×128 fixture with the ladder above "cars dropped", and the dev-log carries the
128×128 model rebuild time.

**Done, with three notes.** (1) Finding 8 measured **80.0 ms** on a 128×128 — over the one-frame
threshold it named — so the per-chunk derivation it points at is now due. It is a slice, not a
fix, and it is **Q51** rather than part of this one. (2) Finding 3 has no behavioural test: the two
key spaces overlap, so the wrong answer is a plausible speed rather than a wrong one, and a car
crosses an 8 m junction box in under a second so nothing measurable about its position changes.
It is asserted against the source, plus a new observable `car.v0`. (3) Findings 6's two constraints
for E4 — the near plane per mode and `mode !== "city"` not meaning orthographic — were already
fixed in E4; `picking.js` still branched on `=== "city"` and does not now.

### V7 — Overlays as a texture on the ground (S) — ruling 041

- `client/render/overlay-texture.js`: a `DataTexture` of `width × height` bytes (`RedFormat`,
  `NearestFilter`), filled from `bandAt` per tile when the overlay changes; a second byte plane
  for the territory pattern later.
- The terrain material only: `onBeforeCompile` adds `uOverlay`, `uOverlayOn`, `uMapSize`,
  samples at `worldPosition.xz / tileM` and mixes `OVERLAY_COLOURS[band]` (as a 4-entry uniform
  array) over the vertex colour at the wash's opacity. The marks stay instanced at `heightAt`.
- `updateInstances` loses the `ovl` pool; `estimate` loses the overlay term.
- Fix A32 in the same slice: orthographic `tilePixels` reads `canvasHeight / verticalSpan(view)`.
  Re-baseline `reports/smoke-V7-*.png` and say so in the dev-log.

**Tests first.** `test/render.test.js`: the byte array has one entry per tile and every value
`bandAt` returns has a colour; `test/lod.test.js`: portrait ortho `tilePixels` is
`canvasHeight × aspect / span`. **Gate.** `a11y_smoke` overlay contrast on the `hilly` fixture
at a low pitch; `budget_gate` with one overlay-on row; `play_smoke` toggles an overlay and
reads a pixel.

### Constraints E4 inherited — all resolved

- **Near plane.** ✅ E4. `applyZoom` sets `near` and `far` per mode: 0.02 and 100 tile units in
  street mode, 0.5 and 4,000 otherwise. A near plane of half a TILE is ten metres and clipped the
  pavement the walker was standing on.
- **`mode !== "city"` is not "orthographic".** ✅ E4 for `tilePixels`, `visibleBounds` and
  `applyAtmosphere`; ✅ R1.6 for `groundRay`, which was still building an orthographic ray in
  street mode. All of them go through `client/world/orbit.js` now. `chunksNear` still orders by
  the orbit target rather than the eye — in street mode those are the same point, so what is left
  is a low-pitch CITY view (**Q53**).
- **The working tree is red.** ✅ E4. `collision.js` came out as boxes rather than wall segments
  (a segment push-out does not know which side of itself it is on) and is in the precache.
- **Q34** (the planning question "how does a phone walk") is answered: tap-to-walk along the
  corridors, no stick. Note that E4 also wrote three slice questions as Q34–Q36 before noticing
  the collision; they are **Q41–Q43** now, and `test/docs.test.js` is what caught it.

### Also noted — where they stand

- `main` is at `491f9bf`, now **49 commits** behind `dev_night`, including N22–N30 and the whole
  cityviewer lane. Merging is the owner's call; until then every gate and every doc test speaks
  for `dev_night` only.
- ✅ **Done in V7 (A38).** The kerb was drawn in `palette.roadMark` and the verge in
  `palette.lawn` regardless of the terrain under it — fine for grass, wrong on sand or rock. The
  verge asks `ground-colour.js` for the land it stands on now; the kerb stays `roadMark`
  (**Q52**, closed).
- ✅ **Done in R2 (A39).** `chunksNear` filters by the frustum footprint and then orders by
  distance, so a chunk behind the camera is never baked before one on screen (**Q53**, closed).
  E7 found the same shape one lane along and fixed it the same way: the crowd is spent nearest
  the EYE, not nearest the middle of the visible box, because under perspective at a low pitch
  those are a hundred metres apart.

## 2c. Questions this lane has raised

*The live list is the bottom of `dev-questions.md`; this is the index by slice, so a reviewer can
find the assumption an item was built against without reading all of it.*

| Slice | Questions |
|---|---|
| V2 | Q27 the Low tier's dropped utility ribbons |
| V3 | Q28 the two-ring flood instead of a corridor query |
| V4 | Q29 the overlay wash floats (**closed by ruling 041 in V7**) |
| V5 | Q30 orthographic `tilePixels` on a portrait screen (**A32, done in V7**) |
| E3 | Q31 dashed ribbons, not a marking canvas · Q32 the estimate's floor · Q33 the camera orbits the ground |
| E4 | Q41 nothing grades a road along its length (**A42, done in R3**) · Q42 the walker lives in `life/` · Q43 drag-look, no pointer lock |
| E5 | Q37 the tier budgets moved · Q38 pure modules in `render/` · Q39 the two faces nobody sees |
| E6 | Q44 a preset scales the rig · Q45 48 ticks a day (**A41, done in R2**) · Q46 the lamp pool follows the eye |
| P2 | Q47 should the render style be a setting (**A36: yes — the row is in Settings and `painted` is the High default, done in R2**) · Q48 two passes, not three |
| V6 | Q49 is a hedge worth drawing at L2 · Q50 the L2 box and the L3 facade do not share a footprint |
| R1 | Q51 when the model derivation goes per chunk (**A37: profile and cut first, done in R2 — 80.0 → 53.7 ms; the live question is Q60**) |
| The R1 doc pass | Q52 the kerb and verge ignore the terrain under them (**done in V7**) · Q53 `chunksNear` orders by the target (**done in R2**) |
| Review after R1 | Q54, Q55, Q56 — all three answered by Kjell (A42–A44) and all three built; A35–A41 close Q34–Q38 and Q42–Q53 |
| Omissions pass | Q57 cars and the walker (A45: cars yield, **done in E7**) · Q58 a road over water (**A46: a causeway works, done in E8**) |
| R2 | Q59 reduced motion stills the street rather than emptying it · Q60 the derivation after R2's cuts (**53.7 ms**) |
| V7 | Q61 nothing in the interface selects the territory overlay — it is a draw option a gate passes |
| E7 | Q62 pedestrians walk by hash rather than by plan · Q63 the crowd is a function of the camera and the traffic is not |
| R3 | Q64 should a junction be allowed to move up or down — fixed node heights are what stop 15% being kept on steep ground |
| E8 | Q65 should a river be CUT into the land rather than laid on it · Q66 the water surface is one unculled mesh for the whole map |
| V8 | Q67 every junction on an ordinary city grid is signalled — true since E1, invisible until the lights were drawn · Q68 a night frame at High spends 93% of its budget on eight baked chunks |
| Review after V8 (§2f) | Q59, Q62, Q63, Q65 closed by the reviewer (A47–A50); Q60 → worker W3, Q66/Q68/Q64 → measurement D6/D3, Q61 → Wave 5; **Q67 wants Kjell** — a recommendation is in the question |

**Both of the two that wanted a decision are answered and built.** Q47 (should the render style
be a setting) is A36 — a `style` row beside Quality, `painted` the default on High, done in R2;
by ruling 026's standard two of the three styles were unreachable until then. Q51 (when the
derivation goes per chunk) is A37 — profile and cut first, which R2 did: **80.0 → 53.7 ms** on a
128×128. The live successor is **Q60**, because 53.7 ms is still four frames after every build
action and what is left is the lane graph's own construction rather than anything the ground does.

**Eight of this lane's questions are open after the last review** — Q32, Q39, Q60, Q61, Q64, Q66, Q67, Q68 — and **none of them blocks the
next lane.** Q61 and Q67 are reachability and simulation questions belonging to Wave 5 and a
traffic slice; Q60 is a slice of its own; Q32, Q39, Q64, Q65, Q66 and Q68 all say some version of
"measure it on a real device or a bigger map first", which is `workitems-measurement.md`'s whole
subject.

## 2d. Review round after R1 (2026-09-06)

*Read on `dev_night` at `b1ed16c`. The suite (twice), `client_smoke`, `budget_gate`,
`walkthrough`, `passability` and `play_smoke` re-run by the reviewer: all green. E4, E5, E6, P2,
V6 and R1 are accepted. What follows is what reading found that the gates cannot see, as one
small fix slice (**R2**), one decision slice (**R3**), and amendments to V7 and E7. Do R2, then
V7, then E7; R3 is unblocked by A42 and follows V7.*

### R2 — Review fixes after R1 (S)

Commit as `slice-R2`. Each item names its test.

1. **A building is a member of two chunks by two different rules.** `bakeLots` builds a lot
   whose **centre** is in the chunk; `instances.js` skips the L2 box whose **anchor tile** is in
   a baked chunk. A 2×2 building straddling a boundary is either drawn twice (facade plus box)
   or not at all. One rule, in `client/world/chunks.js`: `chunkOfLot(lot)` by centre, used by
   both. Test: a lot straddling a boundary is claimed by exactly one chunk, and the L2 pass
   skips it only when that chunk is baked.
2. **Signs are `MeshLambertMaterial` whatever the style.** In `painted` the fascia is the one
   surface on the street that is not toon-shaded; in `pixel` it is lit on an unlit city; at night
   it is dark while the shopfront under it glows. `signs.js` asks `makeMaterial(style)` for its
   material and sets `map`; the sign mesh gets `userData.emissive` so `setNight` dials it like
   the shop windows. Test: `client_smoke` reports the sign meshes' material type per style.
3. **Leaving the street forgets where you came from.** `leaveStreet` returns to `city` even if
   the player entered from `ortho` (the phone default). Remember the previous mode on entry
   and restore it. `play_smoke`: ortho → street → back lands in ortho.
4. **The day is nineteen seconds long** (A41). `phaseOf(state.tick, 48)` at 400 ms a tick is a
   full cycle in 19 s and 6 s at fast speed. `auto` becomes wall-clock: `DAY_SECONDS = 240` in
   `game.js`, advanced by the frame delta, held while paused. Test: `phaseOf(seconds, DAY_SECONDS)`
   — same function, different clock — and a check that speed does not change the cycle.
5. **The style is a setting** (A36). `client/ui/settings-model.js` gains a `style` row (`plain |
   painted | pixel`), default `painted` on High and `plain` otherwise, remembered; a change
   reports `rebuild: true` the way antialias does and `main.js` rebuilds the renderer. `ui_smoke`
   drives the row; `reach_smoke` finds it; `client_smoke` no longer needs `?style=` to reach
   painted (keep the param for the gates).
6. **Sign names per locale** (A40). `data/names.json` gains `no` with the same count as `en`;
   `facade-spec.js` takes the locale's list; the mirror test covers both lists and their equal
   length. A shop keeps its index across a language change.
7. **The model derivation, profiled and cut** (A37). Two known costs: `deriveLots` calls
   `nearestCorridor(cx, cz, Infinity)` per road-less lot (a full scan each), and `deriveLanes`
   samples `heightAt` per lane point where the corridor centreline heights are already known.
   Fix both, re-measure `tools/lanes_dump.mjs` on the 128×128 and record the split. If it is
   still over 16 ms, write the per-chunk slice up as its own item; do not start it here.
8. **Chunks are baked behind the camera** (A39). `street-chunks.js` filters `chunksNear` by
   `bounds.footprint` before taking the tier's count, then orders by distance to the target.
   Re-measure the "9 chunks live" gate rows and record what changed.
9. **Two `THREE.Color` allocations per frame in `applyAtmosphere`**, which runs twice a frame
   in city mode. Cache the palette colour and reuse one scratch colour.

**Done when** all nine have a test or gate row, `budget_gate` and `play_smoke` are green in both
projections, and the dev-log carries the new 128×128 derivation split.

**Done 2026-09-06 as `slice-R2`, all fourteen** (nine here plus §2e's five). Four notes.
(1) Finding 7 cut the 128×128 rebuild **80.0 → 53.7 ms** (corridors 7.3, ground 0.0, lanes 41.3,
lots 15.0) — still over a frame, and 28 ms of what is left is the graph construction rather than
the ground, so the per-chunk slice stands (**Q60**, unchanged from Q51). (2) Finding 12 stills the
street rather than emptying it: reduced motion sets `life: false`, which settles the traffic and
stops the clock, and the gate asserts no car MOVES over thirty frames (**Q59**) — the review asked
for a count of zero, and an empty road is a different city rather than a calmer one. (3) Finding 8
is also the answer to **Q53**. (4) Finding 5 made `painted` the default on High, so
`budget_gate` now pins `?style=plain`: every number in its history was measured on plain, and the
painted rows load their own page.

### V7 — amendments

**Done 2026-09-07 as `slice-V7`, both.**

- **Verge colour from `ground-colour.js`** (A38): `streets-l3.js` colours the verge by the tile
  under it; the kerb stays `roadMark`. `ground-colour.js` grew `natural(x, y)` — `tile()` cannot
  answer, because the verge is inside the road tile (ruling 035) and `tile()` rightly says
  tarmac. Emitted as one strip per run of spans the ground agrees about, which on most streets
  is one. `reports/smoke-V7-verge-{sand,grass}.png` is the same frame with the terrain switched.
- **Territory reaches the facades** (Q56): `chunkHash(state, cx, cy, territory)` takes the flag
  as a salt so toggling the overlay marks every baked chunk stale and they rebake with
  `showOwner`; the L2/L3 agreement then holds under the overlay too.
  **The gate is `budget_gate`, not `a11y_smoke`** — nothing in the interface selects territory
  (**Q61**), so what the gate drives is the renderer's own `draw`, wrapped for the duration.
  Wrapping matters: passing the flag to a draw of the gate's own alternates with the page's frame
  loop, and the first version measured the cache thrashing between the two answers.
  8 rebakes on, 0 while it stays on, 8 coming back off. `reports/smoke-V7-territory{,-off}.png`.

### E7 — amendments

**Done 2026-09-07 as `slice-E7`, both.**

- **Street furniture is solid** (Q55/A43): lamps and hedges are thin boxes in the collision
  world, derived in `client/world/street-furniture.js` from the same functions
  `render/props-l3.js` builds the geometry from; bins are not. It moved a constant — a lamp
  stood at `half + sidewalk / 2`, which is the middle of the pavement and therefore the line
  `walkthrough` walks, so with the posts solid every pavement leg stopped on one every 24 m.
  `props.lampInset` puts it 0.5 m out from the kerb. `passability` **0 too narrow**, narrowest
  11.14 m of a needed 0.88.
- **Price the pedestrians first.** Measured: **42 triangles a person**, so the cap of 120 is
  **5,040** against the **53,462** the night frame leaves (263,388 of 320,000). The night row is
  unchanged. People are the last of the three living things on the sacrifice ladder for the same
  reason — dropping the whole crowd buys 1.6% of the budget.

### R3 — Streets graded along their length (M) — **done 2026-09-07 as `slice-R3`**

Node heights are fixed (the land at each junction), each corridor's profile is smoothed between
its two nodes to a maximum grade (data: `road.maxGrade`, 0.15) with cut and fill, and
`heightAt` inside the corridor reads the profile. Everything that stands on a street re-seats
automatically. Gate: `walkthrough` reports the steepest grade before and after; `budget_gate`
unchanged; screenshots of the steepest street on the `hilly` fixture before and after.

**As built.** Two things the item did not say and the measurement did. The junction BOX has to
be level as well — pinning the node alone left the blend dragging a still-climbing street up to
meet the one crossing it, which was 35.5 of the field's worst 37.1%. And the box has to be
capped at a sixth of the street: a fixed 6.5 m each end leaves a 20 m block seven metres to make
its whole height change in, which turned a 17% hill into a 29% street on two of the three
fixtures. `reliefM` stays 0.5 (**ruling 038 amended**, with the table). **Q64**.

### Also noted

- `main` is now **49 commits** behind `dev_night`. Every gate speaks for `dev_night`.
- **Still open.** The ink post's own 1.5× supersample is chosen at creation from the pixel ratio
  and is not what the governor's `supersample` rung reduces; harmless, because ink is sacrificed
  before supersample, but the two words should not mean two things. Fold it into `applyGovernor`
  when P2 is next touched — which nothing in this lane did, so it is still true.

## 2e. The omissions pass (2026-09-06)

*Kjell answered Q54–Q56 (A42–A44) and asked for a pass over what the lane has overlooked. Read
against `specs/engine/`, the rulings and `specs/plan.md`; the gates were green at `b1ed16c`
and none of this is caught by one. Five items join R2, three are new slices, and the rest are
noted for the record.*

### R2 — five more items

10. **Lamps and parked cars are drawn twice inside a baked chunk.** `instances.js` gates
    markings, poles and networks on `drawn` but not `props`: the L2 lamp and parked-car pass
    still runs in a chunk whose L3 pass has placed the real lamps — which is why E5's
    screenshots showed lamps while its prop pass built nothing. And the parked car sits at
    `±0.26` tiles = 5.2 m from the centre line, on the **pavement** at L3 (the carriageway is
    4 m half-width). Gate `props` on `drawn` for paved tiles; tufts on grass stay. Test in
    `client_smoke`: lamp instances are zero inside a baked chunk.
11. **`renderer.dispose()` disposes the post pass and the context and nothing else.** The
    pools, the terrain chunks, the sky, the lamp lights and every baked street group survive a
    new city. `dispose` walks the scene and disposes geometries and materials, and
    `streets.clear()` runs first. Test: `lobby_smoke` starts three cities in one page and
    `renderer.info.memory.geometries` does not grow.
12. **Reduced motion is ignored by cityviewer.** `main.js` sets `data-motion="reduced"`
    (slice 4.5) and nothing in the renderer reads it: cars stream and the day cycles for a
    player who asked for neither. `life: false` when motion is reduced; `auto` time refuses
    and stays on `day`; the walker still walks because the player drives it.
    `a11y_smoke` sets the preference and asserts the car count is 0.
13. **The lobby diorama runs the full renderer.** `client/lobby/diorama.js` calls
    `createRenderer` with defaults, which since V2–E6 means the High tier, live traffic and a
    day clock behind a start screen. Pass `tier: "low", life: false` and an orthographic mode
    (`mode: "ortho"`, which is what it was drawn for).
14. **Docs drift.** Ruling 040's tier table said 200k/80k until this pass; `README.md`'s
    gate list does not name `walkthrough`, `passability`, `lanes_dump` or `budget_gate`'s tier
    and projection flags; `specs/engine/08` §8.1 still says "street comes in E4". Sync all
    three in R2's doc step; `test/docs.test.js` gains a check that the ruling's table matches
    `data/cityviewer.json`.

**And a fifteenth, found while doing them.** `instances.js` kept its own `const CHUNK = 16` — a
fourth copy of the number E2 put in `data/cityviewer.json` precisely because three things had
three copies. It imports it now.

### R3 — unblocked (A42) — **done 2026-09-07**

Grade to `road.maxGrade = 0.15`; then try `RELIEF_M = 1.0` on the `hilly` fixture, screenshot
both at spans 40 and 12 and from the pavement, keep whichever reads as a place, and amend
ruling 038 with the number. `walkthrough` reports the steepest grade before and after;
`play_smoke` picks on the new slope; `budget_gate` unchanged.

**Kept 0.5, on the numbers.** At a metre a step, 256 of 2,095 corridors on an ordinary *rolling*
map cannot make the 15% Kjell had just set (8 at 0.5) and the steepest street doubles, 16% → 32%.
1.0 is the better picture at city zoom and a road falling off a cliff at street level. The full
table is in ruling 038; the frames are `reports/smoke-R3-relief{05,10}.png`.

### E8 — Water (M) — spec §5.5, Q58 — **done 2026-09-07 as `slice-E8`**

Never built: a water tile is a terrain colour clamped to the water level, so at street level a
lake is a flat blue floor the walker strolls across. One transparent plane per chunk that has
water, at `waterLevel`, drawn after the terrain; the land mesh dips under it so the shoreline is
where the two meet (spec §5.5); `collision.floorAt` refuses a water tile so the walker stops at
the edge (or wades knee-deep — `road.kerb` tall, decide by screenshot); a road on water stays a
causeway at water level with its kerb meeting the plane (Q58). Test: `surfaceAt` on water
returns `water` with `y = waterLevel`; the walker cannot enter it. Gate: `reports/smoke-E8-*`
from a shore at street level; `budget_gate` with a river fixture.

### V8 — The street, finished (L) — **done 2026-09-07 as `slice-V8`**, all six

- **Trees at eye height.** The L2 cones and blobs stand at street level inside baked chunks.
  An L3 tree kit through the baker: a trunk and a cluster of faceted blobs (Higashiyama's
  rule — never a billboard), instanced per chunk, species by terrain.
- **Signal heads and crosswalks** (spec §9.2, A33). Cars stop at invisible lights. A head per
  approach at each junction with the lit lamp an emissive swap by `phaseAt`; crosswalk bars
  and stop bars as short ribbons at the lane graph's stop lines.
- **Headlights and tail lights at night**: two emissive quads per car in the pool, dialled
  with `night`.
- **The minimap** frames the orthographic rectangle and does not know the walker exists.
  Draw the frustum footprint under perspective and a dot for the walker in street mode.
- **Street ambience**: the mixer has a bed since N18; at street level it should carry
  traffic near a busy road and quiet on a residential one, driven by `tiles.traffic` under
  the walker — Higashiyama's `audio.update` shape.
- **Fog and sky in street mode** are derived from the last city `span` and a 1,800-tile dome
  behind a 100-tile far plane. Fixed metres for street fog, and a dome scaled to sit inside
  the far plane, so a low sun is a gradient rather than a clear colour.

### Noted, no slice

- **Real-device performance has never been measured.** Every number in this lane is
  SwiftShader; `specs/plan.md` §11 layer 11 is a native run, and the governor's whole reason
  is a phone. Needs a phone in Kjell's hand and `?debug=1`'s frame p95 written down.
- **The simulation is on the render thread.** `specs/plan.md` §0 says "always a Web Worker";
  `worker/` is empty. Not cityviewer's, but a model rebuild after each build action sits on the
  same thread as a 4 ms tick, and the worker is where the plan put the tick. R2 cut the rebuild
  from **80.0 ms to 53.7 ms** on a 128×128 and it is still four frames (**Q51**, **Q60**); what
  is left is the lane graph's own construction, so the next move is per-chunk derivation keyed
  by `chunkHash`, not another micro-optimisation.
- **Photo mode, tours, an animation lane** (fable51's `Tour`, `capture.mjs`,
  `tour_video.mjs`): out of scope until a demo film is wanted; the walker and the presets
  are the pieces it would be built from.

## 2f. Review round after V8 (2026-09-07) — the lane closed

*Read on `dev_night` at `ed96699`. Re-run by the reviewer: the suite twice, `client_smoke`,
`budget_gate` (every row, both projections), `walkthrough`, `passability`, `play_smoke` (95
checks) and `a11y_smoke` (40) — all green, numbers matching §2a. R2, V7, E7, R3, E8 and V8 are
**accepted**; no fixture hash moved. The new pure modules (`grade.js`, `water.js`, `nav.js`,
`street-furniture.js`, `signals.js`, `foliage.js`, `atmosphere.js`, `overlay-texture.js`) are
the right shape: derived, no `three`, one rule shared by the geometry and the collider. Reading
found one defect the gates cannot see, and it is the largest number this lane has left in the
code. It is **R4**, one short slice, and it goes before `workitems-mainline.md` M2.*

### R4 — Review fixes after V8 (S)

Commit as `slice-R4`. Each item names its test.

1. **Every lane that runs AGAINST its corridor reads the corridor's profile mirrored.** R2's
   `packAlong` maps a trimmed lane's own fraction of length onto `profileOf(corridor)`, which is
   built from `corridor.points` in FORWARD order — and for `dir === 1` the lane's points are the
   reverse. The lane's start, at the corridor's far end, takes the near end's height. Measured by
   the reviewer on the saturated 96×96 (`tools/lib/saturated.mjs`, buildings off), comparing every
   packed lane point's `y` with `model.heightAt(x, z)` under it:

   | links | points | mean error | over 0.5 m | worst |
   |---|---|---|---|---|
   | block, `dir 0` | 3,742 | **0.05 m** | 0 | 0.44 m |
   | block, `dir 1` | 3,742 | **1.79 m** | **2,540** | **12.44 m** |
   | turns (ends taken from the lanes) | 29,848 | — | — | 12.44 m |

   Half of the traffic is posed against the wrong end of its street: on a street that climbs
   twelve metres the cars going up it drive twelve metres underground, and their headlights with
   them. Nothing saw it because `budget_gate` counts triangles, the fixture is mostly flat where
   the screenshots were taken, and `walkthrough` never looks at a car. The `dir 0` residual (0.44
   m) is the same mapping's second error: the trimmed lane's `0..1` is stretched over the whole
   corridor rather than over `[clear(from), len − clear(to)]`, so a lane point a few metres into the
   ramp reads the flat junction box. **Fix:** map by arc length onto the corridor — `want = s0 +
   dirSign × (cum[i] × (len − clear(from) − clear(to)) / packedLen)` — using the `s0` and `dirSign`
   the link already records for E7. (And drop the `i > -1 &&` in `packAlong`'s first loop.)
   **Test** in `test/lanes.test.js`: on a corridor whose two ends differ by 10 m, both lanes' first
   points are within 0.1 m of `heightAt` under them, and the whole graph on the saturated 96×96 has
   no lane point more than 0.1 m off the ground (put the measurement above into the test as its
   era). **Gate:** `lanes_dump` prints the mean and worst lane-to-ground error; a screenshot of the
   steepest street on `hilly` with cars on it in both directions.
2. **`budget_gate`'s "the tier is applied" rows report a stale budget.** The check reads
   `stats.budget` straight after `setQuality` and before a draw, so the log says `low … 320000`,
   `medium … 40000`, `high … 140000` — each the previous tier's number — and the assertion is
   on the tier name only. Draw once before reading, and assert the budget against
   `data/cityviewer.json`'s table, which is what the row is for.
3. **`traffic.placeYield` scans every block link for every yield point, every step.** With
   `rebuildYields` per step and a full crowd on a 128×128 that is yields × ~6,000 links a step for
   a lookup the derivation already knows. Index `blocks` by corridor id once in `createTraffic`
   (`Map<corridorId, link[]>`) and look up. Test: a corridor with two links yields on exactly the
   link the point is on, and `lanes_dump` records the step time with 120 yield points.

**Done when** the three have their tests, `lanes_dump` carries the lane-to-ground numbers, and
`budget_gate`'s tier rows print the right budget.

### The twelve open questions, dispositioned

Four are closed by the reviewer (A47–A50 in `dev-questions.md`): **Q59** (still, not empty —
correct as built), **Q62** (no planner until the film lane needs a person to go somewhere —
`workitems-film.md` F2 now says so), **Q63** (the crowd follows the eye and the traffic never
thins under the city camera — that is the rule, not a gap; the shared helper is written when
`carCap` binds) and **Q65** (a trough is accepted; a cut is the film lane's if a shot wants one).
Seven are handed to a lane and stay open there: **Q60** to the worker lane (W3, with the 53.7 ms
split), **Q66** and **Q68** to the measurement lane (a new D6, a 256×256 row, and D3's
`streetChunks` lever), **Q64** to the same D6 (the `hilly` table is the number), **Q61** to Wave
5, **Q32** and **Q39** unchanged. One wants Kjell: **Q67** — every junction is signalled. The
reviewer's recommendation is in the question: signal a junction only where two corridors of more
than one tile each cross (a four-arm node with real streets on it) and let T-junctions and
minor crossings be give-way, which is a traffic-flow change and re-baselines `traffic_gate`.

### Also noted

- Three chromium-headless processes from 2026-09-06 were still alive on the machine during this
  review. Something in a gate run does not close its browser on a failure path; M2's runner
  should `browser.close()` in a `finally` and report leftovers.
- `main` is now **52 commits** behind `dev_night`. Unchanged advice: M1 is a fast-forward.

## 3. Review protocol

For each item, leave in place for review:

1. the dev-log entry with the numbers the gate produced (not "passed"), **including what failed
   on the way** — every entry in this lane has one and they are the most useful part of it;
2. the screenshots in `reports/`, named `smoke-<id>-<what>.png` (see §0);
3. the commit `slice-<id>` on `main` or a branch named `cityviewer/<id>` — say which;
   **so far: all of them on `dev_night`, one commit per item, with the SHA in §2a;**
4. any question you had to guess at, written into the bottom of `dev-questions.md` as a new
   Q with the assumption you built against, so the guess can be reversed cheaply — and indexed
   by slice in §2c. **Take the next free number from `dev-questions.md`, not from `plan-v1.md`:
   E4 wrote Q34–Q36 over three planning questions that already held them, and `test/docs.test.js`
   is what noticed.**

The review will re-run the item's gate, diff the screenshots, read the tests before the code,
and check the four "must not change" lists above. An item that moved a fixture hash is sent
back regardless of how it looks.

## 4. What the lane leaves behind (2026-09-07)

Four review rounds happened (§2b, §2d, §2e, §2f) and produced four fix slices (R1, R2, R3, and
R4 still to do) plus amendments to V7 and E7. **No fixture hash moved in any of the twenty items**, which is what
"every one of these is cosmetic" was supposed to mean and is the one claim in §0 that was worth
checking at the end.

What the next lane inherits:

- **Fifteen gates**, all green: `./test.sh` twice, `budget_gate`, `walkthrough` (which reports
  the steepest street as well as the walk), `passability`, `lanes_dump`, and eleven browser
  smokes. `budget_gate` is where every number in `dev-log.md` comes from.
- **Two new rulings** — 040 (the quality tier changes rendering only) and 041 (overlays are a
  texture on the ground) — and one amended with a measurement, 038, which now carries the relief
  table R3 produced.
- **Eight open questions** — Q32, Q39, Q60, Q61, Q64, Q66, Q67, Q68 — indexed in §2c, after the review in §2f closed four. Q67 is the one that wants Kjell. Every one has a stated
  assumption it was built against and names the slice or lane that would revisit it. The two that
  wanted a decision rather than a note, Q47 and Q51, were answered (A36, A37) and built in R2.
- **One thing nobody has done**, at the top of "Noted, no slice": every number in this lane is
  SwiftShader, and the frame-time governor — the thing that decides what a phone gives up — has
  never run on a phone. `workitems-measurement.md` opens on it.

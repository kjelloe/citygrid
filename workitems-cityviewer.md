# cityviewer — work items

*Written 2026-09-05 after slice E0. This is the hand-off for whoever implements the rest of
cityviewer in this repo. Each item is one slice: it has a gate, it ends with a `dev-log.md`
entry with numbers, and it is committed as `slice-<id>`. The design is `specs/engine/`; the
decisions are rulings 032–040; the order and sizes are `specs/engine/11-roadmap.md`. Do them
in the order below unless a dependency says otherwise. The review pass at the end of each item
is what the author of this file will check.*

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
- Keep a screenshot pair per item in `reports/` named `<id>-before.png` / `<id>-after.png`
  from `tools/screenshot.mjs` at the default span and `SPAN=12`. They are ignored by git
  (`reports/smoke-*.png` pattern — name yours `smoke-<id>-…` to match) and are what the
  review looks at first.

## 1. What E0 left you

`client/world/model.js` — `createModel(state)` returns:

```
tileM, reliefM                       numbers from config
corridors[]   { id, kind:'road', points:[{x,z}] metres, tiles:[index], half, frontage,
                length, from:nodeId, to:nodeId, box }
nodes[]       { id, tile, x, z, mask, degree, kind:'end'|'bend'|'junction'|'isolated'|'loop',
                corridors:[id] }
connectors[]  { node, a, b, points:[{x,z}] }         a quadratic curve through each bend
nearestCorridor(x, z, max?) → { corridor|node, dist, s, x, z } | undefined
heightAt(x, z), landAt(x, z), normalAt(x, z), waterLevel          metres
lots[]        { id, building, x0, z0, x1, z1, cx, cz, frontage:0..3 (DIR4 N,E,S,W),
                facing:boolean, frontageLen, bays, seat }
lotOf(id), lotAt(x, z)
surfaceAt(x, z) → { kind:'water'|'lot'|'road'|'sidewalk'|'ground', ... }
stats         { corridors, nodes, connectors, lots }
```

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

---

### V6 — Lots with something on them (L) — spec §6.6

Front gardens, fences, hedges, paths, a wider roof and wall range, two more silhouettes per
category at L2. Pure content against the existing kit and `buildingParams`; every new colour
through the palette test; `style-sheet` before/after.

### E7 — Pedestrians (M) — spec §9.3

`client/world/nav.js` (sidewalk edges, crossings at nodes, a door node per lot);
`client/life/pedestrians.js` (commuters between a door and the map edge, shoppers between
commercial doors, waiting at a red walk phase, a two-part instanced body with a bob), capped
per tier, frozen by `?life=0`. Gate: `budget_gate` at High with the cap; `walkthrough` still
walks (pedestrians do not collide with the player).

## 2a. Status

*Kept current by whoever implements. An item is **done** when it is implemented,
its tests are written or updated, its gate is green, its docs are synced and it
is committed as `slice-<id>`. Everything below is on branch **`dev_night`**.*

| Item | Status | Commit | Gate | Left for review |
|---|---|---|---|---|
| **V2** — the quality tier | **done** 2026-09-06 | `c12ca3a` | `budget_gate` at three tiers **and at the opening span**; `ui_smoke` 101 → 108 checks, hit-testing the row through the renderer | `test/governor.test.js` (8), `test/settings.test.js` (+6); tier table in `data/cityviewer.json`; ruling 040 satisfied by `test/purity.test.js`. **Q27** |
| **E1** — the lane graph | **done** 2026-09-06 | `2a527d6` | `tools/lanes_dump.mjs`: 5,810 links, 372 signals, shortest link 8.32 m against a 4.5 m car | `test/lanes.test.js` (19); spec §4.6a. Right turns came out zero metres long until lanes were trimmed to the junction **box**; the model rebuild went 123 ms → 35.7 ms on the way |
| **V1** — traffic you can see | **done** 2026-09-06 | `25adbc3` | `budget_gate` with cars; `reports/smoke-V1-a.png`; two `screenshot.mjs` runs byte identical under `?life=0` | `test/cars.test.js` (14) — **not** `test/traffic.test.js`, which is the engine's; spec §9.1a. Load sets the **speed** and density follows, which is the reverse of §9.1's order and the reason the first build looked the same at every load |
| **V3** — ground that is not a checkerboard | **done** 2026-09-06 | `ec6ce50` | `reports/smoke-V3-{before,after}-span{default,24,12}.png`; rebuild 10.2 → 11.6 ms on a saturated 128×128 | `test/ground-colour.test.js` (11); spec §5.1a. **Q28**: the distance-to-street tone is a two-ring flood, not a corridor query per tile — the specified way measured 16.6 ms against a 15 ms budget |
| **V4** — real relief | **done** 2026-09-06 | `f13b0dd` | `play_smoke` picks on a slope and the ghost stands on the ground; `reports/smoke-V4-cliff-span10{,-zoning}.png` at an 18° pitch on an 84 m `hilly` map | `test/picking.test.js` (10); the flat-layer audit is spec §5.6. **Q29**: the overlay wash is the one layer still floating |
| **V5** — the perspective play camera | **done** 2026-09-06 | `<pending>` | `play_smoke` and `budget_gate` in **both** projections (4 viewport/projection combinations; 2 × 3 tiers × 4 spans); `style-sheet` in both; `reports/smoke-V5-*.png` at a 20° pitch | `test/lod.test.js` (+10), `test/input.test.js` (+4), `test/settings.test.js` (+2); spec §8.1a. Orthographic is **byte-identical to V4** at two zooms, checked against a worktree of `f13b0dd`. **Q30** |
| **P1** — toon shading and the anime rig | not started | — | — | — |
| **E2** — the baker and the chunk cache | not started | — | — | — |
| **E3** — ribbons | not started | — | — | — |
| **E4** — the street camera and collision | not started | — | — | — |
| **E5** — street-level facades | not started | — | — | — |
| **E6** — time of day | not started | — | — | — |
| **P2** — ink and grade | not started | — | — | — |
| **V6** — lots with something on them | not started | — | — | — |
| **E7** — pedestrians | not started | — | — | — |

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

**Three gates were wrong about the game before they could see it**, all of the
same shape and all fixed in place: `lobby_smoke` hashed after an await, and
`play_smoke` and `mvp_acceptance` projected tile centres at `y = 0` to decide
where to click, which with relief aims down the slope.

**And two bugs were found only because a gate drives more than one
configuration.** V5's picking built an orthographic ray — exact at the centre of
the frame and wrong at its edges, so a single-configuration gate would have
passed it; and the perspective eye distance was derived from `span` as if it
meant the vertical extent, which is right in landscape and wrong on a portrait
phone. Desktop-perspective green beside phone-perspective red is the pair that
named the second one.

## 3. Review protocol

For each item, leave in place for review:

1. the dev-log entry with the numbers the gate produced (not "passed");
2. the before/after screenshot pair in `reports/`;
3. the commit `slice-<id>` on `main` or a branch named `cityviewer/<id>` — say which;
   **so far: all of them on `dev_night`, one commit per item, listed in §2a;**
4. any question you had to guess at, written into the bottom of `dev-questions.md` as a new
   Q with the assumption you built against, so the guess can be reversed cheaply.

The review will re-run the item's gate, diff the screenshots, read the tests before the code,
and check the four "must not change" lists above. An item that moved a fixture hash is sent
back regardless of how it looks.

# 01 - What exists

Three codebases, each with a different answer to "how do you draw a city from data".

## Union Square (`../fable51-worlds/union-square-sf/`) - photographic, GLB kit, PBR

| Layer | Where | The reusable idea |
|---|---|---|
| Frame | `src/geo/geo.ts` | One origin, one grid bearing, metres; every coordinate derives from it |
| Ground | `src/world/Terrain.ts` | Survey samples → IDW grid at 8 m → bilinear `heightAt(x,z)`; one mesh |
| Streets | `src/world/StreetGrid.ts`, `Streets.ts` | Analytic axis-aligned `StreetSpec` (centre, extent, width, sidewalk, lanes, oneway, parking); intersections computed; road, sidewalk and **kerb** as draped ribbons sampled every 3 m from `heightAt` |
| Markings | `src/world/RoadMarkings.ts` | Lane lines, crosswalks, stop bars painted **once** into a top-down canvas and sampled by world x/z in the asphalt shader - no geometry, no z-fighting, no sinking on slopes |
| Buildings | `src/world/Buildings.ts` | Footprint → wall quads with metre UVs, roof from `ShapeGeometry`, seated on the **lowest** footprint corner; bucketed by (style, bay, floor height, 160 m cell) and merged |
| Facades | `src/world/facade/FacadeSpec.ts`, `FacadeBuilder.ts`, `AutoSpec.ts` | A JSON grammar: ground band with storefront bays and tenant signs, upper floors on a bay rhythm with reveals, stringcourses, cornice or parapet, masses, extras. Built into merged wall geometry per (130 m cell, material) plus instanced module pools |
| Assets | `src/assets/Assets.ts`, `tools/bpl/` | Blender-as-a-library generates GLB modules offline; runtime remaps materials **by name** to a procedural PBR library |
| Materials | `src/materials/Library.ts`, `Textures.ts` | Every texture drawn with Canvas2D at start-up; emissive materials tracked so night can dial them |
| Light | `src/systems/TimeOfDay.ts` | Three presets (day, sunset, night): sun, hemisphere, fog, exposure, PMREM sky env; shadow frustum follows the viewer, snapped to a shadow texel |
| Player | `src/player/Collision.ts`, `WalkControls.ts` | Wall segments with a height range plus floor patches in an 8 m spatial hash; circle-vs-segment resolve; `floorAt` with a step-up limit |
| Traffic | `src/life/LaneGraph.ts`, `Traffic.ts`, `TrafficLights.ts` | Lanes from the street specs → block links between stop bars, bezier connectors and right turns through each node, class bitmasks; IDM car-following, signal compliance, instanced vehicles with wheel spin |
| Crowd | `src/life/NavGraph.ts`, `Pedestrians.ts`, `PedestrianRig.ts` | Sidewalk/crosswalk/plaza graph, role state machines, grid-hash separation, instanced procedural walk cycle |
| QA | `tools/qa/*.mjs` | Playwright: fixed viewpoints by lat/lon/heading/fov, photo overlay diff, perf (fps, calls, tris), scripted walkthrough, demo film |

## Higashiyama (`../fable51-worlds/kyoto-higashiyama/`) - painted, no assets, toon + ink

| Layer | Where | The reusable idea |
|---|---|---|
| Contract | `docs/KIT.md` | The builder contract: one ground, baker not meshes, collision radius arithmetic, depth is built outward, scale table |
| Ground | `src/world/terrain.js` | **One height function.** Base hillside derived by IDW from the surveyed streets; each street a *corridor* that owns the ground inside its half-width and blends out over 5 m; junctions average; platforms and cuts; stepped flights quantised analytically from arc length; the blend against the hillside is `exp(-6w)` so the field has no crease for the ink pass to find |
| Ground mesh | `terrain.js: buildGround` | Vertex-coloured grid, 6 m near / 24 m far; colour from surface, distance-to-street ("urban" vs vegetation) and elevation; dips 0.16 m under paving |
| Streets | `src/world/streets.js` | Paving as a ribbon sampled from `heightAt` with a 0.035 m camber; gutters, kerbs, nosings, retaining walls; bucketed per surface |
| Plots | `src/world/plots.js` | `layoutPlots` walks a corridor's frontage and hands back ken-snapped plots with facing yaw and ground at both ends; `alongStreet` for lanterns and poles; a wide plot biases the next narrow, so a street has phrases |
| Baker | `src/core/util.js: Baker` | Colour into a vertex attribute; merge everything with the same *shading signature* (bands, tint, transparency, side) into one mesh; one baker per district so culling and shadows stay sane |
| Kit | `src/kit/roof.js`, `machiya.js`, `shopfront.js` | Roofs with curvature and deep overhang; a townhouse generator on a module; shopfront recesses built outward, not carved |
| Shading | `src/core/toon.js` | `MeshToonMaterial` with hand-authored ramps, a shader-chunk patch that tints the dark bands toward violet; high-key ramps for pale things |
| Post | `src/core/post.js` | Ink from the **second difference** of linear depth (flat on any plane, fires on silhouettes and creases, convex strong, concave faint); split-tone grade; FXAA |
| Light | `src/main.js`, `src/systems/time.js` | Four-light rig (warm key, strong cool fill, violet up-light, hemisphere); four time states as compositions; shadow focus snapped to a 2 m grid |
| Sky | `src/core/sky.js` | Banded dome shader, billboard clouds, a basin of unlit ridge flats and a city plate |
| Batchers | `src/world/vegetation.js`, `props.js` | Districts *declare* trees and props; built once, instanced, shadow casters capped |
| QA | `tools/*.mjs` | `perf` reports draw calls before milliseconds; `walkthrough` drives the **player** along corridors derived from the street data; `passability` sweeps every street for a walkable lane |

## City Grid (this repo) - the game

| Layer | Where | What it does today |
|---|---|---|
| State | `engine/state.js` | SoA tile layers (terrain, elevation u8, zone, road/wire/pipe masks, flags, owner, district, pollution, crime, landValue, **traffic**, fireRisk, healthRisk, buildingId u16) and `buildings[]` {id, def, zone, x, y, w, h, owner, level, valueTier, ...}; all hashed |
| Renderer | `client/render/scene.js` | Lights from the style, chunked terrain, instanced pools, ghost, post; a render-measure-step-down loop against `renderer.info.render.triangles` |
| Camera | `client/render/camera.js` | Orthographic, `span` zoom, four snapped yaws plus free orbit, pitch 12-82° |
| Terrain | `client/render/terrain.js` | 16×16 chunks, two triangles a tile, corner heights averaged, `HEIGHT_SCALE = 0.02`, roads painted into the mesh as a colour |
| Instances | `client/render/instances.js` | One `InstancedMesh` per (variant, tier); markings from the road mask; wire and pipe as hub plus arms; lawn, zone tint, ruins, overlays; parked cars and lamps by per-tile hash; forest as trees |
| Kit | `client/render/building-kit.js`, `detail-kit.js` | Four variants per category at unit height, walls and roof as separate buffers, face shading baked to vertex colour; three tiers FULL/SHAPE/BLOCK |
| LOD | `client/render/lod.js` | Resolvability by pixels per tile, then a sacrifice ladder against a configurable budget with **measured** costs |
| Style | `client/render/styles.js`, `style-assets.js`, `style-light.js`, `palettes.js` | plain (ships), pixel (post-process), painted (light rig only); a style is geometry, shading, palette, finish |
| Picking | `client/render/picking.js` | Ray against the y=0 plane, integer grid |
| Gates | `tools/*.mjs`, `test/` | Node tests for everything pure; Playwright for client, play, UI, save, budget, acceptance |

## Where they line up

| Concept | Union Square | Higashiyama | City Grid today | The engine |
|---|---|---|---|---|
| Ground | IDW grid + bilinear | corridors + hillside + platforms | u8 × 0.02, flat by decision | `heightAt` from u8 with corridor flattening under roads (04, 05) |
| Street | `StreetSpec` analytic | corridor polyline | road mask bit per tile | corridor derived from mask runs (04) |
| Lot | OSM footprint | ken-snapped plot on frontage | building rect in tiles | lot = rect in metres with a frontage edge (04, 06) |
| Building | facade spec + modules | kit generators | four variants, unit height | kit levels L0-L3 (06) |
| Batching | merge per 130 m cell + instanced pools | baker per district | instanced pools | pools for repeats, baker per chunk for L3 (06) |
| Look | PBR, ACES | toon + ink + grade | Lambert + vertex shade | style seam with both (07) |
| Camera | perspective walk/orbit/tour | perspective walk/photo/overview | orthographic city | city, tilt, street (08) |
| Life | IDM traffic, crowd | none (ambient motion) | parked cars | traffic from `tiles.traffic` (09) |
| Truth | photo overlay diff | render beside photograph | budget gate, acceptance | capture + perf + walkthrough (10) |

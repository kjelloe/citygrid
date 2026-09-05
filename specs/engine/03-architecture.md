# 03 - Architecture

## What is replaced and what is kept

| Kept | Replaced |
|---|---|
| `engine/`, `shared/`, `worker/`, `server/` - untouched | `client/render/terrain.js` - becomes a height-field ground with corridors and ribbons |
| the `createRenderer` interface `game.js` calls: `draw`, `resize`, `worldChanged`, `showGhost*`, `hideGhost`, `stats`, `setBudget`, `dispose` | `client/render/building-kit.js` and `detail-kit.js` - become the kit levels in 06, with a facade grammar |
| `lod.js`'s policy: resolvability then a measured budget ladder (ruling 019) | `client/render/camera.js` - grows from one orthographic camera to city, tilt and street |
| `palettes.js`, the colour-vision test, the constants mirror | `style-assets.js` / `style-light.js` - become rigs and shadings, one of which is the fable51 look |
| picking as grid arithmetic (against a height field now) | `instances.js` - stays for L0-L2 pools; L3 goes through a per-chunk baker |
| overlays, minimap, HUD, input - style-agnostic by design (ruling 005) | the flat sky colour - becomes a dome once the horizon is in frame |

## Five layers, one direction

```
state (hashed, integer)                          engine/  - untouched
  │  read only
  ▼
city model (derived, pure, cached by chunk)      client/world/   - new
  frame · ground · corridors · lots · frontages · lane graph · nav graph
  │
  ▼
scene builders (three.js, per chunk, per tier)   client/render/  - grows
  terrain · streets · buildings · props · life
  │
  ▼
style + camera + LOD + post                      client/render/  - exists, extends
  │
  ▼
gates                                            tools/, test/
```

Data flows down. The city model never sees a mesh; the builders never see a command. The
existing split - `scene.js` orchestrates, `instances.js` pushes pools, `lod.js` plans - stays,
and the model slots in between state and the builders as the thing they all read instead of
each re-deriving "what is this tile" from raw arrays.

## The city model is pure and testable in node

Everything in `client/world/` is plain functions over `state` and returns plain objects and
typed arrays. No three.js import, so it is tested by `node --test` like `engine/` is, and the
gates that drive a real page are only needed for what actually draws. This matters because the
model is where the bugs that "look fine in a screenshot" live (a frontage facing the wrong
way, a corridor a tile short, a lane graph with a dead end), and each of those is a one-line
assertion against a fixture city.

The model is **chunked** the same 16×16 way the terrain is, and each chunk carries a small
content hash of the tiles and buildings it was derived from. `worldChanged()` today marks
every terrain chunk dirty; the model does the same and rebuilds only chunks whose content hash
moved. A road painted across a chunk boundary dirties both.

## Fidelity is a property of the view, not of the world

The same model is drawn at four levels, chosen per chunk by the LOD planner (08):

| Level | What draws | Who draws it |
|---|---|---|
| L0 BLOCK | box with a roof cap, painted roads, no props | `instances.js`, today |
| L1 SHAPE | silhouettes, markings, poles | `instances.js`, today |
| L2 FULL | windows, fences, roof clutter, props, trees, **moving cars** | `instances.js` + `life/` |
| L3 STREET | kerbs and sidewalks as ribbons, facades with bays and storefronts, signage, lamps that light, pedestrians | a **baker per chunk**, built lazily and cached |

L0-L2 are instanced pools: cheap to update every frame, ideal for a whole map. L3 is merged
geometry per chunk in the Higashiyama manner: expensive to build once, one draw call per
material afterwards, only ever built for the handful of chunks around a street camera. The two
coexist because the pools already hide themselves when `count` is zero, and a chunk at L3
simply pushes nothing into the L2 pools.

## What is derived, and from what

| Derived thing | From | Hash salt |
|---|---|---|
| `heightAt(x, z)` in metres | `tiles.elevation` corners, `tiles.road` masks (corridor flattening), water level | - |
| corridors (polylines, half-widths, kinds) | `tiles.road` runs and junctions; later `rail`, `path` | - |
| lots (rect in metres, frontage edge, setback) | `buildings[]` and the road tiles beside them | building id |
| building parameters (variant, roof, colours, bays, storefront count, lit windows) | zone, level, valueTier, owner, lot frontage length | building id |
| lane graph (lanes, links, connectors, nodes, signals) | corridors | - |
| vehicle density per link | `tiles.traffic` (u8 commuter load, computed by the engine since N7) | tile index |
| nav graph (sidewalk edges, crossings) | corridors + lots | - |
| props (lamps, meters, hydrants, bins, trees, tufts) | corridor edges, lot fronts, terrain type | tile index |
| markings (dash, arms, crosswalk, stop bar) | corridor mask and node degree | - |

Nothing above is stored. Delete the client cache and the same picture comes back.

## What the fable51 worlds keep that City Grid does not need

- Geodesy (`geo.ts`): City Grid's frame is the tile grid; there is no lat/lon. The frame section
  in 04 is one constant, metres per tile.
- Reconnaissance data and photo references: the "truth" for City Grid is its own state.
- Hero interiors, brand logos, real tenants: none. Signage is generated text from the building's
  own def and a name table.
- Binary assets: none, unless D5 says otherwise. Higashiyama proves a full street at eye height
  without one.

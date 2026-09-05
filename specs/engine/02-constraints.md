# 02 - Constraints

City Grid's rules, restated as they bind an engine. Each is a real rule in `CLAUDE.md`,
`specs/plan.md` or a ruling, and the engine has to fit them rather than the other way round.

## The renderer reads; it never writes

`apply(state, command) → state` is the whole game. The renderer, the world model and every
life system described here are **readers**. Nothing they compute enters `state`, the save, the
hash or the wire. Consequences:

- Every derived structure must be a **pure function of state plus a per-tile or per-id hash**
  (`jitter(index, salt)` in `instances.js` is the existing precedent). Two clients looking at
  the same state may draw different cars; they must never disagree about a rule.
- Anything that has its own running state - traffic positions, pedestrian paths, a lazily built
  chunk - is *client-local* and can be discarded and rebuilt at any time. A save contains none
  of it.
- The renderer may not import `engine/`. It reads constants through `client/constants-mirror.js`,
  and a test asserts the mirror matches. New constants the engine needs go through the mirror.

## No build step, zero runtime dependencies, one vendored three

- Plain ES modules and an importmap. The engine is JavaScript, not TypeScript, and every module
  is loadable straight from `index.html`. Union Square's TypeScript and Higashiyama's Vite
  plugins are references, not code to copy.
- `vendor/three.module.js` is **r169**. No `three/addons` are vendored. Everything fable51
  imports from addons - `mergeGeometries`, `GLTFLoader`, `Sky`, `FullScreenQuad`,
  `PMREMGenerator` is core - has to be either vendored as a second pinned file or written
  in-repo. City Grid already builds raw `BufferGeometry` from arrays (`building-kit.js`,
  `terrain.js`), so a merge helper is a few dozen lines; a full-screen quad is ten. See
  `12-decisions.md` D8.
- The toon shader-chunk patch in `../fable51-worlds/kyoto-higashiyama/src/core/toon.js` targets
  `lights_toon_pars_fragment` and `getGradientIrradiance`, which exist in r169; the patch already
  checks the chunk shape at load and warns if it has moved.
- Service worker precache: new modules and any generated data must go in `client/precache.json`
  (ruling 031). No fetched assets at runtime that are not precached.

## Budgets are measured, on a saturated city

- ≤ 80 000 triangles on mobile by default, configurable, **enforced by reading
  `renderer.info.render.triangles` after a real render** and stepping down a ladder (ruling 019).
  Any cost the engine adds - a kerb ribbon, a facade chunk, a car pool - must be priced in
  `DEFAULT_COSTS` *and* measured by `createInstances`, or it is spent uncounted.
- Draw calls ≤ 150 typical. Higashiyama's rule applies: report draw calls and triangles first,
  milliseconds second, because wall-clock in headless Chromium drifts 20-30 %.
- A post-process pass costs fill rate that the triangle counter cannot see. A phone is fill-rate
  bound. V2's frame-time governor is therefore a prerequisite for any post pass on mobile.
- Measure on `test/fixtures` saturated cities, never an empty map (gotcha 14).

## The camera ruling

Ruling 006, amended 2026-09-05: the four snapped yaw angles are what Q, E and the two-finger
twist give; the right button orbits freely between 12° and 82° pitch; orthographic by
construction. A perspective camera (V5, Q25) is an **option beside** this, never a replacement,
and the snapped angles must still land the player on the grid.

## One art style ships, behind a seam

Ruling 022: plain ships. `pixel` and `painted` stay as the `RenderStyle` seam and receive no
art. Ruling 017: a style is geometry, shading, palette, then finish. A screen-space outline
fights detailed geometry (the probe found that with a luminance Sobel). Higashiyama's ink is a
different instrument - a second difference of *depth*, which is flat across any plane - and is
the one that could make `painted` a real style rather than a lighting preset. Whether that art
investment is wanted is D4.

## Ownership and overlays

Any positional subsystem must learn ownership, the territory overlay and the sector-fairness
transform (gotcha 10). For the engine that means: the owner tint and the sixteen player
patterns must survive at every kit level, and overlays keep drawing as flat tinted quads on
the ground whatever relief the terrain gains.

## Style of the code itself

Small functions, modules soft-capped at 300 lines, one subsystem each, acyclic imports,
numbers in `data/*.json`, comments only for the non-obvious why, citations of the ruling or
prompt that created a rule. Every slice has a gate and a `dev-log.md` entry.

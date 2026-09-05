# Ruling 039 — three.js addons are hand-rolled, not vendored

- **Date:** 2026-09-05
- **Source:** P37 — D8, the recommendation accepted
- **Status:** ruled

## Question

fable51-worlds imports from `three/addons`: `mergeGeometries`, `GLTFLoader`, `Sky`,
`FullScreenQuad`. City Grid vendors one file, `vendor/three.module.js` at r169, and no addons.
Does cityviewer vendor the addons it needs, or write them?

## Ruling

**Write them.** Three small pieces, in `client/render/`:

- a geometry merge — concatenate `position`, `normal`, `color` and optionally `uv` of
  non-indexed buffers; the baker's whole need, about fifty lines;
- a full-screen quad — a `PlaneGeometry(2, 2)` with a `ShaderMaterial` and an identity camera,
  which `styles.js` already has for the pixel post-process;
- a sky dome — Higashiyama's banded gradient shader on a back-facing sphere, about fifty lines.

`GLTFLoader` is not needed (036). `Sky` and `PMREMGenerator` belong to the photographic rig,
which is not the target (033).

## Why

The precedent is one vendored file, pinned, and the pieces needed are small and already half
present: `building-kit.js` and `terrain.js` build raw `BufferGeometry` from arrays, and
`createPost` renders a quad. Vendoring `BufferGeometryUtils.js` brings 700 lines for one
function, a second file to pin to r169, and a second thing to precache and version.

The toon shader-chunk patch (033) is different: it targets a core chunk,
`lights_toon_pars_fragment`, present in r169, and the patch checks the chunk's shape at load
and warns if it has moved. It is not an addon and needs nothing vendored.

## Consequences

- No new entry under `vendor/`. A future three upgrade is still one file.
- The merge helper is the baker's only dependency and is tested in node with a two-box fixture.

## Enforced by

- `specs/engine/02-constraints.md` — the dependency rule
- `vendor/` — one file
- `test/baker.test.js` — the merge (after E2)

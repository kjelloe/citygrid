# Ruling 034 — Perspective is the play camera; orthographic stays for the phone

- **Date:** 2026-09-05
- **Source:** P37 — D3 "perspective play camera", chosen from the options in `specs/engine/12-decisions.md`; answers Q25
- **Status:** ruled — amends ruling 006

## Question

Ruling 006 fixed an orthographic camera with four snapped yaw angles, amended (P34) to a free
orbit. fable51-worlds is perspective throughout: aerial sweeps, orbits and a walker at eye
height on one camera. Which camera is City Grid played from once its renderer matches?

## Ruling

**Perspective.** One `view` object with three modes:

| Mode | Projection | What it is for |
|---|---|---|
| city | perspective, orbit target on the ground, pitch 12–82°, zoom moves the eye along the view ray | play |
| street | perspective at eye height, pointer-lock or drag-look, WASD with collision | visiting |
| ortho | orthographic, `span` zoom, as today | the phone, and anyone who prefers it |

The four snapped yaws are kept in every mode: Q, E and the two-finger twist land on them, and
`rotate` snaps from wherever a drag left the camera. Street mode is entered by zooming past the
minimum distance while tilted below about 25°, or by a key, and left the same way. Orthographic
is the default on a coarse pointer and an option everywhere else.

## Why

Ruling 006 protected two things: that a player can always look behind a tall building, and
that mobile and desktop see the same city. A perspective orbit gives more of the first. The
second is kept by keeping orthographic as a mode rather than deleting it, so the promise is
"the same city, the same four angles", not "the same projection".

What the ruling never protected was orthographic projection itself. It was chosen because it
was cheap and because a sprite pipeline would have needed it, and 022 chose the mesh pipeline.
At the low pitch N29 allows, an orthographic view reads as a diagram (P36); the reference shots
in `debugging/` converge; and a street you can stand in is not expressible without perspective.

## Consequences

- Three things that assumed one scale across the screen become per-chunk: `pixelsToTiles` in
  the input layer, the LOD's `tilePixels`, and `visibleBounds`. Under perspective
  `tilePixels(chunk) = TILE_M × focalLengthPx / distance`; under orthographic it is what it
  was. The thresholds in `lod.js` do not change, only where they are evaluated
  (`specs/engine/08-camera-lod-budget.md`).
- Picking stays a ray; with relief (038) it marches the height field in both projections.
- `test/input.test.js`'s "the keys still snap" holds in every mode, and `play_smoke` presses
  Q after a drag in each.
- Slice V5 is the play camera rather than an option, and moves ahead of the street lane in
  `plan-v1.md`.

## Enforced by

- `specs/engine/08-camera-lod-budget.md` — the modes and the per-chunk LOD
- `client/render/camera.js` — `view.mode` (after V5)
- `test/input.test.js` — snapping in every mode; `test/lod.test.js` — per-chunk tile pixels
- `tools/play_smoke.mjs` — both projections, on a mouse viewport and a phone one
- `specs/rulings/006-camera-rotation-is-hard.md` — this ruling is its second amendment

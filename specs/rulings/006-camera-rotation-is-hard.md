# Ruling 006 — Four-angle camera rotation is a hard requirement

- **Date:** 2026-08-25
- **Source:** P6 (asked), answered directly by the user
- **Status:** ruled

## Question

`gamedesign.md` §13.4 promises four snapped yaw angles. Is that a hard requirement, or negotiable
if an art style is worth it?

## Ruling

**Hard requirement.** Four snapped yaw angles on desktop, two-finger twist on touch, on every
style City Grid ever ships.

## Why

In a builder you place things against terrain, and being unable to look behind a tall building is a
real loss, not a cosmetic one. It also keeps mobile and desktop honest with each other.

## Consequences

This is the constraint that decides the art pipeline, which is why it is a ruling and not a
preference:

- **v1 is the mesh pipeline.** A drawn-sprite style would need four sprite sets per building state
  — roughly a 4× art multiplier on the longest lane in the project.
- **The pixel-art look survives anyway.** Rendering the same meshes to a low-resolution target with
  nearest upscale, palette quantisation, dither and an outline pass gets the texture of the
  reference screenshot while keeping rotation, continuous zoom and procedural asset generation.
  That is candidate (b) in probe 1.2b.
- What it does **not** get is drawn interior cutaways, which are a sprite affordance and are out of
  scope.
- The `RenderStyle` interface still declares camera constraints per style, so a future sprite
  pipeline remains expressible — it would simply have to pay for four sets.

## Amendment, 2026-09-05 (P34) — the four angles are the KEYS, not the camera

The second playtest asked, for the third time, to be able to turn the view with
the right mouse button and to "change view angle from overhead to closer to
ground". Both are granted, and the ruling survives them:

**The four snapped angles are what Q, E and the two-finger twist give.** They
are still there, they are still what a player lands on, and `rotate` now snaps
from wherever the camera happens to be — so a key press is also the way back
onto the grid after a free drag.

**The right mouse button orbits freely**: sideways turns, up and down tilts,
between 12° and 82°. This is not a retreat from the ruling. What the ruling
protects is that a player can always look behind a tall building and that the
mobile and desktop cameras agree; a free orbit gives *more* of both. What it
would have cost — four sprite sets per building state — is not owed, because
ruling 022 chose the mesh pipeline and there are no sprites to multiply.

The pitch was a module constant, `atan(1/√2)`, and is now a field on the view.
Anything that reasons about what the camera can see must read it:
`visibleBounds` stretches its reach by 1/sin(pitch), because an orthographic
frustum tilted towards the horizon lands on the ground nearly three times
further away at 20° than it does overhead — bounds that ignore it cull the
distance and the city ends at a straight line across the screen.

## Enforced by

- `test/input.test.js` — "the pitch belongs to the view, not to the module",
  "the pitch is clamped at both ends", "the mouse turns the camera freely, the
  keys still snap"
- `test/lod.test.js` — "a low camera sees further, and the bounds have to know it"
- `tools/play_smoke.mjs` — a real right-drag turns and tilts and does not pan;
  Q lands back on a quarter turn
- `specs/gamedesign.md` §33 amendment to §13.4
- `specs/plan.md` §6 style seam
- `specs/art-direction.md` §1.1
- `plan-v1.md` ruling 8, slice 1.2b

## Amendment, 2026-09-05 (P37) — perspective is the play camera

Ruling 034 makes the perspective orbit the camera the game is played from, and keeps the
orthographic camera as a mode: the default on a coarse pointer, an option everywhere else. The
four snapped yaws survive in every mode, which is what this ruling protects; the projection
was never the point.

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

## Enforced by

- `specs/gamedesign.md` §33 amendment to §13.4
- `specs/plan.md` §6 style seam
- `specs/art-direction.md` §1.1
- `plan-v1.md` ruling 8, slice 1.2b

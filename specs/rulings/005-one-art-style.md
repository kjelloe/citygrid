# Ruling 005 — One art style at v1, chosen by probe

- **Date:** 2026-08-25
- **Source:** P6 (user proposed three styles and asked whether to test all three or let players
  choose), answered after the trade-offs were laid out
- **Status:** ruled

## Question

Do we build three art styles to test, ship more than one so players can choose, or pick one?

## Ruling

**One style ships at v1**, chosen by probe 1.2b, with the `RenderStyle` seam kept so a second style
is additive later rather than a rewrite.

## Why

The three styles the user named — isometric 2.5D, pixel art, voxel/low-poly — are **two pipelines,
not three**. Pixel art and isometric 2.5D are the same depth-sorted atlas-quad code at different
resolutions and palettes. The renderer count was never the cost; the art sets are.

Content is already the long pole (`specs/plan.md` §8.1): roughly sixty buildings across four
development levels and two value tiers, plus civic buildings, vehicles, portraits, icons. Shipping
two styles means two of those, and would mean shipping two half-finished art sets instead of one
coherent one.

Everything above the renderer is already style-agnostic — overlays are data textures, picking is
grid maths rather than raycasting, the minimap paints from state, the UI is DOM. That is what makes
a second style additive later, and it is worth almost nothing to preserve now.

Because rendering is entirely local, style is a **per-viewer client preference**: once a second
style exists, two players can view the same shared region in different styles. That makes
user-selectable style a good Wave 7 feature rather than a v1 obligation.

## Consequences

- Probe 1.2b renders one pinned 16×16 city block through the real renderer in three candidates,
  measured, screenshotted, and judged with the territory overlay and sixteen player colours on.
- No production asset is made until `specs/art-direction.md` §3 exists.
- Q13 remains open: whether a drawn-sprite pipeline is ever funded post-v1.

## Enforced by

- `specs/plan.md` §6 style seam
- `specs/art-direction.md` §1.2, §2
- `plan-v1.md` ruling 7, slice 1.2b, content lane C0–C1

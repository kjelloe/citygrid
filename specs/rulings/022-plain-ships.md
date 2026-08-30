# Ruling 022 — Plain ships

- **Date:** 2026-08-28
- **Source:** P13 — *"Ok, go for plain. Soft cool light, bright cosy palette, shadows. The cheapest to produce and the most legible"*
- **Status:** ruled

## Question

Probe 1.2b built three candidates — plain, pixel, painted — and ruling 005 says
one ships. Which?

## Ruling

**Plain.** Soft cool light, a bright cosy palette, and shadows. It is the v1
style and the default everywhere.

`pixel` and `painted` stay in the tree. They are the `RenderStyle` seam that
ruling 005 asked to be kept, they cost nothing to keep — style is data plus a
lighting spec plus a face-contrast number — and they hold the line that a style
is more than a screen filter (rulings 017, 020). They receive no art investment.

## Why

The user's reasons, and they are the right ones: **cheapest to produce and most
legible.**

- Cheapest, because plain needs no atlas. Every asset is procedural geometry
  from `building-kit.js`, so a new building is a function rather than eight
  drawn sprites across four levels and two value tiers. `plan.md` §8.1 puts
  content at roughly sixty buildings; that is the long pole in the whole project
  and plain is the only candidate that does not multiply it.
- Most legible, because soft light with low baked contrast keeps every face
  bright enough to read its own colour. Painted's deep shadow sides and pixel's
  twelve-level quantisation both throw away exactly the colour information the
  overlays and the ownership tints depend on.
- Shadows stay. They are what makes a building sit on the ground rather than
  hover above it, and the LOD budget already prices them (ruling 019).

## Consequences

- **The content lane (C1) is unblocked.** `art-direction.md` §3 is now written
  with real values rather than intentions, and `test/docs.test.js` checks the
  documented palette against `palettes.js` so the two cannot drift.
- The asset list is now a list of *parameters and shapes*, not of drawings.
- A drawn-sprite pipeline stays a post-v1 question (Q13), and the seam is what
  keeps it answerable.

## Enforced by

- `specs/art-direction.md` §3 — the specification
- `client/render/scene.js` — plain is the default style
- `test/docs.test.js` — the documented palette must match the code

# Ruling 020 — Face shading contrast belongs to the style

- **Date:** 2026-08-28
- **Source:** P11 — *"remake plain 1 soft lighting, because all three candidates looked very similar"*
- **Status:** ruled

## Question

Ruling 017 established that a style owns its geometry, not just a screen filter.
The three candidates were still reported as looking alike. What else is shared
that should not be?

## Ruling

**The baked face contrast.** How hard a style shades its faces is declared per
style in `client/render/style-light.js` and applied before any geometry is built:

    plain    0.65   soft, ambient, diorama
    painted  1.00   strong, directional
    pixel    1.30   unlit, so the bake IS the light

And **soft light is a ratio, not a level.** For a style to read as softly lit,
the hemisphere fill has to outweigh the key, the sun has to stand high so the
shadow sits under a building instead of stretching away from it, and the shadow
has to be blurred and pale rather than merely smaller.

## Why

Face shading is baked into every vertex at build time, so it dominates whatever
the lights do afterwards. Three styles sharing one bake are three colour
schemes, not three styles — which is the same mistake ruling 017 addressed, one
layer further down.

This is why softening the light alone would not have worked. `plain` was lit at
key 1.9 against a fill of 1.2; dropping the key only made it darker, because the
bake was still doing the sculpting.

A first attempt at contrast 0.4 with a fill of 2.15 overshot and is recorded as a
mistake in the source: at that setting a roof and the wall beneath it land on the
same value and the building loses its form. **Soft means gentle, not absent.**

## Consequences

- `plain` is now key 1.15 / fill 1.25, sun at 150, shadow radius 5 at intensity
  0.5. `painted` keeps its hard low sun and now declares it explicitly rather
  than by omission.
- `setFaceContrast` must be called before geometry is built, or a style inherits
  the previous style's faces. `createInstances` does this on its first line.
- A test asserts no two styles share a contrast, and that plain's fill outweighs
  its key while painted's does not. A "nicer" value swapped in later cannot
  quietly collapse the three back into one.

## Enforced by

- `client/render/style-light.js` — `faceContrastFor`, `lightingFor`
- `client/render/detail-kit.js` — `setFaceContrast`, applied in `pushTri`
- `client/render/instances.js` — set before any geometry is built
- `test/render.test.js` — "each style bakes a different face contrast", "plain is lit softly and painted is not"

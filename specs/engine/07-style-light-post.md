# 07 - Style, light and post

## 7.1 The seam stays; the entries grow

`STYLES` in `client/render/styles.js` declares a name, camera constraints and a finish;
`style-assets.js` owns geometry helpers, materials and palette; `style-light.js` the rig and
the baked face contrast. The engine adds three fields per style and one new style entry:

```js
plain:   { ..., rig: 'soft',    shading: 'lambert', post: null }
pixel:   { ..., rig: 'none',    shading: 'unlit',   post: 'pixel' }
painted: { ..., rig: 'anime',   shading: 'toon',    post: 'ink' }   // currently a rig only
```

`shading` decides the material the baker and the pools use (`MeshLambertMaterial` with vertex
colours today; `MeshToonMaterial` with a ramp and the shadow-tint patch for `toon`;
`MeshBasicMaterial` for `unlit`). Nothing else in the renderer knows which one it got.

## 7.2 Rigs

| Rig | Lights | Source | Notes |
|---|---|---|---|
| soft (plain) | key 1.15 nearly overhead, hemisphere 1.25 outweighs it, shadow radius 5, contrast 0.65 | `style-light.js` | ships; ruling 020 "softness is a ratio" |
| anime (painted) | warm key quantised by the ramp, strong **cool** fill from the opposite quarter, violet up-light, violet-ground hemisphere | `../fable51-worlds/kyoto-higashiyama/src/main.js` | the fill carries the whole shadow side; that is what makes coloured shadows |
| photo | sun + hemisphere + fog + PMREM sky environment | `../fable51-worlds/union-square-sf/src/systems/TimeOfDay.ts` | needs `Sky` and PBR materials; out of scope unless D4 says otherwise |

Shadow camera: follows the camera target, extent widened with camera height, position snapped
to a shadow texel (Union Square) or a 2 m grid (Higashiyama). Unsnapped, every cast edge
crawls as the view pans, and at street level on a row of fences that reads as shimmer. City
Grid's shadow camera is fixed over the whole map today, which is fine for a 64×64 map at city
zoom and becomes 2048 px over 2.6 km - 1.3 m a texel - at street level. A following, snapped
frustum is the fix and it is a dozen lines.

## 7.1a As built (P1, 2026-09-06)

`STYLES` declares `rig`, `shading` and `post` per style, and `makeMaterial` branches on
`shading` — never on the style's name, which is what lets a fourth style exist without touching
`instances.js`.

**The ramps are a pure module** (`client/render/ramps.js`), because three cannot be resolved in
node and a ramp that goes backwards or never reaches full light is the failure worth testing.
`2 3 4 soft soft3`, and the gradient map is `NearestFilter` at both ends: a linearly filtered
gradient interpolates between the bands and the quantisation is gone.

**The shadow tint** patches `lights_toon_pars_fragment` through `onBeforeCompile`, mixing the
unlit side toward a violet rather than merely darkening it. It checks for its anchor first and
**warns rather than throwing** when three's chunk changes shape — a style that loses its shadow
tint looks slightly wrong, and a renderer that will not start is a game nobody can play.

**The anime rig is a temperature split, not a dimmer.** The interesting light is the cool fill:
it carries the whole unlit side, and without it a toon ramp's shadow is just the dark end of the
ramp. Total exposure matters more than any one number — four lights at the intensities a
physically-lit reference uses sum past the top of the ramp and every surface lands on its
brightest band. Plain totals about 2.4; the anime rig totals about 3.0.

`faceContrastFor('painted')` drops from 1.0 to **0.3**: a ramp already quantises, and baked
contrast on top of it multiplies until a wall reads as two flat sheets.

**The painted palette** is desaturated ground and warm walls — the opposite arrangement from
`plain`, which is why the two do not read as one city with a filter on it (ruling 017). The old
one had grass and dirt collapsing for a deuteranope at 0.042; nothing tested a style palette
until P1 and that is the first thing the test found.

**The shadow frustum follows the orbit target, snapped to a texel**, and its extent came down
from 0.75 of the map to 0.28 — four times the texel density at the same map size. Snapping is
what stops every cast edge crawling as the view pans.

`shadowRadius` and `shadowIntensity` had been in the rig table since it was written and
**nothing read them** (the same shape as P35's stale cost table). Both are wired now, and
painted's shadow intensity is 0.72 rather than 1: a low sun casts long shadows, and at full
strength they swallow the cool fill that is supposed to colour them.

## 7.3 Time of day

Both worlds ship presets, not a slider, and say why: each preset is a composition. City Grid's
plan §6 wants day/night driven by the game clock, off by default. Reconcile as: a preset list
per rig (`day`, `sunset`, `night` at minimum), the game clock **choosing** among them on a
schedule the player can switch off, and the rig interpolating over a second so the change is
not a cut. Night is what pays for L3: lit shopfronts, lit windows by hash, lamp pools on the
pavement (Union Square `NightLights`: a capped set of point lights nearest the camera, the rest
as emissive geometry).

## 7.4 Post

Two pipelines, both behind `createPost`:

- **pixel** - exists: low-resolution target, nearest upscale, palette quantise, dither, a
  luminance outline. Ruling 017 recorded its weakness: the luminance edge test fires on detail.
- **ink** - Higashiyama's `post.js`: render to a target **with a depth texture**; an ink pass
  that takes the second difference of linearised depth, so it is zero across any plane at any
  angle and fires only on silhouettes and creases, convex strongly and concave faintly; a
  split-tone grade (cool darks, warm lights, lifted blacks) with a preset per time of day; FXAA.
  Three full-screen passes and a 1.5× supersample on low-DPI screens.

The ink pass is what would make `painted` earn its name. It is also a depth-texture read plus
three passes of fill rate, so it is a **desktop tier** feature: V2's quality setting gates it,
and the frame-time governor is what turns it off on a phone that cannot hold 30 fps. On an
orthographic camera the depth is linear already and `uNear`/`uFar` become the ortho planes.

The important ruling-017 caveat holds: the ink is a *finish*. `painted` needs the anime rig,
the toon shading and its own palette first, or it is the same grey city with lines on it.

## 7.5 Sky

City Grid clears to a flat sky colour, which is right for an orthographic city view where the
sky is never in frame. The tilt and street cameras see the horizon. Higashiyama's dome shader
(banded gradient, warm haze low, a sun glow at sunset) is fifty lines, unlit, and follows the
camera; the basin of ridge flats is optional dressing for a map with hills. Union Square's
`Sky` addon and PMREM env are for the photo rig only.

## 7.6 Palette discipline

Art-direction §1.5 gives the palette three jobs - terrain vs buildings, eleven overlays, sixteen
player colours under three kinds of colour blindness - and `test/render.test.js` simulates them.
Any new colour the L3 kit introduces (kerb, sidewalk, asphalt, glass, sign backgrounds) is a
palette entry in `palettes.js`, per style, and goes through the same test; Higashiyama's rule
that a new brown is a mix of two named ones rather than a fresh hex is the way to keep the
count down.

# 08 - Camera, LOD and the budget

## 8.1 Three cameras, one view object

| Mode | Projection | Control | Exists |
|---|---|---|---|
| city | orthographic, `span` zoom | pan, wheel zoom, Q/E snapped yaw, right-drag orbit 12-82° | yes (ruling 006) |
| tilt | perspective, same orbit target and yaw, pitch down to 12° | same inputs; zoom moves the eye along the view ray | V5, Q25 |
| street | perspective at 1.62-1.7 m eye height, pointer lock or drag-look, WASD | walk with collision; touch: tap-to-walk or a stick | new |

`view` in `camera.js` gains `mode`, keeps `targetX/targetZ/yaw/pitch/span`, and the tilt camera
derives its distance from `span` so switching projection does not jump. The four snapped yaws
still snap in every mode. Entering street mode is "zoom past the minimum span while tilted
below ~25°, or press a key": the eye drops to the picked tile's sidewalk, the exit is the same
key or zooming out.

Picking in tilt and street mode is already a ray; with relief (V4) it marches the height field
in both projections instead of intersecting `y = 0`.

## 8.2 One LOD policy for two projections

`lod.js` decides by *pixels per tile* because an orthographic camera puts every tile at the same
size. A perspective camera does not, so the quantity is computed **per chunk** instead of per
frame:

```
tilePixels(chunk) = TILE_M × focalLengthPx / distance(camera, chunk centre)     // perspective
tilePixels(chunk) = canvasHeight / span                                           // orthographic
```

The same thresholds then apply per chunk - props below 42 px, markings below 20, SHAPE below
30, BLOCK below 13, trees off below 8 - plus one new one: **L3 above ~160 px** a tile, which at
`TILE_M = 20` is a chunk within roughly 40-60 m of a street camera. `countScene` already takes a
bounds rectangle; it becomes a per-chunk count, and `visibleBounds` for a perspective camera is
the frustum's ground footprint, capped by a far plane and fog.

The ladder keeps its order and grows two rungs: **cars** (between props and markings; cars are
the feature that was asked for, so they go late) and **L3 chunks** (the first thing to give up
when a street view is over budget: drop the farthest L3 chunk back to L2). Costs for both are
measured by `createInstances` and the baker, never remembered (ruling 019).

It grew both in V1 and V2. **Cars** sit between props and markings as planned, with a
resolvability gate at 18 px a tile — a car is 0.22 of a tile long, so below that it is four
pixels of a colour already on the road, and there may be a thousand of them at 82 triangles
each. And **networks**, after poles and before shadows, with a resolvability gate
at 12 px a tile. A wire ribbon is 0.16 of a tile wide, so below that it draws a line thinner
than a pixel — and on a wired city the two ribbons are the largest single thing on screen
(13,476 instances, 43% of the frame at the default span on a 64x64). Without it the Low tier
did not fit its own budget with the whole ladder spent. The power and water overlays still say
where the network reaches.

## 8.3 The budget and what it cannot see

The render-measure-step-down loop in `scene.js` stays the promise. Three costs sit outside it:

- **Post passes** - fill rate, invisible to a triangle counter. V2's frame-time governor: a
  rolling p95 frame time; if it exceeds the tier's target for a second, disable the most
  expensive optional pass (ink, then shadows, then supersample) and remember the choice.
- **Chunk builds** - CPU, one-off. Bounded by "one chunk per frame, nearest first" and by the
  L3 radius the tier allows (Low: none, Medium: 4 chunks, High: 9).
- **Shadow pass** - counted once by three's counter (N30 measured it), still GPU work; already a
  ladder rung.

Tiers (V2), defaulted from `deviceClass()`:

| Tier | Budget | L3 | Cars | Shadows | Post |
|---|---|---|---|---|---|
| Low (phone-weak) | 40k | none | capped 60 | off | none |
| Medium (phone / weak desktop) | 80k | 4 chunks, day only | capped 200 | soft | pixel only |
| High (desktop) | 200k | 9 chunks | uncapped | soft, following frustum | any |

The budget gate runs at all three and at both projections; a saturated fixture at street level
is the case that has never been measured.

## 8.4 Streaming

Chunks outside `visibleBounds` push nothing (already true for pools). L3 chunks farther than
the tier's radius are dropped back to L2 and their baked group disposed after a grace period,
so panning along a street does not thrash. Union Square hides facade cells beyond 420 m and
keeps massing; here L2 is the massing.

# 08 - Camera, LOD and the budget

## 8.1 Three cameras, one view object

| Mode | Projection | Control | Exists |
|---|---|---|---|
| city | orthographic, `span` zoom | pan, wheel zoom, Q/E snapped yaw, right-drag orbit 12-82° | yes (ruling 006) |
| tilt | perspective, same orbit target and yaw, pitch down to 12° | same inputs; zoom moves the eye along the view ray | V5, Q25 |
| street | perspective at 1.62-1.7 m eye height, free look, WASD | walk with collision; touch: tap-to-walk | yes (E4) |
| photo | perspective, free camera anywhere over the map | free look, WASD and the mouse buttons | yes (F1) |

**Free look is Pointer Lock, with drag-look as the fallback (K3, A58, 2026-09-11).** In the street
and in photo mode the pointer is taken on the gesture that entered the mode, and the mouse then
looks with nothing held; the left and right buttons walk forward and back, both together run. The
lock needs a user gesture and is refused outright in a cross-origin frame, so `looksNow()` in
`client/input/buttons.js` also answers for the unlocked case and the drag still looks. `?lock=0`
refuses the lock on purpose, which is how `play_smoke` drives both paths — the second desktop row
boots with it.

`view` in `camera.js` has `mode`, keeps `targetX/targetZ/yaw/pitch/span`, and the tilt camera
derives its distance from `span` so switching projection does not jump. The four snapped yaws
still snap in every mode. Entering street mode is "zoom past the minimum span while tilted
below ~25°, or press a key": the eye drops to the picked tile's sidewalk, the exit is the same
key or zooming out.

Picking in tilt and street mode is already a ray; with relief (V4) it marches the height field
in both projections instead of intersecting `y = 0`.

## 8.1b As built (E4, 2026-09-06) — the street camera

`street` is a third mode of the same `view`. What is new is that in it the CAMERA IS THE WALKER:
`client/life/walker.js` owns a pose in metres, `scene.js` copies it into `view.eye` in tile units
each frame, and `applyPose` points the perspective camera out of it. Nothing in the walker knows a
camera exists, and nothing in the camera knows a city model exists.

Three things had to move with it:

- **`lod.js` gained `eyeOf(view)`**, which answers where the perspective eye is and which way it
  looks for BOTH modes. `tilePixels` and `visibleBounds` had each derived the eye from `span` and
  the orbit, which in street mode is an orbit that is no longer there — the budget would have been
  measured from a camera fifty metres above the player's head.
- **The near and far planes are per mode.** A near plane of 0.5 *tiles* is ten metres: from eye
  height it clips the pavement, the kerb and the front of the building you are standing next to.
  Street mode uses 0.02 and pulls the far plane in to 100 tiles, which is where the fog already is.
- **The interface is a mode, not a set of disabled buttons.** `#hud[data-camera="street"]` hides
  the build rail, the tools, the minimap and the preview. A street is for looking at (ruling 034),
  and an interface that is still there and refuses every press reads as broken.

Entering is `F`, the street-view button, or zooming past the minimum span below 25° of pitch;
leaving is `F`, `Escape`, the same button, or zooming out. On a coarse pointer a tap on the ground
walks there (`walker.seek`), because a virtual stick on a phone is a thumb over the thing you are
trying to look at.

Collision is `client/world/collision.js`: every lot as a solid box seated on its own ground, in an
8 m spatial hash. **A box and not four wall segments** — a segment push-out has no idea which side
of itself it is on, so a walker a few centimetres inside a building came out further inside it.
`floorAt` is `surfaceAt(...).y` with a 0.6 m step-up limit, which is what makes E3's kerb a step
you walk up and a garden wall something you do not.

**The street furniture is solid too** (E7, A43). Lamps and hedges become thin boxes from the same
pure functions that place them — which is why the placement moved out of `render/props-l3.js` into
`client/world/street-furniture.js`; a lamp placed by one rule and collided by another is a lamp you
walk through standing next to one you cannot. Bins are stepped over. It moved a number:
a lamp stood at `road.width / 2 + road.sidewalk / 2`, which is the middle of the pavement and
therefore exactly the line a person walks down, so `walkthrough` ground to a halt on a post every
24 m. `props.lampInset` puts it 0.5 m out from the kerb instead.

Measured on the saturated 96×96 (`tools/walkthrough.mjs`), **after** the furniture became solid:
8,907 legs, 161.04 km walked down every carriageway and both pavements of every corridor,
**0 unfinished, 0 refusals, 0 cliffs**, steepest ground 0.86 m over 2 m; 1,127 lots walked at
head-on and **0 entered**; 399,901 steps pushed back by the collision world, of 5,609 solids where
E4 had 1,129. `tools/passability.mjs`: 32,659 samples, **25,560** of them enclosed on both sides
(E4: 8,461 — the posts are what the disc now finds), narrowest street **11.14 m** against a right
of way of 20 m and a walker needing 0.88 m, **0 too narrow**.

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
  expensive optional pass (pixel, then ink, then shadows, then supersample) and remember the
  choice. **The target is a threshold above the refresh interval, never the interval itself** —
  see the tier table below and ruling 040's 2026-09-08 amendment.
- **Chunk builds** - CPU, one-off. Bounded by "one chunk per frame, nearest first" and by the
  L3 radius the tier allows (Low: none, Medium: 4 chunks, High: 9).
- **Shadow pass** - counted once by three's counter (N30 measured it), still GPU work; already a
  ladder rung.

Tiers (V2), defaulted from `deviceClass()`:

| Tier | Budget | Frame target | L3 | Cars | Shadows | Post |
|---|---|---|---|---|---|---|
| Low (phone-weak) | 40k | 40 ms | none | capped 60 | off | none |
| Medium (phone / weak desktop) | 140k | 40 ms | 4 chunks, day only | capped 200 | soft | pixel only |
| High (desktop) | 400k | 20 ms | 9 chunks | uncapped | soft, following frustum | any |

The Medium and High numbers were 80k and 200k until E5. They were set in V2, before L3 existed,
and a chunk of real facades is 25.7k triangles — nine of them is 200k on its own. Measured on a
saturated city at street level: a High frame is ~316k, a Medium one ~130k. Low is unchanged
because Low has no street chunks at all. The frame-time governor is still what protects a device;
the triangle budget only decides what gets sacrificed first.

The frame targets were 33, 33 and **16** ms until D5 (2026-09-08) — the refresh intervals
themselves, so `p95 <= target` was false forever on any machine locked to its rate and the
governor spent its entire ladder on an RTX 4090 holding a flat 16.7 ms. They now carry a fifth of
a frame of headroom over the rate each aims at.

**None of these budgets has been measured on a device that struggles.** One real card exists
(`reports/perf/desktop-4090.json`) and it never worked hard; the phone the Low and Medium rows were
designed for has still never drawn a frame (`workitems-measurement.md` D2, D3).

The budget gate runs at all three and at both projections; a saturated fixture at street level
is the case that has never been measured.

## 8.1a As built (V5, 2026-09-06)

`view` holds **both** cameras and swaps which one `view.camera` points at; the target, yaw,
pitch and span are shared, so `setMode` does not move the city. `span` keeps the meaning it has
always had — **tiles across the shorter axis** — and the perspective eye distance is derived
from it. Deriving it from `span` as if it were the *vertical* extent put a portrait phone's
camera at the wrong distance and every drag on it missed; `verticalSpan(view)` is the fix and
the reason the function exists.

**The LOD plan is per chunk**, not per frame. `tilePixels(view, canvasHeight, chunk)` answers
for a chunk under perspective and for the frame under orthographic; `planForChunk(plan, px)`
takes the frame's plan and removes whatever that chunk's own distance cannot resolve — never
adds anything back, so a far chunk can never come out finer than a near one. Measured on a
saturated 128×128 at span 14: **64 chunks, 3 distinct plans**; orthographic reports 1 by
construction.

Two things had to follow it, both the same lesson as P35 — an estimate that does not price what
the renderer draws is an estimate that sacrifices detail for nothing:

- **`countScene` counts per chunk as well as in total**, and `estimate` prices each chunk at its
  own plan when the view is perspective. Without it the estimate was **77% over** the truth at
  close zoom.
- **Terrain is counted against the frustum's ground footprint**, not against its bounding box.
  The box of a wedge holds far more chunks than the wedge, and three frustum-culls the terrain.
  A chunk counts if any of its corners or its centre is inside: testing the centre alone
  under-counted by 40%, which is the more dangerous direction, because the render-and-measure
  loop corrects an over-estimate and cannot see the other.

A sky dome (`client/render/sky.js`, one draw call, vertex-colour gradient, no asset) and a
zoom-relative fog, both perspective only: an orthographic view has no horizon to fade into.

Estimate against actual after all of it, on a saturated 96×96: orthographic **0–7%**,
perspective **1–23%**, against a 25% gate. Draw calls rise from 55 to 91 in perspective, because
a per-chunk plan means more building tiers are in use at once — triangles bought with draw
calls, and both are inside their budgets.

## 8.4 Streaming

Chunks outside `visibleBounds` push nothing (already true for pools). L3 chunks farther than
the tier's radius are dropped back to L2 and their baked group disposed after a grace period,
so panning along a street does not thrash. Union Square hides facade cells beyond 420 m and
keeps massing; here L2 is the massing.

## 8.5 Review round after E3 (2026-09-06)

- **The orbit is around the ground under the target** (E3, A34): `applyPose` reads
  `view.groundY`. `tilePixels` and `visibleBounds` must use the same eye; the pose arithmetic
  moves to `client/world/orbit.js` and both call it (slice R1).
- **Cars are culled and counted against the view** (R1). `traffic.pose` poses only cars inside
  `bounds` and `counts.cars` is that number, not the city's. A saturated 128×128 holds 3,660
  cars, which posed everywhere is 300k triangles a frame and a ladder that drops cars at every
  zoom.
- **The street camera (E4)** needs its own near plane — 0.5 tile units is 10 m and would clip
  the pavement — and `tilePixels`, `visibleBounds` and `chunksNear` must treat `mode ===
  'street'` as perspective from the eye, not as orthographic. `view.mode !== 'city'` is not a
  safe test for "orthographic" once a third mode exists.
- **The governor's `supersample` rung is wired** to a pixel-ratio step-down (R1); the `pixel`
  post pass joins the sacrifice ladder, since it is a full-screen pass like ink.

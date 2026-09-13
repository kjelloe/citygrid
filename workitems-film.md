# film — work items

*Written 2026-09-06. Both fable51 worlds lead their README with a sixty-second walkthrough
cut from the world itself, and every shot in those films was framed from a storyboard the
capture tool rendered in seconds. City Grid has the pieces — a walker, three cameras, three
hours of light, three styles, a screenshot harness — and no shot list, no camera language and
no film. This lane builds the photo mode `specs/plan.md` §10 promised and the tour on top of it.
Same rules as `workitems-cityviewer.md` §0. Written to follow `workitems-measurement.md`; as of
2026-09-09 that lane's buildable half is done and the rest waits on a phone card, so **F1 starts
after measurement D8**. The film itself (F3) still waits for the tiers to be measured on a phone —
a film made before that is a film of the wrong frame rate — but the photo mode and the shot list
do not. Two things the measurement lane left for this one: `tools/shoot.html` advances
`client/life/` now (D4 found `?life=1` had never moved a car in any screenshot), so a storyboard
frame has traffic in it; and **Q73** — three-quarters of a played city's zoned ground is empty
and reads as a grey slab — is a picture problem that the photo mode is the first instrument for.*

## F1 — Photo mode (M) — plan.md §10 bonus 4 — **done 2026-09-10 as `slice-F1`**

`P` or the button; WASD flies, Shift is faster, drag looks, Escape leaves. The HUD gets out of the
way of the picture and leaves one slim bar with **Save PNG** on it — which draws the scene once
more into a render target at 2× on High rather than turning `preserveDrawingBuffer` on and paying
for every frame to keep one.

`client/world/photo.js` is the arithmetic, pure and node-tested: forward follows the look including
pitch, strafe stays horizontal, a diagonal is not faster than a straight line, and the speed
follows the zoom — six seconds to cross whatever you can see. The fourth mode is taught to `eyeOf`,
`tilePixels`, `visibleBounds`, the near/far planes and `fogFor`, the last of which asks the camera
where it **is** rather than what it is called: the street's fixed reach in metres below a tile of
eye height, the city's multiple of the span above it.

**Gates:** `ui_smoke` 130 checks (the button, the way out staying on screen, the download event and
the PNG's bytes); `play_smoke` 24 photo rows across four viewport configurations, entering and
leaving from city and from street; `reach_smoke` green; `budget_gate` gains a photo row at eye
height, whose near plane is the tell — an orthographic fall-through would clip the pavement.

**Three defects, each found by something refusing the change**, and all three are in the dev-log:
the estimate and the renderer disagreeing about which modes plan per chunk (which emptied the
street frame), a way out that hid itself, and a gate step that flew the camera 69 tiles away and
did not put it back.



**Goal.** A player frames a shot and saves it. Free camera, hidden HUD, chosen hour and style,
PNG export.

**Do.**
- `view.mode = "photo"`: the perspective camera freed from the orbit — position and look set
  directly, moved with WASD and the mouse like the walker but without collision or gravity,
  speed scaled by the current span so it is usable from the air and from the pavement. Enter
  from city or street with a key (`P`) and a HUD button (ruling 027); leave with the same.
- The HUD hides behind `[data-camera="photo"]` except a slim bar: hour, style, field of view,
  **Save PNG**, exit. Saving is `canvas.toBlob` through a download link — a file the player
  keeps, which is the one export the game has.
- The renderer's `preserveDrawingBuffer` is off in play; photo mode renders once more into a
  render target at the canvas size (or 2× on High) and reads that back, so the setting does not
  cost every frame for the one frame that needs it.
- `client/world/orbit.js` learns the fourth mode: `eyeOf` returns the stored eye and forward.
  `tilePixels`, `visibleBounds`, `chunksNear` and picking go through it, as ruling 034 demands
  of every mode; picking in photo mode is off (there is nothing to build). Since V8 three more
  things branch on the mode and need the fourth branch: `render/atmosphere.js` (`fogFor` is
  fixed metres in street mode and span-scaled otherwise — photo wants the street rule from the
  pavement and the city rule from the air, so pick by eye height), `skyRadiusFor` (the dome is
  scaled to sit inside the mode's far plane and follows the camera), and
  `render/minimap-model.js` (`viewportShape` draws the frustum footprint under perspective and
  `walkerMark` a dot in street mode; photo mode draws the footprint and no dot). The near and
  far planes are set per mode in `camera.js`'s `applyZoom` — photo takes street's pair near the
  ground and city's pair in the air.
- Reduced motion, `?life=0` and the walker are untouched; the cars keep moving in photo mode
  unless the player pauses the game, which pauses them too.

**Tests first.** `test/input.test.js`: photo mode ignores build keys and the four snapped yaws
still snap on exit; `test/lod.test.js`: `tilePixels` in photo mode equals the perspective
formula at the stored eye. `ui_smoke` drives the button, saves, and checks a PNG of the canvas
size arrived (Playwright's download event).

**Gate.** `play_smoke` enters and leaves photo mode from city and from street on both
viewports; `budget_gate` in photo mode at one span.

## F2 — The shot list and the storyboard (M)

**Goal.** A film is a list of shots the tool can render one frame per second in a minute, so
the framing is decided by looking at a storyboard rather than by rendering the film.

**Do.**
- `data/film/<name>.json`: an ordered list of shots, each `{ title, subtitle, camera, from,
  to, look, duration, hold, time, style, ease }` where `camera` is `orbit | walk | crane |
  pan | photo`, positions are in tiles, `look` is a point or a heading, and `walk` shots drive
  the real walker along a corridor between two points (the movement code is the same one the
  walkthrough gate uses, so a walk shot cannot cross a wall). The Higashiyama tour is the
  model: each subject gets the move it asks for — a descending crane over the roofs, a pan
  along a river, an orbit of a civic block, the climb of a hill street, a pull-back at sunset.
- `client/debug/tour.js`: plays a shot list in the page on a fixed `dt` handed in by the
  caller, never wall clock, so the film is the same on every machine; sets the hour and the
  style per shot; exposes `window.__film.frame(i)` to the tool.
- `tools/film.mjs --list=<name> --fps=1 --w=960 --h=540 --out=reports/storyboard/<name>` renders
  one frame a second as a contact sheet; `--fps=30 --w=1920 --h=1080` renders every frame
  as numbered PNGs. The page loop is parked (`window.__paused`, the Higashiyama trick) so the
  recorder owns the clock and the render.
- The first list: "City Grid in sixty seconds" — aerial over the whole 96×96, a crane down to a
  crossroads with traffic, a walk along a high street at dusk, the same street at night with
  the shops lit, a pan across a suburb, an orbit of the civic block in `painted`, a pull-back
  to the aerial at sunset.

- **Two pulls this lane owned** (A48, A50) moved on 2026-09-10 to `workitems-behaviour.md` B5
  (people with roles) and `workitems-world.md` S4 (the river cut); F2 takes them from there. The
  earlier text: if a shot wants a specific person to walk to a
  specific door, F2 builds the route planner over `client/world/nav.js` (a role state machine
  over a graph search — Q62's answer was "not until a shot needs it"); and if a shot wants a
  river that reads as a channel rather than a trough, F2 points R3's `gradeProfile` at the
  water layer (Q65). Neither is built unless a shot in the list asks for it, and the storyboard
  is what decides. **B5 built the first (2026-09-14):** `client/life/pedestrians.js` has the role
  state machine (`roleFor`) and one route search per journey over `nav.js`; a shot that wants a
  specific person at a specific door asks that search for the route instead of building one.

**Tests first.** The shot list schema is validated in node (`test/film.test.js`): every shot has
a duration, a `walk` shot's endpoints are on a corridor of the fixture, styles and hours are
ones that exist, and the total is within a second of sixty. The easing functions are pure and
tested at 0, ½ and 1.

**Gate.** `node tools/film.mjs --fps=1` produces a storyboard for the first list in under a
minute on SwiftShader, and every frame is looked at.

## F3 — Encode and publish (S)

**Goal.** An `.mp4` and a preview `.gif`, and a README that leads with them.

**Do.**
- `tools/film_encode.mjs`: frames → `media/<name>.mp4` (H.264, 30 fps, CRF 20) and
  `media/<name>-preview.gif` (480 px wide, 12 fps, the first ten seconds), plus three stills.
  `ffmpeg` is a **dev** tool on the path, not a dependency of the game (CLAUDE.md 7 is about
  the game); the tool says so when it is missing and does nothing else.
- `media/` is committed with the film, the preview and the stills, sized like fable51's
  (about 10 MB for a minute). `.gitignore` keeps the frame directories out.
- `README.md` leads with the preview linked to the film, the way `fable51-worlds/README.md`
  does, above the document table.

**Done when** the film plays, the README shows it, and the storyboard that framed it is in
`reports/storyboard/`.

## F4 — Photographs of a real place (L, optional)

The fable51 worlds are reconstructions checked against photographs. City Grid's cities are
generated, so the equivalent is the reference-compare sheet in `workitems-measurement.md` D4.
This item is here only to record that a "real district" scenario — a City Grid save whose
street grid and building footprints come from OpenStreetMap, rendered by cityviewer — is a few
hundred lines on top of `engine/worldgen.js`'s scenario hooks (ruling 012) and would let the
compare sheet be made against a photograph. Not scheduled.

## Order

F1 → F2 → F3. F4 is a note.

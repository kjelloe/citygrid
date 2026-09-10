# navigation — work items

*Written 2026-09-10 from Kjell's P59: "navigation around the world needs to be easier via on
screen keys and mouse left-and-right mouse button." Ruling 042 records the decision. Today the
camera is driven by things a player has to already know: right-drag orbits, middle-drag pans, Q
and E snap, arrows step the view one nudge per press, F enters the street, and none of it is on
the screen except the street button. A phone has a twist gesture nobody discovers. This lane puts
the camera on the screen and on the two mouse buttons everybody has, in every mode — city, street
and (once F1 lands) photo. Same rules as `workitems-cityviewer.md` §0: slice workflow, tests
first, green twice, a dev-log entry with numbers, commit as `slice-<id>`. Do it **after F1**, so
the cluster is built for four modes rather than retrofitted for the fourth.*

**What every item here must keep:** ruling 027 (a control has an i18n key and a screen), ruling
028 (a toolbar is one tab stop with arrow keys), ruling 034 (every mode goes through
`client/world/orbit.js`), the four snapped yaws that Q and E land on, and the phone's chrome
share (playtest §2: 41% at 390×844 — this lane may not raise it). **Assert the effect, not the
setting**: every gate row that presses a control reads the camera or the walker afterwards.

## K1 — The camera cluster on screen (M)

**Goal.** Every camera movement has a button, in one place, that works by mouse, touch and
keyboard, in every mode.

**Do.**
- `client/ui/camera-model.js` — pure, node-loadable: the buttons as data. Each names its i18n
  key, its keyboard equivalent (so `help-model.js` derives the card from it, the way tools are
  derived from `TOOLS`), what it does (`pan`, `rotate`, `tilt`, `zoom`, `home`, `street`,
  `photo`), whether it **repeats while held** and at what rate, and which modes show it. Rates
  are per second and scaled by `dt` (D7's lesson): a pan button held for one second moves
  `span / PAN_SECONDS` tiles whatever the frame rate.
- `client/ui/camera-cluster.js` — the DOM. A compact cluster at the bottom right, above the
  bottom bar: a four-way pan pad, rotate ◀ ▶, tilt ▲ ▼, zoom + −, **Home**, and the mode buttons
  (Street, Photo) moved in from the top bar so the camera has one home. `role="toolbar"` through
  `ui/roving.js`. Held buttons drive `client/input/controller.js` through the same intents the
  keys use — one path, so the button and the key cannot disagree.
- In street mode the pad becomes walk (forward/back/strafe) and the tilt buttons look up and
  down; in photo mode the pad flies. The model says which label each button carries per mode.
- On a phone the cluster collapses to one compass button that opens it; targets are 44 px; it
  does not overlap the rail or the build bar on 390×844.
- Reduced motion: no easing on any of it (spec §30).

**Tests first.** `test/camera-model.test.js`: every button has an i18n key in both catalogues, a
mode list, and a repeat rate if it repeats; the help card (`test/help.test.js`) lists every key
the cluster claims and the controller binds it. `ui_smoke`: presses each button on both viewports
and asserts the view moved (target, yaw, pitch or span — whichever the button promises);
`reach_smoke` finds every button; `a11y_smoke` keyboard-walks the cluster as one tab stop and
measures its contrast at night. `play_smoke`: the chrome share on the phone viewport is not above
the playtest's 41%.

**Gate.** `gates.mjs quick` green; `reports/smoke-K1-{desktop,phone,street}.png`. Q79 applies:
the new `ui_smoke` checks are counted and if the set trips its budget the row says so.

## K2 — Held keys move, and move at a rate (S)

**Goal.** Holding an arrow pans smoothly; the keyboard drives the camera the way the pad does.

**Do.**
- Arrows held = continuous pan at the pad's rate (today one nudge per keydown, which is a stutter
  under key repeat). `PageUp`/`PageDown` tilt, `Home` fits the city (K4), `Shift` doubles the
  rate. Q and E keep their snap; holding either past 300 ms turns freely and releasing lands on
  the nearest snapped yaw (the amendment to ruling 006 already allows the mouse to sit between).
- Street mode keeps WASD, Shift and Escape; photo mode the same plus R/F for up and down. The
  cluster's per-mode labels come from the same table (K1).
- The held-key set lives beside `held` in the controller; the frame loop's `dt` drives it.

**Tests first.** `test/input.test.js`: a held arrow for one simulated second moves the target by
the rate, at `dt = 1/60` and `1/15` within 1%; Q held past the threshold turns freely and lands
snapped on release; keys inside a toolbar are untouched (ruling 028). `play_smoke` holds an arrow
for 500 ms on the desktop viewport and asserts the target moved.

## K3 — The two mouse buttons (M) — ruling 042

**Goal.** Left and right, alone and together, move the player through the world in every mode,
and the help card says so in one line.

**Do — city mode.**
- Left: the tool, or a pan with none (unchanged). Right: orbit — sideways turns, up and down
  tilts (unchanged, N28/P34). **Both held: dolly** — moving the mouse up flies toward the ground
  point under the cursor and down away from it, span-scaled, which is the zoom a wheel-less
  trackpad never had. Middle keeps panning.
- **A hand.** With a tool in hand there is no way to pan by mouse except middle; the cluster
  (K1) gains a hand toggle and `Space` held is its key: while it is on, left-drag pans and the
  tool is not fired. Released, the tool comes back. The ghost hides while the hand is down.
- Wheel keeps the ground point under the cursor fixed (it does today under perspective — assert
  it; it is the test that stops it regressing when the dolly is added).
- Optional and off by default: **edge scrolling** — the pointer at the canvas edge pans, a
  settings row, because it fights a trackpad and a phone has no edge. Q82.

**Do — street mode.**
- **Left held: walk forward** in the look direction; **right held: walk back**; **both: run**.
  Mouse movement while any button is held looks (today's drag-look, Q43: no pointer lock). Tap
  on the ground still walks there (A34, phones). The wheel does nothing here — a wheel that
  zooms a walker is a wheel that changes the lens.
- Photo mode: the same three, without collision, at `photoSpeed(span)` (F1).

**Tests first.** `test/input.test.js` gets a pure table of button state → intent for each mode
(`buttonsToIntent(mode, {left, right, middle}, dx, dy)`), and the tests plant each combination.
`play_smoke` drives real pointer events on both viewports: both-buttons-drag changes `span` and
keeps the ground point under the cursor within a tile; left-held in the street moves the walker
forward by `walkSpeed × seconds` within 10%; right-held moves it back; the hand pans with a tool
selected and the tool fires nothing (`state.tiles.road` unchanged, hash unchanged). `test/help.test.js`:
the pointer rows on the card name every button combination the controller binds.

**Must not change:** any fixture hash; `client/world/orbit.js`'s `eyeOf`; the walker's collision.

## K4 — Where am I, and go there (S)

**Goal.** The player can always get back to the city and to the place they were.

**Do.**
- **Home** fits the built city (the bounding box of paved or built tiles, or the whole map if
  nothing is built) at the default pitch and the nearest snapped yaw; a second press within
  three seconds returns to the view before it. From the street, Home leaves the street over the
  walker (today's `leaveStreet`) and then fits.
- **Double-click on the ground** with no tool centres the view there without changing the zoom;
  in the street it walks there (the phone's tap-to-walk, given to the mouse).
- The cluster carries a **compass**: which of the four snapped yaws the view is nearest, and
  north. Rotating the view rotates it; it is a picture (`role="img"`), not a control (ruling 028's
  minimap precedent).
- Notifications already jump the camera (§17); they use the same `focusOn` and gain the same
  easing rule (none under reduced motion).

**Tests first.** `client/world/fit.js` (pure): `fitBounds(state) → {targetX, targetZ, span}` on a
city that occupies one corner, and on an empty map; `test/input.test.js`: two Home presses
restore the prior view exactly. `play_smoke`: double-click centres; Home from the street lands in
the mode the player came from (R2's `cameFrom`).

## K5 — The phone (S)

**Goal.** Everything above on a 390×844 screen, without the chrome growing.

**Do.**
- The collapsed cluster is one 44 px compass button in the corner; open, it is the pad and six
  buttons in two rows and closes on a tap outside or after five idle seconds.
- One-finger drag pans, pinch zooms, two-finger twist rotates (unchanged); the cluster is how a
  player who never twists finds rotation. In the street, the pad walks, and drag-look stays.
- Measured: chrome share at 390×844 with the cluster closed and open, in the dev-log beside the
  playtest's 41%.

**Tests first.** `play_smoke` on the phone viewport: open the cluster, press pan and rotate,
assert the view moved, close it, assert the map is fully tappable again (`reach_smoke`'s
"nothing invisible eats the map", ruling 029).

## Order

K1 → K3 → K2 → K4 → K5. The cluster first because every other item puts a button on it; the
mouse second because it is what Kjell asked for by name; the phone last because it is the
cluster again at a different size. After K5, update `specs/gamedesign.md` §13.4 and the help card
in the same slice, and amend ruling 006 to say the four angles are where Q, E and the compass
land, not where the camera is allowed to be.

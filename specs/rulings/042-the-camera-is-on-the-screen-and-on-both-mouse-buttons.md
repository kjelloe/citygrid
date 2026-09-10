# Ruling 042 — The camera is on the screen and on both mouse buttons

- **Date:** 2026-09-10
- **Source:** P59 — "navigation around the world needs to be easier via on screen keys and mouse left-and-right mouse button"; playtest §2 and the second playtest (P34), which settled the three buttons and left the keys unwritten anywhere a player looks
- **Status:** ruled; built by `workitems-navigation.md` K1–K5
- **Specification:** `specs/engine/08-camera-lod-budget.md` §8.1 (the three camera modes) and ruling 034 (every mode goes through `client/world/orbit.js`); `specs/gamedesign.md` §13.4

## Question

Every camera movement exists — pan, orbit, tilt, zoom, snap, street — and a player finds out
about most of them from the help card or not at all. A phone rotates by a two-finger twist
nobody discovers. In the street the mouse looks and the keyboard walks, so a mouse-only player
cannot move. Where does the camera live?

## Ruling

1. **Every camera movement has a button on the screen**, in one cluster, in every mode, with an
   i18n key (027) and a place in one toolbar tab stop (028). The cluster's buttons and the keys
   drive the same intents through `client/input/controller.js`; a button that does something a
   key cannot, or the reverse, is a defect.
2. **The two mouse buttons move the player in every mode.** City: left is the tool or a pan,
   right orbits, both together dolly; a hand (the cluster, or `Space` held) makes left pan with a
   tool in hand. Street and photo: left held walks forward in the look direction, right held
   walks back, both run; movement while held looks. Middle pans everywhere.
   **Amended in K3 (2026-09-11, A58):** the hand is `H`, not `Space` — Space pauses, and taking
   the most-used key in the game to disambiguate a rare pan would degrade the common control to
   serve the rare one. And in the street and in photo mode **movement looks whether or not
   anything is held**, through Pointer Lock; drag-look remains the path where the browser refuses
   the lock, which a cross-origin frame always does. `looksNow()` in `client/input/buttons.js` is
   the one place that decides which, and `?lock=0` refuses the lock so both can be gated.
3. **Held is a rate, per second, scaled by `dt`** — a key, a button or a mouse button held for a
   second moves the same distance at any frame rate (D7's rule applied to input).
   **Built for the keyboard in K2 (2026-09-11):** `client/input/held.js` is the table, the keys go
   through the same `holdCamera`/`stepCamera` path the cluster uses, and `Shift` doubles the rate.
   A TAP is worth `TAP_SECONDS` of holding, because a rate applied for the gap between `keydown`
   and `keyup` is zero and a key that moves nothing reads as broken.
4. **The four snapped yaws are where Q, E and the compass land**, not where the camera is
   allowed to be — the amendment to ruling 006 that N28 made in code is now written.
5. **The chrome does not grow.** The cluster on a phone is one button until opened, and the
   playtest's 41% at 390×844 is the ceiling.

## Why

A control that exists and cannot be found is not a feature (026, in the reachability sweep's
own words); the camera was the largest such control in the game. Kjell asked for on-screen keys
and both mouse buttons by name. Putting the keys and the buttons on one intent path is what stops
the help card, the cluster and the controller drifting apart — the same argument that derives
the card from `TOOLS`.

## Enforced by

- `test/camera-model.test.js` — every button has both catalogue keys, a mode list and a rate
- `test/help.test.js` — the card lists every key and button combination the controller binds
- `test/input.test.js` — button state → intent per mode, and held input is a rate at three `dt`s;
  every held key is one the camera table claims, and every repeating button has a key that holds it
- `tools/ui_smoke.mjs`, `tools/play_smoke.mjs` — every button pressed on both viewports and the
  camera or the walker read afterwards; the phone's chrome share measured
- `tools/reach_smoke.mjs` — the cluster is clickable and, closed, eats nothing (029), and the
  first-run controls card does not persist over the map
- `test/buttons.test.js` — every button combination in every mode, and both look paths
- `test/controls-card.test.js` — the card's strings exist in both catalogues, it can be put away
  for good and brought back, and every camera button has a glyph of its own

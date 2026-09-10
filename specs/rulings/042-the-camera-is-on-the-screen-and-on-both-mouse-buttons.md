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
3. **Held is a rate, per second, scaled by `dt`** — a key, a button or a mouse button held for a
   second moves the same distance at any frame rate (D7's rule applied to input).
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
- `test/input.test.js` — button state → intent per mode, and held input is a rate at two `dt`s
- `tools/ui_smoke.mjs`, `tools/play_smoke.mjs` — every button pressed on both viewports and the
  camera or the walker read afterwards; the phone's chrome share measured
- `tools/reach_smoke.mjs` — the cluster is clickable and, closed, eats nothing (029)

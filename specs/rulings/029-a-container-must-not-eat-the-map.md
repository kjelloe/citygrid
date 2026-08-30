# Ruling 029 — A container with no pixels must not take a click

- **Date:** 2026-08-31
- **Source:** P31's UI review — two invisible columns swallowing a quarter of the map
- **Status:** ruled

## Question

The HUD is a full-screen overlay of positioned containers over a canvas. What
stops one of them intercepting clicks meant for the map?

## Ruling

**Every HUD container is `pointer-events: none`, and only its leaves are
`auto`** — and the rule that says so must out-specify `#hud > *`.

`tools/reach_smoke.mjs` samples a grid of points across the map and fails if
anything **without pixels** answers a click: a layout box is not a control.

## Why

`#hud > * { pointer-events: auto; }` has one id and beats any class selector, so
`.hud-side { pointer-events: none }` — written deliberately, and read as
correct in review three times — never applied. Two invisible columns, the rail
strip on the left and the advisor column on the right, spanned from under the
top bar to the bottom bar.

**101 of 403 sampled points on the map were dead**, including the entire
right-hand third, where nothing is drawn at all. A player clicking there would
have found the game simply did not respond, with nothing on screen to explain
it — and neither the tests nor nine browser gates could see it, because every
control still worked and every screenshot still looked right.

The bug is only possible because the fix *looked* present. That is what makes it
worth a ruling rather than a commit message: the next such container will be
written the same way.

## Consequences

- `#hud > .hud-side, #hud > .hud-aside { pointer-events: none; }` — matched on
  the id so the intended rule wins.
- A new container over the map must be added to that selector, and
  `reach_smoke` fails if it is not.
- The same gate walks every control, opens whatever hides it, and asserts a
  click at its centre lands on it — so "reachable" and "not eating the map" are
  measured by one tool, in both directions.

## Enforced by

- `tools/reach_smoke.mjs` — "most of the map takes a click" and "nothing
  invisible is swallowing clicks on the map"

# Ruling 028 — An ARIA role is a promise, and an unkept one is worse than nothing

- **Date:** 2026-08-29
- **Source:** the P21 audit — four `role="toolbar"` rows with no arrow-key navigation
- **Status:** ruled

## Question

The HUD's button rows carried `role="toolbar"` from slice N4. Is a role that
describes the layout but not the behaviour a partial win or a defect?

## Ruling

**A defect, and a worse one than having no role at all.** A role that names a
keyboard pattern is only allowed on a container that implements it. Either the
behaviour lands with the role, or the role does not go on.

For `role="toolbar"` the behaviour is: one tab stop for the whole container,
arrows moving between its controls, Home and End jumping to the ends, and the
tab stop following the focus so Tab returns where the player left.

## Why

A plain `<div>` full of `<button>`s is honest. A screen reader announces a list
of buttons, the user presses Tab between them, and everything works — slowly,
but it works, and nothing lied.

`role="toolbar"` changes what assistive technology *tells the user*: this is one
control, use the arrows. So the user presses an arrow, nothing happens, and they
have no way to know whether the application is broken or they are. **Adding the
role took working navigation away** by describing something the code did not do.
Thirty-odd controls were announced as one control with arrow keys, and were
thirty-odd tab stops with none.

The same logic applies to every ARIA attribute the project uses. `aria-pressed`
must track the real state (it does — `refresh()` sets it), `aria-live` regions
must actually change (they do), and `aria-label` must not be a translation key.

## Consequences

- `client/ui/roving.js` implements the pattern; `hud.js` applies it to all four
  rows. `nextIndex()` is pure, because the wrapping is the part that is always
  subtly wrong.
- The tool row also gained the `aria-label` it never had — the only one of the
  four announced as an unnamed toolbar.
- The map canvas takes `tabindex="0"`, `role="application"` and a label naming
  its keys, because an unlabelled canvas is the same failure in a different
  place.
- `tools/a11y_smoke.mjs` measures it: one tab stop per toolbar, the arrows walk
  and wrap, Home and End jump, the stop is remembered, and the arrows do **not**
  pan the map from inside a toolbar.

## Enforced by

- `tools/a11y_smoke.mjs` — the keyboard half
- `test/keyboard.test.js` — `nextIndex` and the shortcut table

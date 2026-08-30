# Ruling 026 — An acceptance gate drives the interface, never the engine underneath it

- **Date:** 2026-08-29
- **Source:** P17's audit — `tools/mvp_acceptance.mjs` reported 13 of 13 for a game
  no person could play
- **Status:** ruled

## Question

When a criterion is about a person doing something, may the gate issue the
command instead of performing the gesture?

## Ruling

**No.** If a criterion in `gamedesign.md` §24 says a player does something, the
script does it the way a player does: click the control, then click the map.
Reaching past the interface into `apply()` is allowed only for bulk world setup
that stands in for time — laying a hundred tiles of road so a later criterion has
a city to measure — and only after a different criterion has already proved that
same gesture works by pointer.

Where a gate does reach past the interface, it says so in a comment naming which
criterion covers the gesture instead.

## Why

`tools/mvp_acceptance.mjs` passed **13 of 13** while `client/ui/hud.js` had no
building tool at all. The toolbar offered zones, roads, wires, pipes and the
bulldozer; there was no way to place a power plant or a water pump. Development
requires both `FLAG_POWERED` and `FLAG_WATERED`, and the only sources of either
are buildings — so a human player could zone and pave forever and nothing would
ever develop.

Criteria 3 ("place electricity and water infrastructure") and 9 ("build police,
fire, and hospital services") both passed by calling `CMD_PLACE_BUILDING`
through `apply()`. Both were green. Both were about the interface. The interface
was missing.

This is the specific failure mode: a gate that reaches past the interface cannot
see an interface that is not there. It does not report a weaker result — it
reports the same result it would report if everything were fine, which is worse
than having no gate, because it is spent confidence.

## Consequences

- Criteria 3 and 9 now click a toolbar button and then the ground, and verify
  the building landed at the tile that was clicked.
- Criterion 7 pulls the tax slider, because a rate the player cannot change is a
  constant. `CMD_SET_TAX` had existed since the economy slice with nothing in
  the interface to send it.
- `test/hud.test.js` asserts every building in the catalogue is reachable from
  the build menu, so a building added to `data/buildings.json` and forgotten in
  the UI is a red suite.
- The same question is now asked of every future gate: *what would this still
  report if the feature it tests were deleted from the client?*

## Enforced by

- `tools/mvp_acceptance.mjs` — `placeByPointer()`, criteria 3, 7 and 9
- `test/hud.test.js` — "every building in the catalogue is reachable from the build menu"
- `.claude/skills/slice-workflow/SKILL.md` — step 4

# Ruling 044 — A placement option is spent into the record, not stored beside it

- **Date:** 2026-09-27
- **Source:** T5a — the airport. A69 asked for "`placeBuilding` gains an `orientation` field
  (validated)"; the airport is 6×4 and the first building in the catalogue with an axis, so the
  command had to carry something the building record did not.
- **Status:** ruled

## Question

`CMD_PLACE_BUILDING` now takes an `orientation`. A building record already carries `w` and `h`,
copied from the definition at placement. Does the orientation become a FIELD on the record — hashed,
saved, projected into the snapshot, migrated — or is it spent at placement into the `w` and `h` the
reducer actually claims?

## Ruling

**Spent.** The reducer validates `orientation` (an integer, 0 or 1, and only for a definition
carrying `orientable: true`), swaps `w` and `h` when it is 1, and stores the result. Nothing
downstream ever sees an orientation: a turned airport is a building whose `w` is 4 and whose `h`
is 6, and `w > h` is what says which way the runway runs.

A placement option that changes the footprint is spent this way. One that changes something the
footprint cannot express would have to be stored, and would then be new hashed state with the five
places that implies.

## Why

The footprint is already hashed, saved and projected: `writeState()` writes `building.w` and
`building.h`, `snapshotOf` copies them, and `copyState` deep-copies the record. So the orientation
was **already** carried by everything that has to carry it, for free, and storing it as well would
have been a second copy of one fact — the shape this project has been bitten by twice
(`VARIANTS` in two files, the LOD cost table against the renderer).

A stored orientation also invites the two to disagree: a record with `orientation: 1` and
`w: 6, h: 4` is expressible, means nothing, and would be a tile grid that does not match the
building sitting on it. A swapped footprint cannot be inconsistent with itself.

And it is free in the determinism machinery: no new hashed field, no fixture re-pin, no save
migration, no lobby options row.

## Consequences

- The renderer reads the axis from the footprint — `specs/engine/06-buildings-and-kit.md` §6.1f.
  `client/world/civic-spec.js` authors masses in unit space across the lot, so a turned lot
  stretches them automatically; anything that must run ALONG the axis (T5b's runway and taxiway
  ribbons) reads `w > h` and not the lot's frontage, which is a different rotation — frontage is
  which street the lot faces.
- The build menu's ghost takes the orientation as an argument (`footprintAt(x, y, def, source,
  orientation)`) so the tiles it shows are the tiles the reducer will test.
- The client holds the pending orientation in the controller's `ui`, resets it with the tool, and
  sends it with the command. It is UI state, not game state.
- A definition without `orientable` is refused a non-zero orientation rather than quietly ignoring
  it, so a client bug is a refusal rather than a building that faces the wrong way.

## Enforced by

- `test/airport.test.js` — the orientation is validated, only an `orientable` definition may be
  turned, turning swaps the claimed tiles, and a turned footprint fits where an untuned one does not
- `test/unlock.test.js`, `test/hud.test.js` — `footprintAt` turns with it
- `tools/ui_smoke.mjs` — the turn button turns the footprint the reducer will claim, on the real page

# Ruling 013 — Placeholders now, with a generated list of what needs drawing

- **Date:** 2026-08-25
- **Source:** P8, answering Q13
- **Status:** ruled

## Question

Is user-selectable art style a goal, and what happens to art in the meantime?

## Ruling

**User-selectable style: yes**, which promotes the `RenderStyle` seam from a nicety to a v1
requirement.

**In the meantime: placeholders, plus a drawing list.** Every visual asset the game needs exists
immediately as a procedurally generated placeholder that is obviously a placeholder, and every
placeholder registers itself in `specs/asset-list.md` as a brief for the real thing.

## Why

Placeholders unblock everything. A slice that needs a hospital mesh should not wait for a hospital
mesh; it needs *something hospital-shaped and hospital-sized*, and the simulation cannot tell the
difference.

The drawing list must be **generated from the code that consumes the assets**, not hand-maintained,
because a hand-maintained list drifts the moment a building type is added. If the game asks for an
asset, the list knows about it.

Placeholders must look deliberately unfinished — flat untextured colour with a category tint and a
visible label at close zoom — so that "we shipped the placeholder" is impossible to do by accident.

## Consequences

- `tools/build_assets.mjs` generates placeholder geometry for every entry in the building and prop
  catalogues, keyed by `(category, footprint, level, valueTier)`.
- `tools/asset_report.mjs` walks the catalogues and regenerates `specs/asset-list.md`: what each
  asset is, its footprint and height budget, how many variants, where it is used, and whether a
  real asset exists yet. A test fails if the file is stale.
- The asset gallery page renders every asset through the real renderer at rest pose, so a real
  asset replacing a placeholder is a reviewable screenshot diff.
- Style selection is a client preference stored locally; it never reaches the reducer or the hash.

## Enforced by

- `specs/asset-list.md` (generated)
- `tools/build_assets.mjs`, `tools/asset_report.mjs`
- `test/assets.test.js` — the list is not stale; every catalogue entry has at least a placeholder
- `specs/art-direction.md` §1.3

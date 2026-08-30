# Ruling 027 — A string in the catalogue must have something that shows it

- **Date:** 2026-08-29
- **Source:** the P20 audit — seven `result.*` reasons that no refusal ever showed
- **Status:** ruled

## Question

The catalogues carry strings for screens that do not exist yet. When is that a
plan, and when is it a bug?

## Ruling

**Every key in `data/i18n/en.json` is either reachable by the interface, or
listed in `test/reachability.test.js`'s `NOT_YET` with the slice that will
reach it.** A key that is neither is a red suite.

Moving a key off that list is a deliberate act with a diff, in the same commit
as the screen that shows it — and the test checks that direction too, so the
list cannot quietly become a lie.

## Why

`t()` returns its own argument when it misses, and a screen that was never built
throws no error. Between them, an unkept promise in the interface is completely
silent. The manual version of this check has found something every single time
it has been run:

- twelve buildings with no toolbar button — a city could not be powered (N11)
- `CMD_SET_TAX` with no control to send it, for four slices (N11)
- three difficulties, balanced across 200 games each in era 1, with no screen to
  select them (N12)
- twenty-five `region.*` names the engine had emitted since worldgen was written
  and nothing had ever rendered (N12)
- **seven `result.*` reasons.** Every refused build in the game's history showed
  the player `0 tiles` and no reason (this slice)

The last one is the clearest case. The strings were written, translated, and
carried in both catalogues from the first commit; `game.js` even passed the
reason to the HUD, as `{ tiles: 0, note: result }` — and `setPreview` ignored
`note`. Nothing was missing except the last line of wiring, and nothing could
tell.

## Consequences

- `test/reachability.test.js` reconstructs every key the interface can build,
  including the ones assembled at runtime (`building.${def}`,
  `region.${shape}.${feature}`, `quest.${id}.title`), and compares the set
  against the catalogue.
- The same suspicion applies in the other direction, and is already ruled: a
  command with no control (ruling 026, `test/omissions.test.js`).
- `lobby.size.recommended` was deleted rather than listed. A key with no future
  slice is not a plan, it is dead weight.
- The `NOT_YET` list is the honest inventory of what is promised and not built:
  twenty-four keys today, every one naming its slice.

## Enforced by

- `test/reachability.test.js` — all four tests
- `.claude/skills/review-round/SKILL.md` — the Reachability section

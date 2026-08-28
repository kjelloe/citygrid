# Ruling 018 — The player palette is chosen by search, not by eye

- **Date:** 2026-08-28
- **Source:** `test/render.test.js`, implementing `gamedesign.md` §30
- **Status:** ruled

## Question

Sixteen player colours have to stay distinguishable under protanopia, deuteranopia and
tritanopia. How are they chosen?

## Ruling

**By search, scored on the worst pair.** Candidates are generated across hue, saturation and
lightness; sixteen are selected by greedy farthest-point search where the score of a pair is its
*minimum* separation across normal, protan, deutan and tritan vision simultaneously.

The result is committed as a constant, and `test/render.test.js` re-runs the simulation so a
"nicer" colour swapped in later cannot quietly break it.

## Why

The hand-picked palette failed on its first test: **seven pairs collapsed**, the worst at a
distance of 0.018 — colours that are simply the same colour to a large number of people. Picking
by eye cannot find this, because the person picking has the vision they have.

The search found a set whose worst pair is 0.18 — ten times the failure threshold — inside a
saturation and lightness band that still suits the game. Lightness does most of the work, because
lightness is the axis every deficiency preserves.

## Consequences

- Sixteen genuinely distinguishable colours still do not exist. This is why player identity is
  always **colour plus pattern plus label** (`gamedesign.md` §30). The palette makes the colour
  carry as much as a colour can, and no more.
- The same discipline applies to any future palette that has to separate things: run the search,
  pin the result, keep the test.
- The search script is throwaway; the test is not. The test is what holds the line.

## Enforced by

- `client/render/palette.js` — `PLAYER_COLOURS`
- `test/render.test.js` — "player colours stay distinguishable under colour-vision deficiency"

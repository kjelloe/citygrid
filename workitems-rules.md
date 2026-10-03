# rules — work items

*Written 2026-10-03 from P93, where Kjell answered thirteen open questions in one batch (A84–A93).
Four of those answers are engine rules rather than content, and every one of them **moves what the
deputy does**, which means every one of them moves every sweep number in the project. So they are
four items and four eras, run one at a time: two rules measured together are two rules nobody has
measured (P87's lesson, paid for once already).*

*The fifth and sixth answers are not here — the bridge (A84) is `workitems-world.md` **S13** and
steep ground (A87) is **S11**, because both are the renderer's.*

**What every item must keep:** `engine/` integer, pure, I/O-free, Lua-portable (ruling 004); a
hashed change is a two-file act and a re-pin through `/fixture-repin` with a reason; the deputy
places anything new or the soak never measures it; `sim` on a new era, with the previous era's
report quoted beside the new one; and **read `reports/balance-era*.md` before choosing any
threshold** — T7 guessed one and bankrupted every town with it.

## G1 — A network refuses a building (S) — A85 (Q116) — **BUILT 2026-10-03** as `slice-G1` (era 15)

*As built, and it was two rules rather than one. The refusal alone gave the deputy 169.9 refusals a
city and not one avenue — because the avenue is an UPGRADE of the busiest street, and that street
had houses standing on it. `lotFree`, which is `placeBuilding`'s counterpart for a lot nobody
placed, had never read the road layer: **90.9 of 295 buildings a city stood on the carriageway**,
for the life of the project, invisible to everything (the lot had road access by definition and the
tile hashed fine). Ruling 046 carries the three-arm measurement. The price is that third of every
city: 295 buildings to 238 on the eight-seed mean. The `founding` fixture's wire ran straight
through its coal plant and had to be rerouted — and the first reroute split the grid in two, which
the fixture's `expect` block caught and no hash would have.*

## G1 — A network refuses a building (S) — A85 (Q116)

**Goal.** One rule across four networks instead of three-and-a-half.

**Do.** `placeNetwork` refuses a tile carrying a `buildingId`, with `RESULT.NEEDS_BULLDOZE` — the
code it already has and the one `placeBuilding` gives in the other direction. Rail has refused it
since A66; road, wire and pipe have not. No bulldoze-and-charge: a drag-paint that demolishes forty
buildings is a worse surprise than a refusal, and the refusal names its reason.

**Tests first.** `test/build.test.js`: a road, a wire and a pipe over a park are each refused and
leave the tile untouched; rail's existing refusal is unchanged; a RUN that crosses one building is
refused whole, which is the transaction rule (an edit that fails at the last tile leaves the first
tiles alone).

**Gate.** `sim` on a new era. The deputy lays roads, so the sweep moves: quote the before and after
per configuration and say which way the deputy's own paving went.

**What G2 left here.** The deputy's carrier runs already never place a carrier on a building tile —
`connectToNetwork` treats a building tile as a wall unless it ALREADY carries the network, and the
path it issues skips every tile that does — so this refusal should not cost the deputy a single run.
If the sweep says otherwise, that is the finding: check `deputy.unconnected` first, because it is
the counter that says a run reached nothing.

## G2 — The deputy's carriers reach a live grid (S) — A86 (Q117) — **BUILT 2026-10-03** as `slice-G2` (era 14)

*As built, and it was three defects rather than one. The flag preference this item describes was the
smallest of them: the search also started at a lot's TOP-LEFT TILE, which for a 2x2 has two of the
lot's own tiles as its neighbours, so a station with a building on each of the other two sides
sealed itself in; and `findSpotFor` would choose a spot no carrier can ever arrive at, which seed
404 did twice with clinics inside a solid block of buildings. The thing worth carrying forward is
how all three hid: a carrier run that finds no route issues no command and earns no refusal, so
every one of them was silent. `deputy.unconnected` counts them now, and it is the assertion the
test leads with. Full measurement in the dev-log.*

## G2 — The deputy's carriers reach a live grid (S) — A86 (Q117)

**Goal.** Ten starved buildings a city, fixed everywhere rather than for the rail station.

**Do.** `connectToNetwork` prefers a carrier tile the supply pass has flagged satisfied — the
preference T2 added for the station alone (`FLAG_POWERED`) — for every building the deputy connects,
power and water. Where no satisfied carrier is in reach, the nearest one is still better than
nothing, so the fallback stays.

**Tests first.** `test/deputy.test.js`: on a seed whose grid is known to be split, every building
the deputy places ends the month supplied; `state.supply.power.components` falls and `starved` goes
to zero on a city it was non-zero on. **Measure the before**, in the test, so the number is a
difference rather than a claim.

**Gate.** `sim` on a new era, and `state.supply`'s component count printed beside the populations —
the thing that changed is the supply, and the population is a consequence.

## G3 — A park is worth living next to (M) — A88, A91 (Q119, Q123, Q127)

**Goal.** The oldest dead field in the catalogue becomes the rule it has always looked like.

**Do.** `landValuePass` adds `def.landValueBonus` over `def.radius`, falling off with distance the
way coverage does — park, marina, rail station, ferry terminal carry it today, and the city hall
gains one (A91) so that it is worth building for its own sake. Delete `storage` (water tower) and
`capacity` (hospital) from `data/buildings.json`, the mirror and `UNREAD_FIELDS`: a field that wants
a mechanism nobody is building is a promise, not a rule.

**Tests first.** `test/civic.test.js`: a park raises land value within its radius and not beyond it;
two parks do not stack past the cap; the three deleted-field entries leave `UNREAD_FIELDS` and the
list is then EMPTY, which is the assertion that matters. `test/coverage.test.js` already asserts the
amenity layers reach land value — this must not double-count them.

**Gate.** `sim` on a new era. Expect crime to fall again (A93) and land value to rise; say so before
running it, and check the direction rather than the magnitude.

## G4 — Decay rolls like growth (S) — A92 (Q124) — **BUILT 2026-10-03** as `slice-G4` (era 12)

*As built. One line in the decay branch and two numbers deleted. The measurement is in the dev-log;
the thing worth carrying forward is that the TEST was wrong before the rule was: a lot is only
scored when the scan cursor reaches its slice, so the calendar rate is one in
`scanSlices × decayOneIn` and not one in `decayOneIn`. The first cut asserted the second, read 3%
against an expected 17%, and would have been "fixed" by loosening the bound.*

## G4 — Decay rolls like growth (S) — A92 (Q124)

**Goal.** Decline stops being three times as fast as growth by accident.

**Do.** `developmentPass` rolls `chance(state.rng, development.decayOneIn)` before it decays a lot,
exactly as it rolls `growthOneIn` before it grows one. Delete `roadWeight` and `crowdingWeight`,
which `scoreLot` does not have and nobody misses.

**Tests first.** `test/development.test.js`: over a long run on a fixed seed, a lot below the decay
threshold loses condition about one month in `decayOneIn` rather than every month — assert the
RATE, not a single step, and plant the old behaviour to see it fire.

**Gate.** `sim` on a new era. This is the one most likely to move the sweep: slower decay means
more standing buildings, which means more demand satisfied and more population. If it moves more
than the others, that is the finding, not a problem.

## Order

**G4 → G2 → G1 → G3.** Decay first because it is the smallest change with the largest expected
move, and a sweep that measures it alone is worth having. Then the supply fix, which is a
correction rather than a tuning. Then the refusal, which changes the deputy's paving. Then land
value, which is new behaviour on top of a settled base.

Each is its own era and its own commit. **Four eras in a row is four sweeps**, about 40 minutes of
gate time; they are not combined, because A82 bought the ability to attribute a move to a rule and
combining them gives it straight back.

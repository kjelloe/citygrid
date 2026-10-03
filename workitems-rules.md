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

# The second round — P97 (A96–A105)

*Written 2026-10-03 from P97, where Kjell took every recommendation in one batch. Four of them are
**deputy changes** — a deputy change voids every sweep number in the project (CLAUDE.md), so they are
four items and four eras, one at a time, exactly as G1–G4 were. The order below is cheapest-first,
and the cheap ones are not eras at all.*

## H1 — The quest ladder asks for a city that happens (XS) — A102 (Q129) — **BUILT 2026-10-03**

*As built, and it was a rename as well as a retune: a quest whose id and whose text say "two
thousand" cannot ask for 1,500 without lying to the player in two languages. `city-of-two-thousand`
is `city-of-fifteen-hundred` and `city-of-five-thousand` is `city-of-three-thousand`, in the data,
both i18n catalogues and the quest's own gate. The test asserts the LADDER rather than the numbers:
the lowest rank-granting population is at or below the best configuration's median (a deputy city
reaches the airport) and the highest is above it (there is something left to play for), both read
from `reports/balance-era<N>.json` so they move when the simulation does.*

## H1 — The quest ladder asks for a city that happens (XS) — A102 (Q129)

**Goal.** A ladder somebody climbs.

**Do.** `city-of-two-thousand` asks for **1,500** and `city-of-five-thousand` for **3,000**, in
`data/quests.json`. The ranks they grant do not change (A103).

**Tests first.** `test/quests.test.js`: the thresholds are the ones a median city in the CURRENT era
reaches — assert against `reports/balance-era16.md`'s medians rather than against a literal, or this
goes stale the next time the sweep moves.

**Gate.** None of its own: it is content, and no sweep configuration runs quests. Say so.

## H2 — A park's two routes, written down (XS) — A98 (Q132) — **BUILT 2026-10-03**

*As built: `specs/gamedesign.md` §11's table carries the distinction with the measurement beside it.*

## H2 — A park's two routes, written down (XS) — A98 (Q132)

**Goal.** The distinction is a design statement, not a comment in `civic.js`.

**Do.** `specs/gamedesign.md` §11: the **layer** is how much amenity reaches a tile, which funding
buys and an unpowered building halves; the **bonus** is what a building is worth to its street, flat
and nothing at all when ruined. Measured: +33 and +21 in the same town.

**Gate.** `node --test test/docs.test.js`.

## H3 — The mayor plants parks and builds police stations (S) — A99 (Q133, Q111) — **BUILT 2026-10-03** as era 17

*As built, with the three arms the item asked for and two lessons from writing the test rather than
the rule. The RATION is counted the way the rule counts it — every building the deputy owns that is
not of the kind being rationed, grown lots included — and the first assertion counted only the
deputy's own placements, which read "13 parks for 48 buildings" and was the test measuring something
the rule does not do. And a ration cannot be asserted at the END of a run: a city that loses
buildings to fire and decay satisfies or breaks a ration it met when it bought them, so the
invariant is checked at every turn and the end-state assertion is about SCATTER instead (T6's
original objection to the park).*

*Both new rules use `(n + 1) * per <= others`; the fire station keeps `n * per < others` on purpose,
because a town wants a fire service from its first house and T7's bankruptcy came from a row that
cost a hundred a month, not two.*

## H3 — The mayor plants parks and builds police stations (S) — A99 (Q133, Q111)

**Goal.** Every balance number in this project is measured on a city that has both.

**Do.** `keepAmused` gains a park per `deputy.buildingsPerPark`; `keepCovered` gains a police station
per `deputy.buildingsPerPolice`. Read the era report before choosing either number — the fire station
is one per `buildingsPerStation` and that is the shape to copy.

**Tests first.** `test/cheap-rows.test.js`: a played city contains both, and neither is built before
the town is big enough to want it. **Measure the before**: zero parks and zero police stations today.

**Gate.** `sim` on a new era, and a **three-arm probe** — parks alone, police alone, both — so the
two are attributed separately. Expect crime to fall (police coverage, and parks through land value,
which is §11.3's path) and land value to rise.

## H4 — The deputy dezones what it paves (S) — A97 (Q131)

**Goal.** 639 of 1,646 zoned tiles a city stop being zoning that can never develop.

**Do.** After `buildBlock` lays its road, the tiles the road now occupies are dezoned (`CMD_DEZONE`
is the player's own command and the deputy pays for it). Crossing zoned land stays legal — B9
measured that refusing it halves the population.

**Tests first.** `test/deputy.test.js`: after a played run, no tile carries both a road and a zone.
Measure the before in the test message.

**Gate.** `sim` on a new era. Expect the move to be small — the tiles were already dead — and say so
before running it, because "small" is a prediction this can be wrong about.

## H5 — The deputy repairs a grid a disaster cut in two (S) — A96 (Q130)

**Goal.** A component that loses its producer stops being dark for the rest of the game.

**Do.** A deputy turn reads `state.supply`: if a building it owns is dark while the city has capacity
to spare, run one carrier from that building to a LIVE piece of grid — `connectToNetwork` with the
arguments it already takes (G2). One a turn, so a shattered grid is repaired over several months
rather than in one.

**Tests first.** `test/deputy.test.js`: cut a live grid in two in a played city, tick, and assert the
dark buildings come back. The G2 test's seed 808 is the natural fixture — it ends with 2 components
and one dark lot.

**Gate.** `sim` on a new era, with `power.components` and the dark-building counts beside the
populations (the columns G2 added).

## H6 — Ground too steep to build on is not zoned (M) — A100 (Q134)

**Goal.** `walkthrough 128 hilly` green, which is S11's done-when and the whole point of a `hilly`
map.

**Do.** The steep half of S11, which was never built: a tile whose local slope exceeds a limit is not
zonable, so the city is not on the cliff. It is `canZone`'s rule, which makes it the reducer's and
hashed — and worldgen stops being the only thing that decides what a map affords.

**Tests first.** `test/development.test.js`: a tile on a slope past the limit is refused with a result
code that says why; one inside it is not. `test/worldgen.test.js`: a `hilly` map still has enough
zonable ground to be a city — which is the number that decides the limit, and it comes from a
measurement, not from a guess.

**Gate.** `walkthrough 128 hilly` — green, and it joins the `render` set, which is what S11 could not
do. Plus `sim` on a new era: this changes what every map affords, so every number moves.

## H7 — The saturated fixture becomes a played city (M) — A105 (Q72)

**Goal.** Four gates stop measuring a mature city on 1,129 copies of one house.

**Do.** `tools/lib/saturated.mjs` plays the deputy rather than pushing `res` records into the array:
roads, zoning, power, water and forty years, which gives 294 buildings across five kinds and a real
commuter load. Keep the flat traffic seed as an option — it is right for a renderer measurement
(Q70) — and keep the recipe deterministic.

**Gate.** Every gate that uses the fixture moves: `budget_gate`, `lanes_dump`, `walkthrough`,
`passability` and the kits. Re-baseline all of them in the same commit and quote the before and
after; a fixture change that does not move a renderer number is a fixture change that did not land.

## H8 — Money means something (L) — A101 (Q118)

**Goal.** Any income term this project adds stops being decoration.

**Do.** Not a constant: an upkeep that SCALES with the city, or a demand on money the player must
meet. Two attempts at per-tile upkeep both bankrupted weak cities without touching rich ones (era 1
and era 0), so the shape has to be progressive — and the measurement that says it worked is the p25
city surviving while the p95 treasury stops climbing.

**Tests first.** `test/economy.test.js`: the new term is progressive — assert the ratio it takes from
a small city against a large one, not the absolute.

**Gate.** `sim` on a new era, reading the treasury quantiles rather than the population: p95 peak
treasury is the number era 1 logged as a debt and nothing has moved since.

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

## G3 — A park is worth living next to (M) — A88, A91 (Q119, Q123, Q127) — **BUILT 2026-10-03** as `slice-G3` (era 16)

*As built. `amenityValue()` in `civic.js` deposits `def.landValueBonus` over `def.radius` with
coverage's own falloff, a ruined building deposits nothing, the city hall gained 16 over radius 8,
and `storage` and `capacity` are gone — **`UNREAD_FIELDS` is empty for the first time in the
project**, which is the assertion that matters.
Two things worth carrying forward. **A88's premise was one era stale**: it said a park "today
contributes only through its negative pollution", which stopped being true when era 10 gave the park
a leisure layer that reaches land value — so a park now has two routes and somebody should say
whether it should (Q132). And **the sweep cannot see this rule**: the deputy builds three bonus
carriers a city and has never built a park (Q133), so era 16's gate is a null result with a
mechanism probe beside it — the same town, 40 seeds, with and without parks.*

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

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

# The third round — P99 (A106–A112) — **COMPLETE 2026-10-03**

*All four built. J1 and J2 are small slices, J3 and J4 are eras 22 and 23. Two of the four did not
land as written, and both times the measurement said so in one run: J3's "the same limit as `canZone`"
would have taken a played `hilly` city from 1,872 residents to 217 (a lot refuses ROUGHNESS, a road
refuses a CLIMB), and J2's "absorbed into the junction" read as "dropped", which leaves two junctions
with no way between them. The ratifications (A107, A110) and the re-scope (A111) are in the files
they belong to.*



*Written 2026-10-03 from P99, where Kjell took every recommendation on the seven questions the second
round raised. Two are ratifications with no code (A107's gate criterion, A110's lane point) and one
is a re-scope of a slice that has not started (A111 → `workitems-world.md` S13). The four that are
work are below, cheapest first; two of them are deputy-and-reducer changes and therefore two eras.*

## J1 — A zoning stroke knows what it will cost and why it will be refused (S) — A108 (Q136) — **BUILT 2026-10-03**

*As built, and it found a second thing on the way: `priceOnly` returned `tx.indices.length`, which is
the number of staged WRITES rather than tiles. A three-tile road quotes three road bits, three owners
and four reshaped neighbours, so the readout has said **"10 tiles" for a three-tile stroke since
slice 1.3** and nothing noticed, because nothing had ever compared the two numbers. Zoning's quote
stages a zone and an owner, which made it a factor of exactly two and visible. `tiles` means tiles
now.*

*`priceZone` lives in `development.js` beside the rule it prices, and `price()` delegates — a second
copy of era 20's slope refusal in `build-commands.js` would have been the client's rule rather than
the reducer's.*

## J1 — A zoning stroke knows what it will cost and why it will be refused (S) — A108 (Q136)

**Goal.** The ghost turns red before the click, not after it.

**Do.** `price(state, command, kind)` gains a `paintZone` path — the staging transaction already
exists, so it is the network path's shape — and the three zone tools lose their `priceKind: null`.
The hint comes from the RULE: `controller.js` already says that a UI check which refused here would
be inventing a rule nobody enforces.

**Tests first.** `test/build.test.js` or `test/development.test.js`: a quote for a zoning run over a
cliff carries `tooSteep` and the tiles it would have cost; a quote over clear ground carries the
cost and `ok`; and the quote never CHANGES the state, which is what `price` is for.

**Gate.** `ui_smoke` — the readout names the reason on the real page, which is where ruling 026's
standard lives.

## J2 — A block shorter than a car is part of its junction (S) — A109 (Q138) — **BUILT 2026-10-03**

*As built, and NOT by dropping the link, which was the first reading of "absorbed into the junction":
a corridor whose block link is not published leaves its two junctions with no way between them and a
hole in the graph. **The clearances give way instead**, in proportion, until the lane is a car long or
the corridor has nothing left — which is the physical truth of a street that short, because it IS
most of the junction. `lanes_dump`: links under 4.5 m went 4 of 7,694 to **0**, and the shortest link
2.00 m to 5.10 m.*

*The car's length is read from `vehicle-spec.js` (`LONGEST_BODY`, a van at 4.6 m) rather than written
into `lanes.js`, because the kit is where a van's length is decided and a second copy would be the
lane graph's own idea of a car.*

## J2 — A block shorter than a car is part of its junction (S) — A109 (Q138)

**Goal.** Every link in the lane graph can hold the car that drives on it.

**Do.** `client/world/lanes.js`: a `block` link shorter than `cars.length` is absorbed into the
junction at its end rather than published as a link of its own.

**Tests first.** `test/lanes.test.js`: a corridor shorter than a car yields no block link and the
turns either side still connect — the graph stays traversable, which is the thing that would quietly
break.

**Gate.** `lanes_dump`: "links under 4.5 m" reads 0 of about 7,700, and the share criterion the gate
re-aimed at H7 stays where it is.

## J3 — A road refuses the ground a lot refuses (M) — A112 (Q140) — **BUILT 2026-10-03** as era 22

*As built, and the rule is not the one the item described. "The same limit as `canZone`" was wrong
and the measurement said so in one run: a lot refuses ground too rough to STAND on — the max step to
any neighbour — and a road refuses a CLIMB too steep to drive, which is the step between consecutive
tiles of the run. A street along a contour has a gentle grade and a steep neighbour, so the lot's
test took a played `hilly` city from 1,872 residents to **217**.*

*The number came from the GATE that A112 named rather than from the ladder's best city: at 14 a hilly
city is 1,711 residents and `walkthrough 128 hilly` fails on one marginal cliff; at **12** it is 1,066
and the gate is **green for the first time in the project** — 0 cliffs against 25, 20 of 177 corridors
ungradeable against 218 of 612, steepest street 33.3% against 500%. `walkthrough_hilly` is in the
`render` set now, which is S11's own done-when.*

*One number worth keeping: a moderate limit beats **no limit at all** by a quarter (1,711 against
1,342 at 14), because a deputy that stops at the foot of a hill builds where the city can be served
instead of spending streets on ground that can never hold a lot.*

## J3 — A road refuses the ground a lot refuses (M) — A112 (Q140)

**Goal.** `walkthrough 128 hilly` green, which is the last piece of Q134 and S11's own done-when.

**Do.** `placeNetwork` refuses a tile whose slope passes `development.maxZoneSlope`, with
`RESULT.TOO_STEEP` — the same limit and the same code as `canZone` (era 20). The deputy skips those
tiles when it lays a block, the way it already skips them when it zones.

**Tests first.** `test/build.test.js`: a road, a wire and a pipe across a cliff are each refused and
leave the tile untouched; a run that crosses one is refused whole; and a slope AT the limit is still
pavable. `test/deputy.test.js`: a played `hilly` city has no corridor steeper than the limit.

**Gate.** `walkthrough 128 hilly` — and it joins the `render` set, which S11 could not do. Plus `sim`
on a new era: this changes what every map affords.

**Say it before running it:** `rolling` should not move at all (it has no slope past the limit) and
`hilly` should lose streets and gain nothing — the city is already off the cliff since era 20, so
this is about the roads that reach for it.

## J4 — Demanding's margin, re-cut against a real expense (M) — A106 (Q141) — **BUILT 2026-10-03** as era 23

*As built: 90/110 and the service cost doubled to 6/12/22/35. Demanding ends where it started — 1,566
residents against 1,544, a p25 treasury of 1,820k against 1,611k — with a real expense inside it,
while relaxed, steady and nodisasters pay the larger cost and give up another 5–8% of their
treasuries. Nobody dies anywhere. The lever's far end is measured too: 12/25/45/70 kills cities at
every squeeze tried, including 100/100, which is where this stops being a tuning question and starts
being a different economy.*

## J4 — Demanding's margin, re-cut against a real expense (M) — A106 (Q141)

**Goal.** The economy becomes tunable: a service cost worth having that demanding can survive.

**Do.** `difficulty.demanding.taxYieldPercent` and `upkeepPercent` are 80 and 120, set in era 1 when
a developed lot cost nothing to serve. Re-cut them, then raise `economy.serviceCostPerLevel` to the
rung the ladder already measured as worth having (6/12/22/35 halves the demanding surplus; 3/6/11/18
is what shipped because nine cities of two hundred died at the other).

**Tests first.** `test/economy.test.js`: the three difficulties order the same way they always did —
relaxed keeps more than steady keeps more than demanding — which is the invariant a re-cut could
quietly break.

**Gate.** `sim` on a new era, read on the TREASURY quantiles and the empty-city count rather than on
population: p25 treasury surviving and `cities that reached 100+ residents and ended empty` at zero
in every configuration is what says it worked.

**The ladder is already measured** (H8, eight cities a difficulty, and forty for the demanding rung),
so this slice starts from a table rather than from an experiment.

# The second round — P97 (A96–A105) — **COMPLETE 2026-10-03**

*All eight built: H1 and H2 are content and design, H3 to H6 and H8 are five eras (17, 18, 19, 20,
21), H7 is the fixture every renderer gate measures on. What the round cost in gate time is five
sweeps; what it bought is above each item. What it FOUND is the part worth reading — seven new
questions, every one of them measured: Q136 to Q141 and the three the played fixture turned up in an
afternoon.*



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

## H4 — The deputy dezones what it paves (S) — A97 (Q131) — **BUILT 2026-10-03** as era 18

*As built. The thing worth carrying forward is the REMAINDER: dezoning only in `buildBlock` took
seed 1003 from 591 zoned-and-paved tiles to **one**, and one is not a rounding error — it is a
caller nobody thought of. The rail station's access road and the ferry terminal's are
`connectToNetwork` runs, so the rule lives in a helper every road path calls. The dead `runCarrier()`
went in the same commit: no caller anywhere, superseded by the search, and it called `apply()`
directly rather than `issue()`, so it would not have counted its own refusals.*

## H4 — The deputy dezones what it paves (S) — A97 (Q131)

**Goal.** 639 of 1,646 zoned tiles a city stop being zoning that can never develop.

**Do.** After `buildBlock` lays its road, the tiles the road now occupies are dezoned (`CMD_DEZONE`
is the player's own command and the deputy pays for it). Crossing zoned land stays legal — B9
measured that refusing it halves the population.

**Tests first.** `test/deputy.test.js`: after a played run, no tile carries both a road and a zone.
Measure the before in the test message.

**Gate.** `sim` on a new era. Expect the move to be small — the tiles were already dead — and say so
before running it, because "small" is a prediction this can be wrong about.

## H5 — The deputy repairs a grid a disaster cut in two (S) — A96 (Q130) — **BUILT 2026-10-03** as era 19

*As built, and the two defects in the first cut are the thing worth carrying forward — both are G2's
shape wearing new clothes. It ran carriers out of the **coal plant**, two hundred and forty times,
because a producer standing on an under-capacity component is itself unlit and the loop had no reason
to skip it; and it **counted the turn as spent whether or not the run laid anything**, so the deputy
stopped doing everything else and the city it was repairing went from 84 dark to 211. A function that
can legitimately do nothing has to say so: `connectToNetwork` returns whether it laid a run now.*

*The guard that matters is "only when the city HAS the capacity" — a brown-out is a shortfall to
build out of, not a grid to re-stitch, and `keepSupplied` runs first for exactly that reason.*

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

## H6 — Ground too steep to build on is not zoned (M) — A100 (Q134) — **BUILT 2026-10-03** as era 20

*As built, and the gate it was given is not the gate it can have yet. `walkthrough 128 hilly` is
**unchanged** — 30 cliffs, 226 ungradeable of 1,458 — because `tools/lib/saturated.mjs` does not grow
its buildings from zoning at all: when development produces nothing it pushes 1,129 `res` records
straight into the array, on any tile, cliff or not. That is Q72, and it is **H7**. So H6's real gate
arrives with H7, and the measurement that stands in the meantime is a played city on `hilly`: 1,015
population with 505 zoned tiles before the rule, **1,872 with 334** after it — nearly twice the city,
because the zoning that goes down is zoning that can be reached and served. `rolling` is unmoved.*

*The deputy skips steep tiles when it zones rather than discovering the refusal: a zoning run is a
transaction, so one steep tile in a strip would refuse the whole block and a `hilly` deputy would zone
nothing at all.*

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

## H7 — The saturated fixture becomes a played city (M) — A105 (Q72) — **BUILT 2026-10-03**

*As built, at ONE mayor and twenty years rather than the four-and-forty the measurement proposed:
`lanes_dump` walks every point of every link and then runs three hundred steps of traffic over it, so
its cost follows the corridor count, and at four mayors it had not finished in thirteen minutes
against a 110 s baseline. One mayor gives 405 buildings of eighteen kinds, 2,881 residents and 1,243
corridors — the closest in SIZE to the fixture it replaces, which is what the gates were calibrated
on. More mayors are still available through `seats`.*

*It found four defects in one afternoon, which is the whole argument for the change, and none of them
is the fixture's: the **causeway** nobody designed (Q137 — the deputy paves over shallow water, ten
tiles a city, and the bank is a 0.72 m step that stopped the walker 939 times), a **block link too
short to hold a car** (Q138), a **turn's lane 0.38 m off the ground** where two streets meet at
different heights (Q139), and the two gate criteria that were a MAXIMUM over a sample that has now
grown tenfold (A89's lesson, re-applied).*

## H7 — The saturated fixture becomes a played city (M) — A105 (Q72)

**Goal.** Four gates stop measuring a mature city on 1,129 copies of one house.

**Do.** `tools/lib/saturated.mjs` plays the deputy rather than pushing `res` records into the array:
roads, zoning, power, water and forty years, which gives 294 buildings across five kinds and a real
commuter load. Keep the flat traffic seed as an option — it is right for a renderer measurement
(Q70) — and keep the recipe deterministic.

**Gate.** Every gate that uses the fixture moves: `budget_gate`, `lanes_dump`, `walkthrough`,
`passability` and the kits. Re-baseline all of them in the same commit and quote the before and
after; a fixture change that does not move a renderer number is a fixture change that did not land.

**The recipe is already measured** (2026-10-03, era 20), so the slice starts from a decision rather
than an experiment. Deputies on the fixture's own map, 40 years:

| map | seats | buildings | population | road tiles | commuters | kinds | time |
|---|---|---|---|---|---|---|---|
| 96 | 1 | 416 | 2,055 | 3,040 | 433 | 18 | 3.4 s |
| 96 | 4 | 642 | 6,173 | 4,916 | 781 | 18 | 5.5 s |
| **128** | **4** | **1,245** | **7,290** | **8,884** | **1,595** | **18** | **17.5 s** |

Against today's fixture on 128: 1,590 buildings of **one** kind, no commuters at all (the traffic
seed is a flat 200 on every road tile, Q70). So **four deputies on a 128 map for forty years** is the
recipe: the same order of buildings, eighteen kinds instead of one, and a commuter load the reducer
actually routed. It costs 17.5 s a gate run against about one second today — roughly two minutes
across the whole `all` set, which is the price of measuring a city instead of a monoculture.

**Two things to keep.** The flat traffic seed stays an option (Q70: a *load* is right for a renderer
measurement and reproducible, which a simulated one is not). And the rail line and its station are
placed the way they are now, because a fixture with no railway prices a renderer that has one — the
deputy builds one only past `railAtPopulation`, so a 4-seat city will have several, which is a
better fixture and a different one.

**And it unblocks H6's gate**: `walkthrough 128 hilly` cannot see the steep-ground rule while the
fixture pushes buildings onto any tile, cliff or not. Run it in this slice and quote it.

## H8 — Money means something (L) — A101 (Q118) — **BUILT 2026-10-03** as era 21

*As built, and the diagnosis was the work. Income ran **four times** expenses at every size and every
difficulty — a steady 25-year city took 20,268 a month and spent 5,048 — and the reason was that a
developed lot paid tax and cost nothing, while the only expenses were the civic buildings and a penny
a road tile. `economy.serviceCostPerLevel` is what a lot costs to serve, per level and per tile: it
scales with what the city has GROWN, which is what per-tile upkeep (rejected twice) did not.*

*The ladder is measured, and the measurement found something bigger than the sink: **demanding has no
margin.** At 6/12/22/35 nobody dies and the demanding treasury halves; one rung further, at
12/25/45/70, demanding goes from 1,644 residents to 163 while relaxed and steady barely notice. The
lever's useful range is bounded by a difficulty curve that was tuned when a lot cost nothing — Q141,
and the economy cannot be tuned further until it is answered.*

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

## L2 — The price of clearing ground (S, balance era) — Q155 → A133 — **BUILT 2026-10-08 as era 30**, with D8b folded in

*As built: `build.bulldoze` 1 → **5** in `data/balance.json` and the mirror in `engine/rules.js`,
which prices a bulldoze at **relaxed 3, steady 4, demanding 6** — the first time clearing ground has
cost anything at the default difficulty since slice 1.3. No other price in the table moves. Two
tests in `test/build.test.js`, both red before the change: a bulldoze is charged at every
difficulty (asserted as "more than nothing", not as a literal, because the base is balance data),
and what the tool quotes is what the player is charged, which is J1's one-code-path rule asked on
the difficulty where the quote used to agree with a free demolition.*

*And **D8b** (Q158 → A136) in the same era: `tools/lib/content.mjs` re-exports the server's adapter,
so `sim_sweep`, `soak`, `disaster_soak`, `traffic_gate` and the fixture runner load `data/` the way
the page and the server do — the quests above all, because `engine/quests.js` has no mirror and
every number this project ever measured came from a city in which no quest could fire. Quests pay
money and set `rank`, so this is a rule change too. `QUESTS=0` is the lever, and it is how the arms
below were measured.*

**The three arms, and the one re-pin.** The era report is `reports/balance-era30.md`, and the arms
are beside it as `balance-era30-arm-bulldoze` (the price alone) and `balance-era30-arm-quests` (the
quests alone), with era 29 as the null. A fixture re-pin names both changes at once, because
`questOffered` appears in `empty.json`'s eleventh tick the moment the catalogue is loaded — event
drift that is the feature, which is why the re-pin tool has to be told.

**What is NOT in this era, and is filed rather than forgotten:** the picture tools
(`tools/lib/aim.mjs`'s `playedCity`, and every `_shots` gate through it) still build quest-free
cities. Loading quests there moves every photograph in the project, which is its own slice with its
own re-shoot, and the item that asked for this one asked for the sweep.

## L2 — The price of clearing ground (S, balance era) — Q155, found in X3a — the item as written

**Goal.** A cost the rules declare is a cost somebody pays.

**Analysis.** `buildCost` is `idiv(base × buildCostPercent, 100)` and `bulldoze` is **1**, so:

| difficulty | `buildCostPercent` | a bulldoze costs |
| --- | --- | --- |
| relaxed | 70 | **0** |
| steady (the default) | 90 | **0** |
| demanding | 120 | 1 |

Clearing ground has been free on the default difficulty since slice 1.3, and nobody chose that.
Every other entry survives the scaling — `dezone` 2 → 1, `clearForest` 3 → 2, `road` 10 → 9 — so this
is the smallest value in the table being annihilated by a floor, not a tuning question. It was found
by an assertion in X3a that an approved request charges the requester "the demolition and the
compensation", where the demolition came to zero.

**Three answers, and a recommendation.**

1. **A floor of 1 where the base is non-zero** — `idiv` as it is, then `Math.max(1, …)`. Moves
   exactly one number at exactly two difficulties, which is the defect and nothing else. Same shape
   as the fix in [a rate applied to a tap is zero]: a price that exists must be payable.
2. **Round up instead of down** in `buildCost`. Honest arithmetic, and it moves `zone` (10 → 11 at
   steady), `dezone` (1 → 2), `clearForest` (2 → 3) and several others at once — a real balance era
   on a table nobody asked to change.
3. **Raise the base** to survive scaling (`bulldoze: 5`). Changes the feel of demolition at every
   difficulty, including demanding, where it is already priced.

**Recommended: (1).** It is the only one whose blast radius is the defect.

**Decided 2026-10-08 (A133): (3), `bulldoze: 5`.** Kjell chose the price over the floor — relaxed
3, steady 4, demanding 6, rounding unchanged, no other price moves. **And this era carries D8b
(A136): the tools load `data/quests/`** the way the page and the server do, so the sweep's two arms
are measured on a city with quests in it, the fixtures are re-pinned once with a reason naming both
changes, and the era report has a row for what the quests changed on their own (a third arm: quests
on, bulldoze 1).

**But it is still an era.** The deputy clears ruins (B1a) and dezones what it paves (H4), so a
bulldoze that costs money changes what it can afford in a turn — **a change to what the deputy
decides voids every sweep number** (CLAUDE.md). So: two arms of the 200-game sweep, the floor and
the null, the era bumped and the report naming the difference even if it is nothing.

**Tests first.** `test/build.test.js`: a bulldoze is charged at every difficulty, and the quote the
tool shows equals what the player is charged (one code path, J1's rule). `test/economy.test.js` if
clearing now shows up in the month's spend.
**Gate.** The `sim` set with both arms, and `reports/balance-era<N>.md` saying what moved.

**Done when** clearing ground costs something at every difficulty, the sweep has measured what that
did to the deputy's city, and the era says so.

## L1 — Borrowing (S, engine + one control) — A130 (Q153) — **BUILT 2026-10-05 as era 28**

Two commands (a debt you cannot pay down is a trap), a ceiling by rank, interest billed monthly and
floored at 1 so a small debt is not free (Q155's trap, avoided), `RESULT.AT_CEILING` with words in
both catalogues, `debt` on the player record through all four places with `SAVE_VERSION` 3 → 4 and
both fixtures re-pinned, and the drawer's three-step Borrow and Repay driven by `ui_smoke`. The
sweep is **identical to era 27 in all four arms** — the deputy never borrows, which is what makes
the instrument an instrument.

## L1 — Borrowing (S, engine + one control) — A130 (Q153) — the item as written

**Goal.** A city in trouble has a way out that costs something. `specs/gamedesign.md` §9.5 has
described it since the first draft and `CMD_TAKE_LOAN` has had a constant and no handler since the
first commit. Era 21 (H8) is what makes it matter: a developed lot now costs money to serve.

**Do.**
- `engine/economy.js`: `takeLoan { amount }` and `repayLoan { amount }` (a second command — a debt
  you cannot pay down is a trap, not a loan). A seat's `debt` is hashed state on the player record;
  the ceiling is a table by rank in `data/balance.json`; interest is billed monthly with the
  utilities at a rate in the same file; a seat at its ceiling that cannot pay the interest gets the
  existing bankruptcy warning one month earlier, not a new failure mode.
- The permission matrix gains both rows; `copyState` and the hashed-field list in both places;
  the fixtures re-pinned through `/fixture-repin` (a new field on the player record).
- The budget drawer gains the control: the debt, the ceiling, the monthly interest, Borrow and
  Repay in three steps like funding's (ruling 027: both catalogues; `reach_smoke`, `ui_smoke`).
- **The deputy never borrows** — it is the measurement instrument, and an instrument that can go
  into debt measures its own credit line. `test/deputy.test.js` asserts it.
- `takeLoan` leaves `NOT_BUILT` in `test/omissions.test.js`.

**Tests first.** `test/economy.test.js`: a loan raises the treasury and the debt by the same
amount; interest is integer and monotone in the debt; the ceiling refuses with `NO_FUNDS`'s
sibling (a new `RESULT`, with its words in both catalogues — a refusal needs words and a
warning); repaying more than is owed repays what is owed. **Gate.** the `sim` set on a new era:
the sweep's medians unmoved (the deputy does not borrow), `disaster_soak` green; `quick` for the
control.

**Order.** After W6's second half; any time before M7's merge is fine, and not in the same era as
B13.

## Order

**This lane is FINISHED, 2026-10-08.** L2 landed as era 30 with D8b folded into it; what follows is
the history.

**Where it stood an hour earlier.** G1–G5, H1–H8, J1–J4 and L1 are built, eras
12–28. The one thing left is **L2**, the price of clearing ground: `idiv(1 × 90, 100)` is 0, so a
bulldoze is free at two of the three difficulties.

**It is answered and scheduled.** Q155 → **A133: five, not the floor of one.** And **D8b folds into
the same era** (A136, `workitems-measurement.md`): `tools/` will load `data/quests/`, so the sweep
stops measuring a city where no quest can fire while a player's has 21. One era, **three arms** —
null, bulldoze 5, quests alone — so a moved number can be attributed to one of the two changes
rather than to both, which is what A82 bought and what combining eras gives straight back. One
fixture re-pin, naming both. The report is era 30.

**G4 → G2 → G1 → G3.** Decay first because it is the smallest change with the largest expected
move, and a sweep that measures it alone is worth having. Then the supply fix, which is a
correction rather than a tuning. Then the refusal, which changes the deputy's paving. Then land
value, which is new behaviour on top of a settled base.

Each is its own era and its own commit. **Four eras in a row is four sweeps**, about 40 minutes of
gate time; they are not combined, because A82 bought the ability to attribute a move to a rule and
combining them gives it straight back.

## G5 — The deputy seeks a crossing (M) — A121 (Q143) — **BUILT 2026-10-04** as era 26

*Built: `openTheCrossing` scans the town's own flooded tiles, spans up to `build.bridgeSpan` tiles of
water and lands on three tiles it may pave — but only where `deputy.bridgeNeedsRoom` free unzoned
tiles lie within `bridgeRoomReach` of the landing, because a crossing onto a rock is a crossing to
nowhere. `bridgeAtPopulation` 900 and `bridgeCap` 2 are the other two numbers, and the ladder that
chose them says the ROOM is the lever that matters.*

*What it is worth, and the reason this item exists: over twelve 64 `rolling` seeds the rule fires in
**two**; those two go **1,506 → 1,866** residents and the other ten are unchanged to the resident.
The 200-game sweep is flat (1,764 → 1,749 relaxed, and so on) because it averages a rare large
effect with ten zeroes. **The far bank is worth a quarter of a city where the town is hemmed in by
water, and nothing at all where it is not** — which is the question Q143 asked, answered by the
measurement taken where the rule fires rather than by the one taken everywhere.*

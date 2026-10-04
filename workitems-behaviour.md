# behaviour — work items

*Written 2026-09-10 from Kjell's P59: "realistic in simulation behaviour." The engine simulates
more than the world shows: buildings have a `level`, a `condition`, an `occupancy` and a
`builtTick`; tiles burn, are ruined, flood and lose their wires; fire stations, police and
hospitals cover the map; the commuter pass loads every road. Of all that, the renderer draws a
ruin as a grey slab at city zoom and nothing at all at street level, and the cars know only the
road's load. This lane makes the simulation visible in the world and gives the renderer-local
life — cars, people — behaviour that reads as a city rather than a screensaver. Everything here
is derived from `state` and renderer-local (ruling 037): **nothing in this lane touches
`engine/`, and no fixture hash moves.** Engine-side realism that would (road hierarchy, transit,
parking as state) is listed at the end as questions, not items. Same rules as
`workitems-cityviewer.md` §0.* *B9 (A81) is the exception: it is the deputy's, in `engine/`, and
it opened era 3.*

**Two invariants from D7, kept by test:** life fills and moves at a rate per second scaled by
`dt`, never per frame; and the population of cars and people is never a function of the camera.

## B10 — The pavement nobody is standing on (M) — **done 2026-10-04 as `slice-B10`**

`tools/crowd_probe.mjs` answered it in one run: not one posed person within eighty metres of a
walker on the high street, nearest **137 m**. The cause was not the drawing. `occupancy` is
RESIDENTS — the 22 shops, 50 works and 81 civic buildings on the film's own 96 have zero between
them — so `nav.js`'s `people: occupancy × perOccupant` asked for nobody outside any of them, and
`walks` keeps only edges with demand. `signals.js` had learned this at S3b for crossings and says so
in its own comment; this was the other reader.

`doorPull` prices a home by its residents, a shop and a works by their level (`ped.perShop` 3,
`ped.perWorks` 1) and a civic building by its own `pull` in `civic-spec.js` — every one of the 28
definitions says, and a test refuses one that does not. Afterwards: nearest **10 m**, 46 within
80 m, the street crowd at 108 of its 120 cap. `ped.clearance` (1.2 m) keeps the crowd out of the
lens, which the first picture after the fix asked for. `street_shots` counts people within 40 m of
the eye and fails at zero.

## B10 — The pavement nobody is standing on (M) — the item as written

**The reading.** F2's storyboard walks a high street with six shopfronts on it, at dusk and at
night, and there is **not one person in either frame**. The instruments disagree with the picture
and with each other: the STREET crowd is 0 of a cap of 120 (`stats.peds`, `pedsHeld`), the city
crowd reports 122 posed and 122 near in the same frame, and the frame painted magenta
(`?crowd=magenta`, E7's trick) has **0 magenta pixels of 230,400**. Counted, posed, and not where
the camera is looking.

**What is already known.** B7 put two crowds over one graph: a spread city crowd with its own cap,
and a near crowd filled towards each pavement's demand with `reserve: crowd.heldOn` so the two
cannot both fill the same shortfall. B7's own measurement had the near crowd at 6% of the people
once the spread crowd had settled — so a street crowd of 0 is that design working, and the people
on screen are supposed to be the city crowd's. The defect is therefore not "nobody spawned"; it is
**posed people that are not in front of the camera**, which is E7's defect shape one crowd along.

**Do — in this order, and stop when the picture changes.**
1. Instrument first, change nothing: a histogram of posed people by distance from the eye in street
   mode (E7's method, which is what found three placement defects the counts could not see), on the
   same played 96 the film uses. The question is whether the 122 are behind the camera, beyond the
   fog, under the ground, or at the wrong scale.
2. Ask what `pedsCityNear` is near TO. Under perspective at eye height the visible box stretches to
   the horizon; "near" measured against the box's centre is a hundred metres in front of the walker
   (A39's lesson, and `pedestrians.js` already carries the fix for its own crowd — `figureAt` and
   the spread order may not).
3. Check `figureAt`'s resolution rule at eye height: it picks a person from 50 px a tile and this
   figure from 30 (`RESOLVE.pedsCity`, B7). A street camera's tile pixels are large, so this should
   pick the fine model — if it picks nothing, the crowd is posed into a pool the frame plan then
   drops, which `pedsCityPosed` would still count.
4. Only then decide between: the near crowd's `reserve` should not let the spread crowd starve the
   pavement the player is standing on (a floor per edge within N metres of the eye), or the spread
   crowd's placement is right and its DRAWING is wrong.

**Tests first.** A pure test in `client/world/` or `client/life/` for whatever rule comes out of
step 4 — a floor, a near-edge demand, a resolution rule — asserted on the played fixture rather
than on a constructed one (the engine keeps shops at 0 occupants; a hand-made crowd proves
nothing).

**Gate.** `role_shots` and `street_shots` already photograph a street at eye height: both gain a
count of people **within 40 m of the eye** and fail at zero, which is the counter this defect hid
behind for the life of the project. The film's own frames 019–039 are the acceptance picture, and
somebody looks at them.

## B9 — The deputy lays roads near the town (S, engine) — A81 — **built 2026-09-14** (era 3, `deputy.roadReach`)

*As built: reach is `data/balance.json` `deputy.roadReach` (expand 4, the others 3), and a blocked
deputy hops to the town's fringe, fresh land two to `roadReach` tiles out. The hop is what keeps
the town growing; two "fresh land" rules tried on the way halved it (dev-log).*

**Goal.** A played city has an edge. The deputy paves only where the town is.

**Do.** In `engine/deputy.js`, a road cell is laid only within `ROAD_REACH` tiles (data, start at
3) of a lot that is built, or zoned and supplied with power and water; the grid the doctrine
plans stays the same shape, so it grows outward with the town instead of ahead of it. Nothing
is ever unpaved. The `expand` doctrine keeps a slightly longer reach than `hold the line`.
Schema unchanged; every played fixture and every soak city changes.

**Tests first.** `test/deputy.test.js`: after N years no road tile is further than `ROAD_REACH`
from a qualifying lot; a city still grows to within 10% of era 1's population on the sweep seeds.
**Gate.** The `sim` set on a new era (`reports/balance-era3.md` if T1's era 2 has not landed yet,
else its own row), `disaster_soak` green; `tools/compare_sheet.mjs` re-run — D4's finding 2, the
town with no edge, before and after in one image, and the dev-log says what the eye sees.

## B1 — Damage you can see (M) — **Q85 answered 2026-09-10 (A62), and it is bigger than a picture** — the engine half **built 2026-09-18** as `slice-B1a` (era 4)

*As built: `fire.unfoughtPercent/unfoughtSpread/unfoughtDamage` — a fire nobody fights spreads and
burns slowly instead of dying with its house — plus the two things that had to exist for "addressed"
to mean anything: the deputy builds a fire station per `deputy.buildingsPerStation` buildings (it
built none, ever, so no gate city in the project has had a fire service), and it clears the burnt
ground inside its town and zones it again (nothing had ever cleared a ruin). **The renderer half —
burning, ruined and wrecked drawn in the world — is below and is not built.**

Kjell: *"add fire that expands if not addressed by firedepartement, i.e not available or none
within range."* Q85 asked how restrained the fire should LOOK; the answer is about what it should
DO, so this item gains a sibling in the engine.

The mechanism exists — `engine/fire.js` spreads to four neighbours on a fuel roll and extinguishes
on odds derived from `fireRisk`, which already has station coverage subtracted. The behaviour does
not: measured on a played 64×64, a single ignition **peaked at four tiles alight and was out in
twenty-five ticks**. So it is a balance change, it moves no schema but it does move outcomes, and
**`disaster_soak` over 200 games is the instrument** — one ignition is an anecdote.

A warning from the measuring: the probe written for that number was wrong twice first, once by
assuming `FLAG_BURNING` rather than reading it (it is 4; 1 is `FLAG_POWERED`, so the first run
counted powered tiles and reported a third of the map alight) and once by comparing two cities that
were not the same city. Read the constant, and print the city beside the number.

## B1 — Damage you can see (M) — the renderer half **built 2026-09-18** as `slice-B1b` (`specs/engine/06-buildings-and-kit.md` §6.7)

*As built: burning (the wall pushed toward ember, and S6's smoke column, which had never drawn a
visible pixel — see §9.4b) and ruined (plots grouped from the burnt tiles, broken walls on the
outline, rubble, charred FLAT ground), at both zooms, from the TILE flags because a building record's
`flags` has never carried them (**Q108**). `tools/disaster_shot.mjs` is the gate. **Not in it:**
wrecked, storm wires and flood water, which have no state to read — **Q109**.*

**Goal.** Every disaster and every fire leaves a mark in the world for as long as the state says
it is there.

**Do.**
- **Burning** (`FLAG_BURNING`): the building's windows go orange-lit whatever the hour, a smoke
  column rises from it (S6's machinery), and the ink pass gets a warm tint on that lot. No
  particle fire — restrained (§9.4), and a flame that flickers is a thing that pulses.
- **Ruined** (`FLAG_RUINED`): at L2 the slab becomes a low blackened shell; at L3 the baker draws
  roofless walls to one storey, charred, with rubble on the plot, from the same footprint. It
  lasts until `clearRuin`.
- **Wrecked** (earthquake, storm, explosion events): the building kit's "damaged" state — a
  collapsed corner, a tilted roof — chosen by the building's hash so a street of wrecks is not
  one wreck repeated. Storm: the wire run it took down is drawn fallen (poles leaning, wire on the
  ground) until the tile's `NET_PRESENT` returns. Flood: the water surface rises over the flooded
  tiles by the shelf depth for the disaster's duration, and the walker cannot enter.
- The minimap and the overlay already know; this is the world catching up.

**Tests first.** `test/params.test.js`: `buildingParams` reads the flags and returns the damage
state; a burning building's `emissive` is set at noon. **Gate.** `disaster_soak` already fires
every kind; a new `tools/disaster_shot.mjs` fires each kind on the deputy city and shoots it
from the pavement — `reports/smoke-B1-<kind>.png`, six of them, looked at.

## B2 — Buildings that age (S) — **done 2026-09-11 as `slice-S1`, with S1**

**Goal.** A building shows its level, its condition, its occupancy and its age.

**Do.** All from fields the record already carries. **Level** already sets storeys; add the
facade grade (a level-1 house is clapboard, a level-3 one has the bay window and the second
chimney). **Condition** (0–100) tints the walls toward grime and boards a window or two below 40;
below 20 the lawn is overgrown and the fence leans. **Occupancy** sets the lit-window ratio at
night (S7) and the crowd demand at the door (E7 already). **Age** (`builtTick`): a building
younger than N ticks is a **construction site** — scaffold and a crane (S6) over a half-height
shell, then the finished kit. **Abandoned** (a decay event, zone NONE with a building) is boarded
and dark. Monotone and pure in `params.js`.

**Tests first.** `test/params.test.js`: the visual state is a pure function of the record; the
construction state ends at the tick the data names. **Gate.** `budget_gate` unchanged (states, not
new geometry, except the scaffold — count it); `reports/smoke-B2-{new,worn,abandoned}.png`.

**In:** `client/world/age.js` — `visualState(building, tick, capacity)` returning the phase, the
build progress, the grime, the boarded fraction, whether the garden has gone and the lit-window
share. Ten assertions in `test/age.test.js`, including the monotonicity: nothing about getting
older or emptier may make a building look better. Applied in `buildingParams`, so the instanced box
and the baked facade dirty and shrink by the same amount.

**Four things this turned up.**

- **A missing clock had to mean STANDING, not new.** With `tick` defaulting to 0 and `builtTick` 0,
  every building in the city became a 10%-height shell with a scaffold round it. The default fails
  safe in the other direction now, and a test pins it.
- **A baked chunk has to rebake when a building's picture changes** — and must not rebake because
  `condition` moved by one. `visualKey` is the quantised answer (five steps of progress, eight of
  grime, four of boarding, eight of lighting), salted into the chunk hash the way the territory
  overlay is.
- **A tenth of a two-storey building is under a metre.** The first shell read as a bump in the
  grass; the progress floor is a quarter, and the scaffold stands to the FINISHED height with the
  shell growing inside it, which is what a building site looks like.
- **Grime at 0.55 was near-black from the pavement.** 0.72, for the reason `a11y_smoke` exists:
  dirtying a city costs the overlays their readability, and the overlays are what a colour-blind
  player reads the city with (ruling 041).

## B3 — Service vehicles (M) — **built 2026-09-24** as `slice-B3a` (the kit) and `slice-B3b` (the vehicles)

*As built: `client/world/vehicle-spec.js` — three bodies (hatchback, saloon, van), a cabin set into
the body with glass on both flanks, and six-sided wheels; 100 triangles against the item's 120 and
the 76 it replaces. **The city-zoom pool keeps the two-box silhouette**, as the item asks: one pool
a body for each (`car{v}` and `car{v}_near`), chosen at 60 px a tile. That split is not a detail —
with the near kit in every pool the frame's ESTIMATE went 28% over what it drew and `budget_gate`
failed. **Not in it:** the fire engine, the police car and the truck, which are the same kit with a
body and a colour, and the planner they need. **Q110** is the car count the estimate over-counts.*

*B3b: `client/life/services.js` — a fire engine a fire (fires group into one call, B1a made them
spread), from the nearest station, along a Dijkstra route on the lane graph; a patrol a police
station, driving the worst crime it can REACH as a loop; vans spawned by the industry around a link
(`VAN_SHARE`, 12% anywhere and up to 57% on a factory street). `lanes_dump` counts them and
`tools/service_shots.mjs` photographs them. **Not in it:** ambulances (no hospital pressure asks for
one), and cars yielding to an engine — A45's mechanism is for junctions and an engine is not at
one. **Q111:** the deputy builds no police station, so a patrol exists only where a player puts a
station; the shot harness places one with `police=1`.*

**Amended 2026-09-13 (review after S5).** The item gains **a car kit** before the service
vehicles: from the pavement a car is two boxes and the least detailed thing in a frame that now
has chimneys, shutters and zebra bars. Three body types (hatchback, saloon, van) from one pure
`client/world/vehicle-spec.js`, with wheels as eight-sided drums, a glazed cabin in a dark tone,
and the lamps B4 already poses — within 120 triangles a car (76 today), and the L2 pool keeps its
two-box silhouette. The fire engine, the police car and the truck are then the same kit with a
body and a colour. Measure the car pool's triangles before and after in `budget_gate`'s car rows.

**Goal.** A fire is fought, a beat is walked, a factory ships.

**Do.** Three vehicle kinds in `client/life/`, each renderer-local and derived:
- **Fire engines**: from each fire station's door to the nearest burning tile, along the lane
  graph — the one place this lane builds a planner (Dijkstra on `lanes.js`, a handful of vehicles,
  once per new fire), lights on, and back when the tile stops burning. Cars yield to it (A45's
  yield mechanism, one more kind of point).
- **Police cars**: one per station, patrolling the highest-crime tiles in its coverage (`tiles.crime`,
  hashed state) as a loop, at the road's speed.
- **Trucks**: a third car variant, spawned in proportion to the industrial share of a link's
  tiles, slower, longer, and counted in the car cap.
- Ambulances are B3b if hospitals want them; nothing here without a station on the map.

**Tests first.** `test/services.test.js`: a burning tile with one station gets exactly one engine
and its route is on the lane graph; two burning tiles share the nearest; no engine without a fire;
the population invariant (D7) still holds with vehicles included. **Gate.** `lanes_dump` gains a
row (engines, patrols, trucks) on the deputy city with a fire lit; `budget_gate` car rows
re-baselined with the truck variant's triangles; `reports/smoke-B3-{engine,patrol,trucks}.png`.

## B4 — Traffic that reads as traffic (M) — **Q86 answered 2026-09-10 (A63)**

The hour is **shared within a game hour** once a room has more than one seat, rather than a free
per-client choice: *"same hour approx so not exact but within a game time hour."* Two players
describing the same street must not be describing different times of day. It stays a per-client
setting in singleplayer; in a room the clock is the server's, and "within an hour" is the tolerance
that keeps it from being one more thing to synchronise every frame. The hour scale on car density
stays — it is now scaling something both clients agree about.

## B4 — Traffic that reads as traffic (M) — **built 2026-09-12** (`specs/engine/09-life.md` §9.1b)

**Goal.** Cars come from somewhere and go somewhere, and the city has a rush hour.

**As built.** The hour is `client/world/rush.js` (0.4 / 1.0 / 1.3) on `targetFor`, under `jam`;
cars spawn at a door that is emitting at this hour (homes out in the morning, shops and works in
the evening) and turn in at one that is receiving, indicating for the last 20 m, with the link's
tail and the car nearest the end as the fallbacks; brake lights and indicators are two unlit pools
that ride the bodies. Doors change where, never how many — a street with lots settles within 10% of
the same street without. Three things found on the way, none of them the item's: the budget
ladder took the street-chunk rung once and then dropped every car at street level (ruling 019,
amended); a frozen city's indicators were stuck dark; and cars drive through each other inside a
junction, which predates B4 and the per-link invariant cannot see (**Q96**). Entering street mode
on a junction tile stands you in the crossing street's carriageway (**Q97**).

**Do.**
- **Doors**: a car appears out of a driveway (E5's path) or a bay and leaves into one, rather
  than materialising mid-link. The density control keeps the equilibrium (D7); this changes only
  where the spawn and despawn happen. Residential doors emit in the morning, commercial doors
  receive, and the reverse in the evening — the **hour** is the light cycle's phase (`phaseOf`),
  which is the player's own clock, so a night client and a day client show the same city at
  different hours (Q86 records the reading of ruling 037).
- **Rush hour**: the per-link target density is scaled by the hour — 0.4 at night, 1.0 by day,
  1.3 at the two rushes — on top of the engine's load. `lanes_dump` prints the settled count at
  each of the three presets.
- **Turn signals and brake lights**: two more emissive quads per car, from the car's own next
  link and acceleration — no state, a hash of nothing.
- **Give way and signals** (T1) unchanged.

**Tests first.** `test/cars.test.js`: the settled count at night is the day's × 0.4 within 5%;
a spawn is at a door or a bay, never mid-link; the D7 invariants hold. **Gate.** `budget_gate`'s
car rows re-baselined (two quads a car); `reports/smoke-B4-{morning,night}.png` of one street.

## B5 — People with somewhere to go (M) — Q62 (A48) — **built 2026-09-14** (`specs/engine/09-life.md` §9.3c)

**Goal.** The crowd has commuters, shoppers and sitters, not a hash walk.

**Do.** The role state machine A48 deferred: a person is a **commuter** (door → map edge or
another door, morning and evening by the hour), a **shopper** (between commercial doors, midday),
a **sitter** (a bench in a park or on a street, S5/S3) or a **crosser**; a search on `nav.js`
per person per journey, not per junction. The cap and the nearest-eye fill (E7) are unchanged.
The film lane's F2 keeps its pull — a specific person to a specific door for a shot — and gets it
from this.

**Tests first.** `test/pedestrians.test.js`: every role has a journey with a start and an end on
the graph; a shopper never enters a residential door; the population invariant holds. **Gate.**
`budget_gate`'s crowd row unchanged (same cap, same triangles); a histogram of role by hour in
`lanes_dump`; `reports/smoke-B5-{morning,noon}.png`.

## B6 — Weather (M) — plan.md §10 bonus 5, Q84 — **Kjell ruled 2026-09-10 (A61)**

**Renderer only, as this item already assumed** — and the coupling is now named rather than open:
*"may add a lightning storm starting a fire or a big downpour causing flood of sewer system. random
disasters."* That is a smaller thing than §10 bonus 5's continuous modifiers on solar output and
heating, and it reuses machinery that exists: weather **causes a disaster**, and `engine/disasters.js`
already knows how to fire one. Not this item; noted so the shape is not reinvented.

## B6 — Weather (M) — plan.md §10 bonus 5, Q84 — the OVERCAST hour **built 2026-09-24** as `slice-B6a`

*As built: a fourth preset beside day, sunset and night — a low flat key, a grey dome, the fog
closer in and `night` 0.25 so a few lamps come on — with its own ink grade (colour down, line
softened), a place in the settings' Time row in both catalogues, and a tenth of the `auto` cycle
taken out of the middle of the daylight. `ui_smoke` drives it (146 checks): choosing rain reaches
the renderer. **Not in it:** the falling streaks, the wet-road specular and the puddles. The streak
pool drew 1,140 instances the frame counted and no camera ever saw — **Q112** carries what was ruled
out — and a pool that draws nothing still gets priced, which is Q110's defect.*

***The streaks are in it since A115 (2026-10-03).*** A column of 700 around the camera, drawn on foot
and in photo mode only — at eighteen pixels a tile a raindrop is nothing, and what weather looks like
from the air is the flat light B6a already ships. The placement is a pure module (`client/world/
rain.js`) because every one of B6's defects, and three more of my own, were about WHERE the streaks
were: an even disc instead of a hash that walks in order, tile units instead of metres (twice), and a
crossed quad instead of a flat one. `rain_shots` reads back the first instance's MATRIX and how far
the nearest and furthest streaks are from the camera, because a count is what B6 had every time.
Still not in it: the wet-road specular and the puddles.*

**Goal.** A fourth hour: overcast and rain, in the renderer only, until the simulation wants it.

**Do.** A `rain` preset beside day, sunset and night: a lower key, a grey dome, wet roads (a
specular term on the ribbon, darker tone), rain streaks as an instanced pool near the eye that
falls at a rate per second and is culled beyond twenty metres, puddles as flat discs at the kerb
by hash, and the wind that S6's sway reads. Reduced motion stills the rain. The setting's Time row
gains it; `auto` visits it a tenth of the day. Coupling to the engine (solar output, fire risk,
floods) is Q84 and not here.

**Tests first.** `test/time-of-day.test.js`: the preset exists in both catalogues and the
governor's ladder can drop the rain pool (a rung). **Gate.** `budget_gate` gains a rain row;
`a11y_smoke` measures overlay contrast under rain; `reports/smoke-B6-{street,city}.png`.

## B7 — Cars and people, seen from the city camera (S) — P61 — **built 2026-09-12** (`specs/engine/09-life.md` §9.3b)

**As built.** A second crowd, spread over every pavement by demand and capped by `pedCapCity`
(Low 0, Medium 200, High 600), the same whatever the camera does; E7's crowd tops each pavement up
to its demand instead of doubling it. The figure is `client/world/figure.js`, twelve triangles,
drawn where the spot resolves 30 px a tile and swapped for E7's person from 50 — the same person on
the same stride. On the played city at 1920×1080: 570 of 600 posed at 20 tiles across, 167 at 40,
and from the air they read as ticks and dots of life on the pavements rather than figures, which is
what thirty pixels a tile buys. Found on the way: the frame plan cut the crowd at the TARGET's zoom
under perspective while the counter counted the foreground, so a shot printed 167 people nobody
drew; and the near crowd read the city crowd's count from before its refills and doubled it. And the budget gate's
territory check, flaky since B4, failed every run once the crowd was in the frame: the estimate could
price the ninth street chunk only while it was baked, so a still camera shed it, evicted it, asked
for it back and rebaked it every two seconds. A ceiling per view holds the refused count (ruling
019, amended).

*Kjell, 2026-09-11: "realistic in simulation behaviour i.e cars and people walking about." The
cars are visible from the air; the crowd is not. `RESOLVE.peds` is 50 px a tile, which on the
gate's 720 px canvas is never reached at city zoom and on the 4090 is reached only at `city 20t`;
the crowd is capped at 120 and spent nearest the eye, so from above a street with people on it is
a street with nobody on it.*

**Do.** A second person model for L2 — a 12-triangle faceted figure, never a billboard — in the
same pool discipline as the cars, with its own resolvability threshold (about 30 px a tile) and a
separate `pedCapCity` in the tier table (High: 600) spent across the visible pavements by demand
rather than nearest the eye; the L3 crowd stays as E7 built it. People at L2 walk the same nav
edges at the same rate, so a person the camera zooms in on does not change kind mid-stride. The
D7 invariants hold: a rate per second, never a function of the camera for *how many exist*, only
for *which are drawn*.

**Tests first.** `test/pedestrians.test.js`: the L2 pool is filled by demand across bounds, not by
distance to the eye; the count is the same under two camera positions. **Gate.** `budget_gate`'s
`city 20t` big-viewport row gains a people column; `reports/smoke-B7-{city20,city40}.png` with the
crowd painted magenta once (E7's trick) and then normal.

## B8 — Cars stop at a junction (S) — **Q96 → A74**, Kjell 2026-09-12 — **built 2026-09-12** (`specs/engine/09-life.md` §9.1c)

**As built.** Lanes keep their offset through the box (the connector's control point was the
node's centre, so oncoming straights passed 2.00 m apart with 2.2 m cars); a conflict table per
junction; a box rule that lets a car in only when nothing crossing it is in the box and there is
room beyond, with patience and a queue-in after 6 s; and a gridlock broken by taking the
longest-held car off the road after 20 s, counted, never by an overlap. Played city: 0 overlapping
bodies in a box, 12–19 cars cleared in two minutes. `lanes_dump`'s overlap row is a gate.

*"Cars have to stop and not drive through."* Measured in B4: 7 pairs of cars under 2 m apart
inside junction boxes on the 64-tile played city before B4, 16 at the morning rush after; 58 of 78
on the 96-tile city (`lanes_dump`'s `overlaps` row). Every one is two TURN links crossing one box;
the per-link invariant has never been able to see it.

**Do.** A conflict table per junction, derived once with the lane graph: for each turn link, the
turn links whose paths cross it within a car's width. A car may enter a turn link only while no
car occupies one that crosses it, and holds at the stop line otherwise — T1's give-way already does
this for the stem of a T; this is every other pair, including opposing left turns under the same
green. Ties go to the link that has waited longest, so two queues cannot deadlock.

**Tests first.** `test/cars.test.js`: two turn links that cross are never both occupied, at an X
and at a signalled T, over a long run; the settled count at a busy X is within 20% of today's (a
junction that clears slower is expected, one that locks is not); no car waits for ever. **Gate.**
`lanes_dump`'s `overlaps` row reaches 0 in a junction and becomes a gate; D7's settled rows
re-baselined; `smoke-B4-morning.png` re-taken.

## B11 — Life survives a build (M) — with W6's second half

**Goal.** Laying a road does not restart the city. Today every accepted build action throws away
every car, person, train, boat and aircraft and settles them again, because their link and edge
ids are array indices that a rebuild renumbers (W6's measurement). A player sees the traffic
blink; in a room they would see it blink every time anybody builds.

**Do.** This is item 3 of W6 (`workitems-worker.md`), named here because it is behaviour: once
corridors, lanes and nav edges have stable keys, each life system re-seats its entities by key —
a car whose link still exists keeps its place and speed, one whose link is gone leaves by the
nearest door — instead of being recreated. D7's invariants hold: the settled count before and
after a one-tile build is the same within 2%.

**Tests first.** `test/cars.test.js`, `test/pedestrians.test.js`: after a build that touches one
corridor, every entity not on it is where it was. **Gate.** `lanes_dump` settles, builds one tile,
and reports how many cars moved; `play_smoke` builds a road and the car count on screen does not
drop to zero.

## B12 — The rest of the emergency services (S)

**Goal.** B3b's siblings: an ambulance from a hospital to a tile whose `healthRisk` crosses a
threshold (the engine layer exists), and **cars pull over for a vehicle with its lights on** — the
yield mechanism A45 built, with the engine, the patrol and the ambulance as its points. One
planner call per dispatch, as B3 does.

**Tests first.** `test/services.test.js`: an ambulance exists only while a qualifying tile and a
hospital do; a car ahead of an engine stops at the kerb side and resumes. **Gate.** `service_shots`.

## B13 — Weather causes disasters (M, engine) — A61

**Goal.** Kjell's ruling at P60: lightning starts a fire and a downpour floods the sewer. The
overcast hour is a picture today (B6a); this makes it a cause.

**Do.** In `engine/disasters.js`, two triggers that reuse what exists: a **storm** disaster may
ignite one tile through `igniteAt` (fire then spreads and is fought as any fire is, A62), and a
**downpour** floods tiles whose pipe network is over capacity, for a few ticks. Both are rolls on
the disaster schedule, behind the `disasters` option, with a warning phase like the others. The
renderer shows the rain preset while one is warned or active (the room's hour applies, A63). A
`sim` change: its own era, `disaster_soak` green, no unrepairable cities.

**Tests first.** `test/disasters.test.js`: a storm with fire cover in range burns less than one
without; a downpour floods only over-capacity pipes; neither fires with disasters off.

## Noted, not items — engine-side realism (each a question, each moves the hash)

**The avenue is now a yes (Q83 → A60, 2026-09-10).** Kjell: *"yes add second road kind."* It stays
out of this lane and becomes **its own lane after this one**: a command, a layer bit, a catalogue
entry, a fixture re-pin through `/fixture-repin` and a re-baseline of every gate that counts
capacity. The renderer half — ribbon width, lane count, markings — is about a day of it.


- **Road hierarchy** (Q83): one road kind, one width, one capacity. A second kind (avenue: two
  lanes each way, higher capacity, a median) is a command, a layer bit, a catalogue entry and a
  fixture re-pin. The renderer half is easy once the data exists.
- **Transit**: no buses or rail in the engine; a bus is a route, a stop and a capacity, all state.
- **Parking as state**: the renderer can pretend (B4); a parking lot that takes land is state.
- **One-way streets and turn restrictions**: lane-graph flags that the engine would have to own.

## Order

**After the review of 2026-10-04: B11 (with W6) → B12 → B13.** Everything above B11 is built.

B2 (done) → B4 (done) → B7 (done) → B8 (done) → **next behaviour item right after the world lane's S1b** (P63: "realistic in simulation behaviour" — the cars and the crowd are what a player sees move) → B5 → **B9** → B1 → B3 → B6, interleaved with `workitems-world.md` — the cars and the crowd
moved up on 2026-09-11 because P61 asked for them by name —: B2 with S1 (the same kit
files), B1 with S6 (the smoke), B5 after S5 (the benches). Weather last because it is the only
item that adds a whole preset to every gate.

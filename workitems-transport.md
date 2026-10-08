# transport — work items

*Written 2026-09-11 from `specs/transport-and-landmarks.md` (P61) after Kjell accepted all six of
its questions (P62, A65–A70). This is the first lane since cityviewer that **moves the hash**: two
tile layers (avenue and rail), new commands, new catalogue entries, new demand terms. Every engine
item here therefore runs the `sim` set (`disaster_soak`, `traffic_gate`, `sim_sweep`) and opens a
balance era; every renderer item runs `render` and re-measures its budget. Same rules as
`workitems-cityviewer.md` §0 plus CLAUDE.md's determinism machinery: a hashed change is a
two-file act and a re-pin through `/fixture-repin` with a reason, never a regeneration to green.
Do it **after `workitems-behaviour.md`**, and read the study first — the reasoning is there, not
repeated here.*

**What every item must keep:** `engine/` integer, pure, I/O-free, Lua-portable (ruling 004); the
deputy places every new building (plan §10 bonus 1) or the soak never measures it; life stays
renderer-local (ruling 037); the permission matrix gains a row per command; every new string has
both catalogue entries and a screen (ruling 027); the inspector says why a dead gate is dead.

## T1 — The avenue (L) — A60 — **BUILT 2026-09-24**: `slice-T1a` (engine, era 5), `slice-T1b` (picture)

*As built: `NET_AVENUE` on the road layer (a `u8`, so 64 and 128 are still free), carried through
`reshape` — a kind bit that is not carried vanishes the moment a neighbour is laid. `CMD_PLACE_ROAD`
takes `kind`, an unknown kind is refused rather than built as a road, and an avenue laid over a road
UPGRADES it for the avenue's price (the gesture a player reaches for). `traffic.avenueCapacity` 2,
and the commuter sweep is a dial rather than a FIFO so `avenueStep` 2 against `roadStep` 3 makes the
field prefer one. The deputy widens its busiest street once the town passes
`deputy.avenueAtPopulation` — its first cut laid a NEW avenue at the town's edge, where four played
cities gave it a mean load of exactly zero.*

*T1b as built: `road.avenue` in `data/cityviewer.json` — 14 m of carriageway, a 2 m median, two
lanes a side — and a corridor that carries its own cross-section rather than reading the config.
A run that changes kind mid-street becomes TWO corridors with a `seam` node between them, because a
corridor has one width from end to end; the lane graph tapers across the seam rather than stepping
sideways, and at a junction the kerbside lane turns right and the inner one turns left. The L3
ribbon gains a kerbed median, a dashed lane line and a continuous edge line per side; L2's straight
is two dashes at the median's edges.*

*And the tool, which the item did not ask for and ruling 026 does: `TOOLS.avenue` is
`CMD_PLACE_ROAD` with `kind: "avenue"` — one command, one permission row, two buttons — quoted at
`build.avenue`, with a `tool.avenue` catalogue entry and an inspector row that names the kind.
Until T1b only the deputy could widen a street.*

*What a global width cost: `enterStreet`, the nav graph's pavements, the lamp offset, the junction
bollards, the signal heads, the crossing bars, the stop-line length, the ground's flatten and the
kerbside trim all measured from `cfg.road.width`, and every one of them put something in an
avenue's carriageway. See the memory `one-width-assumed-everywhere`.*

*Not in it: a shop's parking bays still measure from the config's pavement edge, so bays on an
avenue collapse to a quarter of a metre (Q114); the minimap draws an avenue as a road (Q115).*

**Goal.** A second road kind: two lanes each way, a median, higher capacity.

**Do.**
- `tiles.road` gains a **kind bit** above the present bit (or a second layer if the mask needs all
  eight bits — decide by reading `network.js`, and say which). `placeRoad` takes `kind`; the
  catalogue of prices gains `avenue`; bulldoze, auto-connect and the 16-shape rule are unchanged.
- `engine/traffic.js`: capacity per tile by kind (`road.capacity` × an avenue factor from
  `data/balance.json`); the commuter field prefers avenues by weighting the sweep (an avenue tile
  costs less to cross), so a grid with one avenue routes onto it.
- The deputy lays an avenue for its first trunk road once the city passes a size.
- Renderer: `corridors.js` reads the kind; the ribbon is wider with a median strip and two
  centre lines per side; `lanes.js` makes two lanes each way; the L2 painted road and the
  markings follow. `road.width` becomes per kind in `data/cityviewer.json`.
- **Fixture re-pin, once, together with T2** — `/fixture-repin` with the reason naming both.

**Tests first.** `test/traffic.test.js` (the engine's): an avenue carries twice a road's load
before congestion; the field routes onto it. `test/permissions.test.js`: the command × ownership ×
mode row (there is no such file — the matrix lives in `test/build.test.js`, and since the avenue is
`CMD_PLACE_ROAD` with a kind it needs no new row; `test/avenue.test.js` asserts the rule against a
road's own answer instead of a second copy of it). `test/lanes.test.js`: two lanes each way on an avenue corridor. **Gate.** `sim` set on a
new era (`reports/balance-era2.md`); `traffic_gate 200 25` re-baselined and the dev-log carries
both; `render` set; `reports/smoke-T1-{avenue,junction}.png` from the pavement and from `city 20t`.

*As gated: T1a ran `sim` on era 5 (`reports/balance-era5.md`) and the engine's tests live in
`test/avenue.test.js` rather than `test/traffic.test.js`. T1b ran `render` (56 s), `budget` (235 s),
`quick` (401 s) and a new `avenue_shots` gate in the `shots` set — three pictures, each counting the
avenue corridors, the two-lane links and the baked chunk before it is called an avenue. The city-20
frame was dropped: at that zoom the median is under a pixel and the shot proved nothing. What reads
is the oblique at span 8, which is the camera's floor (`shot-camera-limits`).*

## T2 — Rail and the station, in the engine (L) — A65, A66 — **BUILT 2026-09-25** as `slice-T2` (era 6)

*As built. `tiles.rail` is the fourth tile layer (appending is safe; the hash moved, and this is the
re-pin T1 and A79 were bundled into). `CMD_PLACE_RAIL` with runs, a permission row, the rail price
and 2 a tile of upkeep. A rail tile shares a road tile — that is a level crossing — and is the only
network refused over a BUILDING; road, wire and pipe may still be laid through one (Q116).*

*`railStation`, 3×2, category `transport`, `gate: "rail"`. `needsRail` is its only placement rule:
power and road access are reasons it is DEAD, not reasons it cannot be built, which is what lets
the inspector say which of the three it is. `engine/gates.js` holds all of it — `railReach` floods
the layer inward from EVERY edge tile at once so the cost does not grow with the number of
stations, and nothing about liveness, terms or fares is stored.*

*The Outside (A65): `gate.rail`'s integer terms go into `computeDemand` BEFORE the elasticity and
the cap, so they are worth less on `demanding` and obey the same ceiling as everything else. A live
gate seeds the commuter field like a workplace. The fare is per resident within `range`, billed in
`budgetFor` beside the taxes.*

*The deputy lays a straight line to the nearest edge past `deputy.railAtPopulation` and puts a
station on it — rail first, because `needsRail` refuses a station with no line to stand on — then
wire, pipe and a road. Its wire goes to a LIVE piece of grid rather than the nearest carrier: the
first cut connected the station to a dead stub and every station the deputy built was unpowered
(Q117).*

*And the controls, which the item did not ask for and ruling 026 does: a railway tool, a
`transport` build category, the station's button, the inspector's line row and gate row, and the
L2 line itself — drawn as a joined run like wire and pipe, because a tool a player uses and sees
nothing from is not a feature. **T3 must gate that pass on `drawn`** the moment the chunk baker
lays track.*

## T2 — Rail and the station, in the engine (L) — A65, A66 — the item as written

**Amended 2026-09-13 (A79).** The re-pin this item shares with T1 carries a third change:
**worldgen places rock and marsh** — a lower rock threshold on `hilly` maps (`rockyPeaks`) and a
marsh band where the shallow-water shelf is widest, in `engine/terrain.js`. `test/worldgen.test.js`:
a `hilly` seed has rock tiles, a `river` seed has marsh at its widest shelf, `rolling` at the default
seed is unchanged in its buildable count within 2%. The fairness sweep re-runs with the era,
because both are unbuildable ground. S2's stones and reeds then appear without a renderer change.

**Goal.** A player draws a line to the edge, builds a station on it, and people arrive.

**Do.**
- `tiles.rail`: mask plus present bit (`engine/network.js`'s third kind), `placeRail` with runs,
  a permission row, bulldoze, cost 20 and upkeep 2 a tile (the reference's numbers as the era's
  first guess), a rail tile may share a road tile (level crossing) and never a building.
- `railStation` in `data/buildings.json`: 3×2, category `transport`, `gate: "rail"`, power, road
  access, must touch a rail tile. **Live** when a flood over `tiles.rail` from the station reaches
  an edge tile — derived on each rail edit, not stored. Land-value radius like a park.
- The Outside (A65): per live gate, integer demand terms (`residential`, `commercial`,
  `industrial`) from `data/balance.json`; the gate's tiles seed the commuter field as a sink with
  capacity; a monthly fare per resident within range, billed with the utilities.
- The deputy: a doctrine row that lays rail to the nearest edge and places a station once the
  city passes a size; `expand` does it early, `hold the line` never.
- Inspector rows: live or dead and why (no line to the edge, unpowered, no road).

**Tests first.** `test/rail.test.js`: a line that reaches the edge makes the station live and one
that does not leaves it dead; the demand terms appear only when live; `copyState` copies the
layer; the hash changes when a rail tile is laid and not when a train is drawn (there is no train
in the engine). `test/permissions.test.js`: the row. `test/fixture.test.js`: re-pinned with T1.
**Gate.** `sim` set on the new era; `disaster_soak` green with stations placed by the deputy;
`traffic_gate` shows load on the roads to the station.

## T3 — Rail drawn (M) — **BUILT 2026-09-26** as `slice-T3`

*As built. `deriveCorridors(state, "rail")` — the same machinery the road uses, with its own
cross-section from `rail` in `data/cityviewer.json` and no pavement, derived beside the road network
in `model.js` and read by nothing else. `client/render/rails-l3.js` bakes the bed, its face, the
sleepers and two rails in a phase of its own, so A78's check times it. A level crossing is a bar of
paint across the road on each side of the track with a post at each end — not a boom, because a boom
that never moves is worse than none and one that does is a state machine the renderer has no
business running (ruling 037).*

*`client/life/train.js`: one train a line, an arc length and a sign rather than a second lane graph.
It arrives, stops at the platform — the projection of the station onto the track — waits `dwell`,
runs to the far end, turns round out of sight and comes back. Timed by the caller, frozen by
`?life=0`, and all of it asserted in node (`test/train.test.js`), because the only other instrument
is a screenshot of something moving.*

*The station kit is its `CIVIC_SHAPES.railStation` masses, which `building-kit.js` already bakes at
L3 — a hall with a clock, a platform and a canopy. A second kit would be a second copy of the
L2/L3 agreement (E5). The bridge is the causeway the ground module already builds under any network
over water; nothing in T3 needed to add one.*

*Not in it: the ground does NOT flatten under a line — grading is keyed to the road network — so a
track over a hill follows the hill (Q120).*

## T3 — Rail drawn (M) — the item as written

**Goal.** Track, crossings, a bridge, a train and a station kit.

**Do.** A fourth corridor kind `rail` in `client/world/corridors.js` (narrower width); the ribbon
builder draws two rails and sleepers; a level crossing where it shares a road tile (barriers, a bar
marking); a deck over water (S4's bridge); the station kit through the baker (platform, canopy,
footbridge, clock). A **train** in `client/life/train.js`: a single-track lane along the corridor,
two or three carriages, in from the edge, a stop at the platform, out again — one per line, a rate
per second (D7), frozen by `?life=0`. Passengers at the platform are B5's role.

**Tests first.** `test/corridors.test.js`: a rail corridor from a rail mask; `test/train.test.js`:
the train stops at the platform and leaves by the edge; the D7 invariants. **Gate.** `render` set;
`budget_gate` re-measured with a station and a line in the fixture (the saturated recipe gains
one); `reports/smoke-T3-{station,crossing,train}.png`.

*As gated: the corridor tests went into `test/world.test.js`, which owns corridors — a second file
called `corridors.test.js` is the name-that-means-two-things trap `workitems-cityviewer.md` §0
warns about. `tools/rail_shots.mjs` is in the `shots` set and counts the carriages POSED before it
calls a frame a train.*

## T4 — Water bodies, the marina, the ferry and the port — A67, A68 — **BUILT 2026-09-26**: `slice-T4a` (engine, era 7) and `slice-T4b` (the water)

*T4b as built. `client/world/water.js` grew the renderer's own copy of the bodies (ruling 037 — it
may not import `engine/`) plus `ringOf`, which is how far a tile is from a shore and therefore what
"open water" means. `client/life/boats.js` holds all three kinds, because they are the same
arithmetic: moored at a marina, sailing on a body, or plying a route. A hull looks a boat's LENGTH
ahead before it moves, so it turns before its bow is on the beach rather than when its middle is.*

*A vessel's route is a breadth-first walk over the water, not a straight line. The first cut was a
line and refused any terminal whose crossing met a headland — a limitation nobody asked for, since
a real ferry follows the channel, and one that made the freight port's own gate picture impossible.*

*Three pools (`boat`, `ferry`, `wake`), all three priced in `lod.js` the moment they existed, which
is what P81's round asked for. The wake is eight flat quads scaled per instance rather than a
ribbon rebuilt every frame for three metres of foam.*

*`shoot.html` gained `placeAt=<def>@x,y`: `place=` lines buildings up beside its own road across the
middle of the map, which cannot photograph a thing that has to stand on a shore.*

## T4 — Water bodies, the marina, the ferry and the port — A67, A68 — the ENGINE half **built 2026-09-26** as `slice-T4a` (era 7)

*As built. `waterBodies(state)` in `engine/terrain.js` floods the water layer — deep AND shallow,
so a lake is one body rather than a ring of ponds round its own shelf — and gives each body a size
and whether it reaches a map edge. `bodyAt` answers which body a footprint's RING touches, which is
what "on the water" means for a building that stands on the shore. Derived on every ask, stored
nowhere.*

*Three buildings. `needsBody` is a placement rule — how many tiles of ONE body the footprint stands
beside — and it is the only one: whether that water leads out of the region is a reason a gate is
DEAD, not a reason it cannot be built, so a player may put a terminal on a lake and the inspector
says `gate.noSea`. `marina` is `amenity`; `ferryTerminal` and `freightPort` are `sea` gates on T2's
machinery, and the sea's terms are the freight-heavy ones (260 industrial against 90 residential).*

*The deputy builds a marina on any big enough body and a terminal only on one that reaches an edge —
`findSpotFor` refuses the rest — and connects both to a LIVE piece of grid with a road run after
them.*

*Not in it: the boats, the ferry, the wake, the kits and `reports/smoke-T4-*`. That is T4b. Nor the
build menu's greying of a sea gate on a `lakes` map: a gate on a lake is a legal thing to build and
the UI has no business refusing what the reducer allows (ruling 026's sibling). The inspector row
is the warning, and T4b can put it in front of the money.*

## T4 — Water bodies, the marina, the ferry and the port (M engine, M renderer) — A67, A68

**Goal.** A lake is a lake, a shore can hold a harbour, and a body that touches the edge brings
people and freight.

**Do.**
- `waterBodies(state)` in `engine/terrain.js`: a flood fill over water tiles giving each body a
  size and whether it touches an edge; mirrored for the renderer. Derived, never stored.
- `marina`, 2×2 on a shore tile of a body of at least `MARINA_MIN_BODY` tiles, category
  `amenity`: a land-value radius larger than a park's and a visitor term (commercial). The
  leisure coverage comes in T6.
- `ferryTerminal`, 2×2 on the shore of a body touching an edge (or, in a room, one another seat's
  terminal is on), `gate: "sea"`: residential and commercial terms, a commuter sink, a fare.
  `freightPort`, 3×2, `gate: "sea"`, an industrial term. The inspector says why a terminal on a
  lake is dead before the money is spent; the build menu greys it on a `lakes` map.
- The deputy places a marina when a body is large enough and a terminal when one touches an edge.
- Renderer: moored sailboats at the marina (instanced by slot), two or three sailing on the body
  (a hash walk over water tiles at least two from a shore, a rate per second), one ferry on a route
  terminal → edge and back with a wake ribbon, a cargo ship for the port; marina, terminal and
  port kits through the baker.

**Tests first.** `test/water-bodies.test.js`: a river touches two edges, a lake none, sizes are
counted; a marina on a pond is refused; a terminal on a lake is dead. `test/boats.test.js`: a boat
never crosses a shore; the ferry reaches the edge; D7 invariants. **Gate.** `sim` set; `render`
set; `reports/smoke-T4-{marina,ferry,port}.png` from the shore at eye height.

*As gated (T4a): `test/water-bodies.test.js` is 10 green and `test/deputy.test.js` gained two; the
`sim` set ran on era 7 (`reports/balance-era7.md`) — 597 s of 900. `render` and the shots are
T4b's, because nothing T4a built is drawn differently yet.*

*As gated (T4b): `test/boats.test.js` is 10 green, including the one that matters — a boat sails a
bay with a headland for ten minutes and is on water at every sample. `tools/harbour_shots.mjs` is a
gate of its own and counts the hulls POSED, not the boats that exist. The `shots` set reached 397 s
of a 360 s budget with it, so it SPLIT — `shots` is the world and behaviour lanes' pictures (211 s),
`transport` is T1–T4's (187 s) — which is M2's rule firing for the third time.*

## T5 — Ranks read, city hall, the airport — A69 — **BUILT**: `slice-T5a` (the engine, era 9) and `slice-T5b` (the airfield)

*T5b as built. `client/world/airfield.js` is the whole layout — runway, taxiway, apron, centreline
dashes, threshold combs, apron lights and the centreline the aircraft flies — as one pure function
over a building record, in metres. Three things read it: the L2 silhouette (through the shared
`BANDS`), the L3 asphalt, and `client/life/plane.js`. It takes **no frontage**: ruling 044's
consequence, and the slice had to take it one step further than the ruling did — a shape with an
`axis` is not `civicSpin`-ed either, because a 6×4 terminal turned a quarter turn to face a side
street squashes across the four-tile side while the ground under it cannot turn.*

*`client/render/airport-l3.js` never imports three, so the pass that feeds the baker is measured in
node rather than counted in a screenshot. It rides along with the lot-extras phase — a phase costs a
whole frame per chunk — and a field belongs to the chunk the building's CENTRE is in, which is the
rule the facades and the instanced kit already share (R2). Its surface sits on `max(lot.seat,
highest ground under the footprint)`: `airport.maxDrop` limits the drop in the engine and levels
nothing, and a lot is cut into the hill.*

*The aircraft is a cycle of straight legs with durations, posed by a pure function of one scalar, so
the same seconds in two step sizes land in the same place. It lands on the near threshold, turns off
at three quarters, taxis to the stand, waits `airport.turnaround`, taxis back and takes off over the
far threshold. The radar is the turbine's rotor about the other axis, still at t = 0 like every
other motion.*

*`tools/airport_shots.mjs` is the gate, in the `transport` set, and `shoot.html` gained `plane=` —
the cycle is 56 seconds and a frame is 1/60 s, so photographing a landing by DRAWING up to it is
three thousand frames.*

*As gated (T5b): suite 1,539 green twice; `quick` 415 s of 480, `render` 56/120, `budget` 271/360,
`transport` 207/300 with `airport_shots` at 20 s. `reports/smoke-T5-{cityhall,airport,plane}.png`.
Five defects on the way, four of them invisible to every count the gate makes — the loudest is that
`sink().quad` wound +x then +z faces DOWN, so the runway was in the baker and not in four aerial
shots, and `props-l3.js` has had the same winding since S3.*

## T5 — Ranks read, city hall, the airport — A69 — the ENGINE half **built 2026-09-26** as `slice-T5a`

*As built. `engine/unlock.js` is the whole rule and it has three readers, which is why it is a
module rather than a line in the reducer: `placeBuilding` refuses with a reason of its own
(`RESULT.LOCKED`, new, beside `RESULT.ALREADY_BUILT` for the hall's one-per-seat), the build menu
greys the entry with the rank where its price goes, and the deputy's `findSpotFor` answers "nowhere"
for a definition its rank cannot have — so it never issues a command it knows will be refused.*

*The rank is `state.quests.vars`, which is the REGION's and not the seat's. A69 says "the seat's
rank" and gamedesign §27.2 says the opposite in as many words — "unlocks belong to the room, not the
player… mayor rank never gates a building" — so the shared variable is the design's answer and a
per-seat rank would be a state schema change to implement the wrong one (Q122).*

*The airport is the first definition with an AXIS. `orientation` is validated in the reducer (0 or
1, and only for a definition carrying `orientable`) and then spent: the building record stores the
TURNED `w` and `h`, so nothing downstream has to remember that a 6×4 airport is sometimes 4×6, and
no hashed field was added. `T` turns the ghost, and so does a button — a key alone is a control a
phone does not have.*

*`needsFlat` reads `tiles.elevation` across the whole footprint, not at its corners: a hump in the
middle of six tiles is exactly what four corners cannot see. `airport.maxDrop` is 6 units — three
metres at the renderer's relief step — which on a rolling 64×64 leaves about one 6×4 site in ten and
on a hilly one almost none. Measured before it was chosen: p10 5–7 rolling, max 8 flat, min 4–6
hilly.*

*`gate: "air"` needs no way out — the sky reaches every edge — so an airport is dead only for the two
reasons any building is, and the reasons list gained nothing. Its terms are the largest there are and
it is the only gate with a `landingFee`: a flat monthly sum, so a live airport in an empty region
still earns.*

*Noise is the first pollution source with a RADIUS (`noiseRadius`, linear falloff from the centre,
zero at the edge). Everything else is a footprint and a two-pass blur.*

*Two civic shapes went in with it, because `test/civic-spec.test.js` pins the table against the
catalogue: a hall with a portico and a clock cupola, and a terminal, a tower and a dark runway slab
that reads from the air. `civicVariant` is an index into the SORTED list, so both are new pools and
every other definition's index moved — derived per run, nothing persisted.*

*Not in it: the runway and taxiway ribbons with their markings, the apron lights, the radar that
turns, `client/life/plane.js` and `reports/smoke-T5-*`. That is T5b, which also needs a rank lever in
`tools/shoot.html` — at rank 0 the harness cannot place the thing it has to photograph. Not
`index.html`: the rank is HASHED state, and a URL that writes hashed state is a desync in a room,
which `?life=0` and `?lock=0` are not.*

*And T5b has a rotation to reconcile that T5a could leave alone. A civic shape is authored in unit
space and `turnMass` rotates it by the lot's FRONTAGE — which street it faces — while the
orientation rotates the footprint. For every other building those agree because the footprint is
square or nearly so; for a 6×4 airport they are two different axes, so the runway ribbons have to
follow `w > h` and not the frontage. The L2 slab in `civic-spec.js` stretches with the lot and reads
either way, which is why the picture is not wrong today, only unspecific.*

*The rank-3 milestone is a new quest (`the-city-hall`, objective `civic >= 1`, the measure added
beside `amenities` so it reads the catalogue's category rather than a definition by name). The
existing population route to rank 3 was LEFT IN: gating it behind a hall the deputy never builds
would quietly take 4,000 from every deputy city that reaches 2,000 people, which is a balance change
wearing a progression change's clothes (Q123).*

*As gated (T5a): `test/unlock.test.js` 11 green and `test/airport.test.js` 15; `ui_smoke` gained four
checks and is 176; `quick` 409 s of 480, `render` 57/120, `budget` 272/360, `sim` 593/900. The `sim`
set is what found that **era 8's report had been void for two commits** — P87 re-mixed the deputy's
own stream, so every deputy city moved. Three 60-game arms say it was not this slice: with and
without T5a are byte-identical, and the tree that wrote era 8's report is not. Era **9**,
`reports/balance-era9.md`, 200 games a configuration.*

## T5 — Ranks read, city hall, the airport (M engine, M renderer) — A69

**Goal.** The unlock field means something, and the top of the progression is a building.

**Do.**
- `placeBuilding` refuses a definition whose `unlock` is above the seat's rank (the quests'
  `rank` variable); the build menu greys it with the rank named; the deputy respects it.
- `cityHall`, 3×3, one per seat, `unlock: 2`, whose placement is the rank-3 milestone (a quest
  reward already sets rank — wire the two).
- `airport`, 6×4 with a runway axis: `placeBuilding` gains an `orientation` field (validated);
  the footprint's corner heights within `road.maxGrade`; power, road access; a noise radius on
  `tiles.pollution` like a coal plant's; `gate: "air"` with the largest terms and a landing fee;
  `unlock: 3`; cost and upkeep at the top of the table.
- Renderer: terminal hall, a tower with a turning radar (S6), runway and taxiway ribbons with
  markings, apron lights at night, a plane in `client/life/plane.js` — approach from the edge on
  the runway axis, land, taxi, take off — one at a time, a rate per second.

**Tests first.** `test/unlock.test.js`: a locked definition is refused at rank 1 and accepted at
its rank; the deputy never places a locked one. `test/airport.test.js`: orientation validated;
a sloped footprint refused; the noise appears in the pollution pass. **Gate.** `sim` set; `render`
set; `reports/smoke-T5-{cityhall,airport,plane}.png`.

## T6 — Leisure and education coverage — A67, A70 — **BUILT 2026-10-02** as `slice-T6` (era 10, the layers re-pinned)

*As built. `tiles.leisure` and `tiles.education` are hashed layers — the first coverage fields with
layers of their own, where fire, police and health are computed into scratch and folded in. They
have layers because they are drawn as overlays and read by the inspector, and a field that lives
inside one monthly pass can be neither.*

*`coverage` is a new catalogue field: the layer a building deposits into, where `service` is the
DEPARTMENT it belongs to. The same word for the three departments; a park has the first without the
second, because a park is not a department and `countBy(state, "service")` counts departments for
the quests. Park and marina gained `coverage: "leisure"` without becoming service buildings.*

*They reach the city twice: `civic.amenityValueDivisor` adds them to land value beside the three
departments, and `civic.amenityDemand` puts their average over DEVELOPED land into the residential
pool — the average over the whole region is a rounding error however good the parks are, which is
the lesson era 1 learnt about pollution.*

*The deputy builds a school every `deputy.buildingsPerSchool` buildings and a plaza every
`buildingsPerPlaza`. Without it every sweep in the project would have measured a town that reads
zero on two of its five layers, which is exactly what B1a found about the fire service.*

*Thirteen overlays now, and §16 of the design was amended in the same slice: an overlay list is a
design statement. The two new ones are the only overlays where MORE is better, so they read through
`plenty()` rather than `severity()` — written out rather than inverting the other helper, because a
reader of a band table should not have to invert anything in their head.*

## T6 — Leisure and education coverage (L) — A67, A70

**Goal.** Two systems the landmark table keeps asking for, in the fire/police/health shape.

**Do.** Two coverage layers (`tiles.leisure`, `tiles.education`) — hashed, re-pinned — with a
funding row each in §9.4; leisure fed by parks, the marina, stadium, plaza and library, education
by school and university; both feed desirability and demand (`landValuePass`, `computeDemand`).
Buildings: `stadium` 4×4, `school` 2×2, `plaza` 2×2, `library` 2×2, `university` 4×4 (`unlock: 4`).
Overlays for both (ruling 041), inspector rows, i18n. The deputy's doctrines learn all five.

**Tests first.** `test/coverage.test.js`: each layer decays with distance as the others do; a
school raises the growth odds of homes in range; `copyState`, the hash list in both files.
**Gate.** `sim` set on a new era — this is the item that changes balance most — with the sweep's
per-configuration means before and after; `render` set with the five kits.

## T7 — The cheap rows — A70 — **BUILT 2026-10-02** as `slice-T7` (era 11)

*As built. Five rows and five deputy considerations, which is what makes it an era rather than a
catalogue edit. Two of the five were specified in terms of fields nothing reads — `storage` on the
water tower and `capacity` on the hospital (Q119, and `capacity` found by P92) — so the reservoir
PRODUCES water rather than storing it and the headquarters are a bigger radius with no capacity.
Adding a dead field to two more buildings is how `landValueBonus` reached four.*

*`noiseRadius` became `pollutionRadius`: the waste facility is T5's airport with the sign the other
way round, and one idea should have one name. Its negative source falls off linearly from the centre
exactly as the airport's positive one does.*

*The headquarters are `unlock: 0`. A definition above the seat's rank is invisible to the DEPUTY as
well as to the player — `findSpotFor` answers "nowhere" (T5a) — so a rank on an everyday service
building is a building no headless city ever has, and the progression is the city hall and the
airport.*

*As gated (T7): suite 1,557 green twice; `sim` 763 s of 900 on era 11, `quick` 433/480, `render`
59/120. `reports/smoke-S1-{clinic,policeHQ,fireHQ,reservoir,wasteFacility}.png` — that tool's own
name, because `civic_shots` owns the per-definition picture and T7 taught it to FAIL when nothing
was placed. It had been photographing an empty road for every 1×1 definition since T2 put rock on
seed 1003's x = 5.*

## T7 — The cheap rows (S engine, M renderer) — A70

**Goal.** Content that costs a row and a kit each.

**Do.** `clinic` 1×1 (health, small radius), `policeHQ` 3×3 and `fireHQ` 3×3 (larger radius and
capacity), `reservoir` 2×2 (storage, like the tower), `wasteFacility` 2×2 (a negative pollution
source with a radius, summed by the pollution pass as any source is). Five rows in
`data/buildings.json`, five deputy considerations, five kits through S1's pattern, i18n.

**Tests first.** `test/catalogue.test.js` mirror; `test/civic.test.js`: the waste facility lowers
pollution in range. **Gate.** `sim` set; `render` set; `reports/smoke-T7-<def>.png`, five.

## Order

**This lane is finished, 2026-10-08.** T1–T7 are built, eras 5–11.

**T7 → T1 + T2 (one re-pin) → T3 → T4 → T5 → T6.** The cheap rows first because they are a
week's visible content for a day's work and exercise S1's kit pattern; the avenue and rail together
because they share the re-pin; the water after rail because the ferry is the station again on a
shore; ranks and the airport after that; leisure and education last because they re-tune the
whole balance and want their own era.

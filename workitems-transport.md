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

## T1 — The avenue (L) — A60

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
mode row. `test/lanes.test.js`: two lanes each way on an avenue corridor. **Gate.** `sim` set on a
new era (`reports/balance-era2.md`); `traffic_gate 200 25` re-baselined and the dev-log carries
both; `render` set; `reports/smoke-T1-{avenue,junction}.png` from the pavement and from `city 20t`.

## T2 — Rail and the station, in the engine (L) — A65, A66

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

## T3 — Rail drawn (M)

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

## T7 — The cheap rows (S engine, M renderer) — A70

**Goal.** Content that costs a row and a kit each.

**Do.** `clinic` 1×1 (health, small radius), `policeHQ` 3×3 and `fireHQ` 3×3 (larger radius and
capacity), `reservoir` 2×2 (storage, like the tower), `wasteFacility` 2×2 (a negative pollution
source with a radius, summed by the pollution pass as any source is). Five rows in
`data/buildings.json`, five deputy considerations, five kits through S1's pattern, i18n.

**Tests first.** `test/catalogue.test.js` mirror; `test/civic.test.js`: the waste facility lowers
pollution in range. **Gate.** `sim` set; `render` set; `reports/smoke-T7-<def>.png`, five.

## Order

**T7 → T1 + T2 (one re-pin) → T3 → T4 → T5 → T6.** The cheap rows first because they are a
week's visible content for a day's work and exercise S1's kit pattern; the avenue and rail together
because they share the re-pin; the water after rail because the ferry is the station again on a
shore; ranks and the airport after that; leisure and education last because they re-tune the
whole balance and want their own era.

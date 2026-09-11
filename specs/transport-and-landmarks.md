# Transport links and landmark buildings — a design study

*Written 2026-09-11 from Kjell's P61: a train station with a line off the map bringing people in,
ferries and boats on any larger body of water with a small-boat harbour as a rest-and-relaxation
bonus, an airport as a building bringing people and commerce, and "any other buildings from other
building games that are relevant". This is analysis and design only — **nothing here is
implemented** — written so the questions at the end can be answered in one batch and the lanes at
the end can be handed over as work items. It reads against `specs/gamedesign.md` §7–§9, §11.7 and
§25–26, `specs/plan.md` §2.4–2.6, `specs/referencedata.md` §5.1, §7.2 and §9.2, and the engine as it
is at `a4f1c7b`.*

## 0. What the engine can and cannot absorb

Everything below is judged against five constraints that are already rulings, because a transport
feature that breaks one of them is not a feature:

1. **`engine/` is integer, pure, I/O-free and Lua-portable** (ruling 004). No floats, no `new`, no
   `Map`. A boat's position is a renderer fact; a ferry's *effect* is an integer in state.
2. **Hashed state changes are a deliberate two-file act plus a fixture re-pin** (plan §2.5).
   A new tile layer or a new building field is that. It is fine — the avenue (A60) already commits
   us to one — but every item below says whether it moves the hash, because the ones that do
   should land together.
3. **RCI demand is one regional pool** allocated by attractiveness (plan §2.6), with three base
   constants standing in for the outside world. "Bringing people in from off the map" is a change
   to those constants and to nothing else, unless we choose to model an outside.
4. **The deputy plays everything** (plan §10 bonus 1): a building the AI mayor never places is a
   building the soak never measures, so each new definition needs a doctrine row.
5. **Life is renderer-local and never enters the hash** (ruling 037): trains, boats and planes are
   drawn from state and remember nothing the reducer needs.

And one fact about the map: **there is no outside today.** Roads stop at the edge and nothing
uses the edge. Rivers are carved from one edge to another and a coast floods in from one edge
(`engine/terrain.js`), so water already reaches the edge on `river` and `coastal` maps — which is
the only place a boat or a ferry could come *from*.

## 1. The Outside — one concept the three links share

The three links Kjell names (rail, ferry, air) are the same idea three times: **a gate through
which people and trade enter from beyond the map.** The reference simulator (§7.2, §5.1) does it
without modelling an outside at all: when the city is big enough it *caps* a valve until the
building exists — no airport, commercial growth stops at 100 jobs; no seaport, industrial stops;
no stadium, residential stops — and the building's presence lifts the cap. That is crude, but it
is the whole reason those three buildings are memorable in that game, and it costs nothing in
state.

The recommended model is one step richer and still cheap:

- **A gate is a building with a `gate` field** in the catalogue (`rail | sea | air | road`), and a
  gate is *live* when it is powered, road-connected and — for rail and sea — physically joined to
  the map edge (§2, §3).
- **Each live gate adds to the demand pool**: a residential term (people arrive), a commercial
  term (visitors spend) and an industrial term (freight), sized per kind (rail: people; sea:
  freight and leisure; air: people and commerce). Integer constants in `data/balance.json`, so
  the balance sweep tunes them like everything else.
- **Each live gate is a source and sink in the commuter pass**: its tiles seed the job field with
  a capacity (`engine/traffic.js` already seeds from commercial and industrial buildings), so
  roads to the station and the port carry real load, congestion happens where it would, and the
  renderer's traffic follows for free through `tiles.traffic`.
- **A gate yields income** as §9.1's "possible secondary income": a per-passenger or per-visitor
  fee, billed monthly with the utilities.
- **In a room, gates are per seat**, and a neighbour's station is reachable over the shared road
  graph like their hospital — the plan §2.6 shape, with no new rule.

Hash impact: a catalogue field (mirrored data, not state), new demand terms (balance data),
gate capacity in the commuter pass (no state), income (treasury, already hashed). **The Outside
adds no state of its own.** What adds state is the *rail* line (§2).

## 2. Rail and the station

**What it is.** A station building and a line of track to the map edge. Trains run on it.

**Two ways to build it, and the cheap one is wrong.**

- *Implied track*: the station must stand within N tiles of an edge and the renderer draws a
  straight track to it. No new layer, no new command. It reads as a toy the moment the straight
  line crosses a house, and it removes the one thing a rail line is for in a builder — routing it.
- *A rail layer*, the same shape as wire and pipe: `tiles.rail` holding the 4-neighbour mask plus
  the present bit (`engine/network.js`), a `placeRail` command with runs (`placeWire`'s twin), a
  permission-matrix row, bulldoze support, cost and upkeep per tile (the reference: 20 to build,
  2 a month), and the rule that a rail tile may share a tile with a road (a level crossing, which
  the reference models as `HRAILROAD`) but never with a building. **This is the recommendation.**
  Ruling 030's rule "any future network (rail, transit) draws a hub and arms from its mask" was
  written for it, and the renderer's corridor derivation (`client/world/corridors.js`) takes a
  layer name already.

**The station.** `railStation`, 3×2, category `transport`, gate `rail`, needs power and road
access, must touch a rail tile, and the line from it must reach an edge tile (a flood over
`tiles.rail` from the station, once per rail edit — cheap, and the "is it live" bit is derived,
not stored). Coverage radius raises land value like a park does today, because that is what a
station does to a neighbourhood. One per seat at first; a second station on the same line is a
later question.

**What it does.** Live: +residential and +commercial demand terms; a commuter sink with capacity
(so a station on a cul-de-sac jams it, which is right); a fare income. Dead (no line to the edge,
unpowered): a building with upkeep and nothing else — the inspector says why.

**What the renderer does.** Rail is a fourth corridor kind: a centreline polyline with a narrower
width, drawn as two rails and sleepers by the ribbon builder (E3), a level crossing where it
shares a road tile (barriers, a bar marking), a bridge deck over water like S4's. A **train** is
a `life/` mover on a single-track lane graph: two or three carriages, in from the edge, a stop at
the platform, out again — one train per line, at a rate per second (D7), hashed nothing. The
station kit through the baker (S1's pattern): a platform, a canopy, a footbridge, a clock.

**Hash impact.** A tile layer (`tiles.rail`), a command, a catalogue entry, balance constants.
**Fixtures re-pin**, once, together with the avenue (A60) — two layer additions in one re-pin
rather than two.

**Size.** L for the engine half (layer, command, permissions, deputy, traffic, income, tests,
re-pin), M for the renderer half (corridor kind, ribbon, crossing, train, station kit). Two slices.

## 3. Water: the harbour, the ferry, and boats

**Water bodies first.** Nothing today knows that a lake is a lake. A pure `waterBodies(state)`
— a flood fill over water tiles giving each body a size and whether it touches an edge — is the
one derivation every item here needs, and `engine/districts.js` already does the same fill for
land. It belongs in `engine/terrain.js` (the deputy needs it to place a harbour) with the renderer
reading the same function through the mirror rule. Derived from the terrain layer, so **no state**.

**The small-boat harbour (marina).** `marina`, 2×2 on a shore tile of a body of at least
`MARINA_MIN_BODY` tiles (a pond is not a harbour), category `amenity`. Kjell's brief is "rest and
relaxation bonus", and the game has no leisure system — parks add land value and cut pollution and
that is the whole of it. Two ways to give the marina an effect:

- *As a bigger park*: land value bonus over a larger radius, a small commercial demand term
  (visitors). No new system. **Recommended for the first version.**
- *A leisure coverage*: a fourth coverage layer beside fire, police and health, feeding
  desirability and residential demand, with parks, marina, stadium and plaza all contributing.
  It is the system §8 does not have and several buildings in §5 want; it is a new block map (a
  tile layer, hashed) and a balance pass. **The second version, and the right home for half of
  §5's list.** Recorded as a question rather than assumed.

**The ferry terminal.** `ferryTerminal`, 2×2 on the shore of a body that **touches a map edge**
(the Outside arrives by water) or, in a room, of a body another seat's terminal stands on. A gate
of kind `sea`: +residential and +commercial demand, a commuter sink, a fare. On a `river` map the
river reaches both edges, so a terminal on a riverbank is live; on `lakes` nothing is, and the
inspector says so before the player spends the money.

**A freight port** is the same building with an industrial term instead, the reference's seaport.
One catalogue entry with a `gate: "sea"` and a `freight: true` flag, or two entries — two, because
they look different and the deputy places them for different reasons.

**Boats.** All renderer-local: moored sailboats at the marina (instanced, static, hashed by slot),
two or three sailing on the body — a hash walk over water tiles at least two from any shore, at a
rate per second — and one ferry on a route terminal → edge tile and back, with a wake as a ribbon.
A cargo ship for the port. None of it enters the hash; `?life=0` freezes it.

**Hash impact.** Catalogue entries and balance constants only, unless leisure coverage is chosen
(one layer). **Size.** M for the engine half without leisure, L with; M for the renderer half.

## 4. The airport

**What it is.** The biggest building in the game and the top of the progression. The reference:
6×6, unlocked by the city needing it, planes and a helicopter from it, `airportPop` in the
assessed value at ten times a seaport.

**Placement.** `airport`, 6×4 with a runway axis (the command takes an orientation, as buildings
today do not — a new command field, validated), on ground within the grade limit (the same
`road.maxGrade` R3 uses, applied to the footprint's corner heights), road access, power, and a
noise radius that raises `tiles.pollution` as a coal plant does — so it wants to be at the edge of
town, which is where airports are. Cost and upkeep at the top of the table.

**Unlock.** §11.7 says ranks unlock civic buildings and `engine/catalogue.js` carries `unlock: 0`
on every entry — **and nothing reads it**. Quests set a `rank` variable (`engine/quests.js`), so
the machinery is half there: `placeBuilding` refuses a definition whose `unlock` is above the
seat's rank, the build menu greys it with the rank named, and the airport is the first entry
with `unlock: 3` (City Mayor). That is an omission worth closing whether or not the airport is
built.

**What it does.** A gate of kind `air`: the largest residential and commercial terms, a commuter
sink, a landing-fee income (§9.1's "landmark tourism"), and the noise. In the reference the
airport is what lets commercial growth continue past a cap; here it is a strong positive term in
a pool that has no caps, which is the same lever without the cliff.

**What the renderer does.** A terminal kit (a long low hall, a control tower with a rotating
radar — S6's motion), a runway and taxiway as wide ribbons with markings, apron lights at night,
and a **plane** as a `life/` mover: an approach from the edge along the runway axis, a landing, a
taxi to the apron, a take-off out — one at a time, a rate per second. A helicopter is the
reference's traffic-spotter and is not needed.

**Hash impact.** A catalogue entry, an orientation field on `placeBuilding`, balance constants,
the unlock check. **Size.** M engine, M renderer.

## 5. Other buildings from other builders — filtered

The question is not "what exists in other games" but "what plugs into a system this game has,
reads in a 3D city at 20 m a tile, and is worth the deputy learning to place". The table judges
each by the system it feeds, its hash cost, and whether it earns a place.

| Building | Size | Plugs into | Hash cost | Verdict |
|---|---|---|---|---|
| **Stadium** | 4×4 | leisure coverage (§3), residential demand; event-day traffic spike is a renderer-local flourish | none without leisure; one layer with | **yes**, with the leisure system — the reference's third cap building |
| **School / university** | 2×2 / 4×4 | a new *education* level per building raising `level` growth odds and commercial jobs; §7.6 lists the school | a building field or a coverage layer | **school yes** (coverage like health); university later, rank-gated |
| **Library, museum** | 2×2 | leisure or education coverage; museum as landmark tourism income | none extra once leisure exists | **later**, as content on top of leisure |
| **City hall** | 3×3 | §7.6 and §11.7: the rank building — placing it is the rank-3 milestone and it unlocks the next tier; one per seat | catalogue only | **yes**, cheap, and gives the ranks a place in the world |
| **Waste facility / recycling** | 2×2 | pollution sink — a negative pollution source with a radius, which the pollution pass already sums | catalogue only | **yes**, cheap, and the pollution overlay finally has a lever besides parks |
| **Emergency shelter** | 2×2 | disaster relief — damage in radius repaired faster or paid by the region | catalogue only | **later**, after fire grows (A62) |
| **Clinic, police HQ, fire HQ** | 1×1 / 3×3 | the coverage system, smaller and larger radii and costs | catalogue only | **yes**, trivially — three rows in `data/buildings.json` and three kits |
| **Bus depot and stops** | 2×2 + 1×1 | §7.3 "later"; needs a transit model in the commuter pass (a stop shortens commutes) | a stop layer or flag | **later**, after rail — rail is the same problem with a clearer edge |
| **Nuclear plant** | 4×4 | power, with a disaster kind (meltdown) | catalogue plus a disaster kind | **maybe**, rank-gated; the coal/gas/wind/solar ladder already covers the power choice |
| **Hydro dam** | 3×2 across a river | power from a river corridor; needs the water-body derivation and a "river" body kind | catalogue only, plus placement rule | **later**, a good rank-4 reward on `river` maps |
| **Reservoir** | 2×2 | §7.5 storage — `waterTower` already carries `storage`; a bigger one | catalogue only | **yes**, one row |
| **Farm / rural zone** | zone | a fourth zone with its own demand and buildings — a large engine change | zone constant, demand pool, development | **no** for now; S2's countryside gives the *picture* of farmland at no cost |
| **Marina, ferry, port, airport, station** | §2–4 | gates and leisure | as above | **yes** — the brief |
| **Plaza / market square** | 2×2 | leisure coverage; commercial demand; pedestrians love it (B5's shoppers) | none extra | **yes with leisure**, and the crowd makes it read |
| **Lighthouse, monument, cathedral, radio mast** | 1×1 / 2×2 | §11.7 "special landmarks", decorative rewards; landmark tourism income | catalogue only | **later**, as quest rewards — content, not systems |
| **Cemetery, zoo, casino, prison** | 2×2+ | each wants a system that does not exist (death, animals, vice, crime as a stock) | new systems | **no** |

Two systems recur in the "yes" column and are the real design decisions: a **leisure coverage**
(marina, stadium, plaza, library, park) and an **education coverage** (school, university).
Both are the fire/police/health shape — a coverage layer, a radius, a funding row in §9.4 — and
both feed desirability and demand. They are one engine slice each, and everything in the table
marked "with leisure" is content on top.

## 6. Where it lands in the code

| | engine | renderer |
|---|---|---|
| Rail | `tiles.rail` layer; `placeRail`; permission row; `network.js` a third kind; deputy; commuter sink; upkeep | corridor kind `rail`; two-rail ribbon and sleepers; level crossing; bridge; train mover; station kit |
| Gates | catalogue `gate` field; live-gate derivation; demand terms; fare income; deputy | station, terminal, port, airport kits; passengers at the platform (B5 role) |
| Water bodies | `waterBodies()` in `terrain.js`, mirrored | boats, ferry, wake; marina kit; moorings |
| Airport | orientation on `placeBuilding`; grade check; noise; unlock check | terminal, tower, runway ribbons, plane mover, apron lights |
| Leisure / education | coverage layers; funding rows; desirability terms | overlays (ruling 041), inspector rows, kits |
| Unlock ranks | `placeBuilding` reads `def.unlock` against the seat's rank | build menu greys with the rank named (ruling 027) |

Every engine row above is a `sim` gate run (`disaster_soak`, `traffic_gate`, `sim_sweep`) and a
balance era; every renderer row is a `render` run and a budget re-measure.

## 7. Suggested lanes

Named T for transport, after the behaviour lane, because the avenue (A60) opens the same machinery:

| Slice | What | Size | Hash |
|---|---|---|---|
| **T1** | The avenue (A60): second road kind, capacity, ribbon width, markings; fixture re-pin | L | yes |
| **T2** | Rail: layer, command, station, live-gate rule, commuter sink, fare; re-pinned with T1 | L | yes |
| **T3** | Rail drawn: corridor, ribbon, crossing, bridge, train, station kit | M | no |
| **T4** | Water bodies, marina (as a bigger park), ferry terminal and port as gates; boats, ferry, ship | M + M | no |
| **T5** | Unlock ranks read; city hall; airport with orientation, noise, plane | M + M | small (orientation field) |
| **T6** | Leisure and education coverage; stadium, school, plaza, library; funding rows | L | yes (two layers) |
| **T7** | The cheap catalogue rows: clinic, police HQ, fire HQ, reservoir, waste facility, and their kits | S + M | no |

T1 and T2 share one re-pin. T7 can go any time and is the quickest visible result. T6 is the
one that changes the game's balance most and wants its own sweep era.

## 8. Questions for Kjell — **all six answered as assumed, 2026-09-11 (P62, A65–A70)**

*Kept as written, because the assumptions are now the decisions. The lane is `workitems-transport.md`.*

- **Q87 — The Outside.** Model the beyond-the-map as demand terms and commuter sinks (§1), with no
  state of its own? *Assumed yes.* The alternative — an explicit outside region with its own
  population — is a second simulation.
- **Q88 — Rail as a drawn network** (`tiles.rail`, routed by the player, level crossings) rather
  than an implied line from the station to the edge? *Assumed drawn.*
- **Q89 — The harbour's effect.** A bigger park first (land value and a visitor term), with a
  leisure coverage system as a later slice that stadium, plaza and library then share? *Assumed
  yes, in that order.*
- **Q90 — Freight.** A separate port for industry beside the ferry terminal for people, or one
  building doing both? *Assumed two buildings.*
- **Q91 — The airport's gate.** Rank-locked at City Mayor (rank 3) through the unlock field
  nothing reads today, with city hall as the building that marks the rank? *Assumed yes.*
- **Q92 — Which of §5's "yes" rows are wanted first?** *Assumed: T7's cheap rows and city hall
  early; stadium, school and plaza with the leisure/education lane; nothing from the "no" column.*
